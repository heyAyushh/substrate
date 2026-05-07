use crate::instructions::{
    identity_stake_activity::sync_token_stake_activity,
    slash_token_with_authority::transfer_token_slash,
};
use crate::state::{SlashMarker, TokenStakeAccount};
use crate::TokenStakeSlashedWithVerdict;
use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};
use dispute_resolver::state::DisputeVerdict;
use receipt_emitter::state::ReceiptRecord;
use trust_substrate_core::{
    TrustSubstrateError, AGENT_LOST_OUTCOME, DISPUTE_KIND, SLASH_MARKER_SEED, TOKEN_STAKE_SEED,
    TOKEN_TREASURY_VAULT_SEED, TREASURY_VAULT_SEED, TRUST_MODE_VERDICT, VERDICT_CLASS_SAFETY,
    VERDICT_SEED,
};

pub fn handler(ctx: Context<SlashTokenWithVerdict>) -> Result<()> {
    require!(
        ctx.accounts.token_stake.trust_mode == TRUST_MODE_VERDICT,
        TrustSubstrateError::StakeTrustModeMismatch
    );
    require_keys_eq!(
        ctx.accounts.verdict.adjudicator,
        ctx.accounts.adjudicator.key(),
        TrustSubstrateError::VerdictAdjudicatorMismatch
    );
    require_keys_eq!(
        ctx.accounts.verdict.target_identity,
        ctx.accounts.token_stake.identity,
        TrustSubstrateError::VerdictTargetIdentityMismatch
    );
    require_keys_eq!(
        ctx.accounts.verdict.dispute_receipt,
        ctx.accounts.dispute_receipt.key(),
        TrustSubstrateError::VerdictDisputeReceiptMismatch
    );
    require!(
        ctx.accounts.verdict.outcome == AGENT_LOST_OUTCOME,
        TrustSubstrateError::VerdictOutcomeNotSlashable
    );
    require!(
        ctx.accounts.verdict.slash_amount > 0,
        TrustSubstrateError::StakeAmountMustBePositive
    );
    if ctx.accounts.verdict.class != VERDICT_CLASS_SAFETY {
        require!(
            ctx.accounts.verdict.stale_after_slot > 0,
            TrustSubstrateError::VerdictStaleWindowMissing
        );
        require!(
            Clock::get()?.slot <= ctx.accounts.verdict.stale_after_slot,
            TrustSubstrateError::VerdictStale
        );
    }
    require!(
        ctx.accounts.dispute_receipt.kind == DISPUTE_KIND,
        TrustSubstrateError::VerdictReceiptKindMismatch
    );
    require_keys_eq!(
        ctx.accounts.dispute_receipt.identity,
        ctx.accounts.token_stake.identity,
        TrustSubstrateError::StakeReceiptIdentityMismatch
    );
    require_keys_eq!(
        ctx.accounts.token_stake.token_program,
        ctx.accounts.token_program.key(),
        TrustSubstrateError::StakeTokenProgramMismatch
    );

    let amount = ctx.accounts.verdict.slash_amount;
    require!(
        amount <= ctx.accounts.token_stake.amount,
        TrustSubstrateError::StakeInsufficient
    );

    let was_active = ctx.accounts.token_stake.amount > 0;
    ctx.accounts.token_stake.amount = ctx
        .accounts
        .token_stake
        .amount
        .checked_sub(amount)
        .ok_or(TrustSubstrateError::StakeInsufficient)?;
    ctx.accounts.token_stake.slashed_total = ctx
        .accounts
        .token_stake
        .slashed_total
        .checked_add(amount)
        .ok_or(TrustSubstrateError::StakeAmountOverflow)?;
    if ctx.accounts.token_stake.pending_unstake_amount > ctx.accounts.token_stake.amount {
        ctx.accounts.token_stake.pending_unstake_amount = ctx.accounts.token_stake.amount;
    }
    if ctx.accounts.token_stake.pending_unstake_amount == 0 {
        ctx.accounts.token_stake.unstake_unlocks_at = 0;
    }
    transfer_token_slash(
        &ctx.accounts.token_stake,
        &ctx.accounts.vault,
        &ctx.accounts.treasury_token_vault,
        &ctx.accounts.mint,
        &ctx.accounts.token_program,
        amount,
    )?;
    if was_active && ctx.accounts.token_stake.amount == 0 {
        sync_token_stake_activity(
            ctx.accounts.identity_registry_program.key(),
            ctx.accounts.token_stake.to_account_info(),
            ctx.accounts.identity.to_account_info(),
            ctx.accounts.token_stake.identity,
            ctx.accounts.token_stake.scope,
            ctx.accounts.token_stake.mint,
            ctx.accounts.token_stake.bump,
            false,
        )?;
    }

    let marker = &mut ctx.accounts.slash_marker;
    marker.stake = ctx.accounts.token_stake.key();
    marker.dispute_receipt = ctx.accounts.dispute_receipt.key();
    marker.verdict = ctx.accounts.verdict.key();
    marker.amount = amount;
    marker.bump = ctx.bumps.slash_marker;

    emit!(TokenStakeSlashedWithVerdict {
        identity: ctx.accounts.token_stake.identity,
        adjudicator: ctx.accounts.adjudicator.key(),
        dispute_receipt: ctx.accounts.dispute_receipt.key(),
        verdict: ctx.accounts.verdict.key(),
        scope: ctx.accounts.token_stake.scope,
        mint: ctx.accounts.token_stake.mint,
        amount,
        trust_mode: ctx.accounts.token_stake.trust_mode,
        slot: Clock::get()?.slot,
    });

    Ok(())
}

#[derive(Accounts)]
pub struct SlashTokenWithVerdict<'info> {
    #[account(mut)]
    pub adjudicator: Signer<'info>,
    #[account(mut, address = token_stake.identity @ TrustSubstrateError::StakeIdentityMismatch)]
    /// CHECK: The address is pinned to the token stake identity;
    /// identity_registry deserializes and validates it during the CPI.
    pub identity: UncheckedAccount<'info>,
    #[account(
        mut,
        seeds = [
            TOKEN_STAKE_SEED,
            token_stake.identity.as_ref(),
            token_stake.scope.as_ref(),
            token_stake.mint.as_ref()
        ],
        bump = token_stake.bump
    )]
    pub token_stake: Box<Account<'info, TokenStakeAccount>>,
    pub dispute_receipt: Box<Account<'info, ReceiptRecord>>,
    #[account(
        seeds = [VERDICT_SEED, dispute_receipt.key().as_ref()],
        bump = verdict.bump,
        seeds::program = dispute_resolver::ID
    )]
    pub verdict: Box<Account<'info, DisputeVerdict>>,
    #[account(
        init,
        payer = adjudicator,
        space = 8 + SlashMarker::INIT_SPACE,
        seeds = [
            SLASH_MARKER_SEED,
            token_stake.key().as_ref(),
            dispute_receipt.key().as_ref()
        ],
        bump
    )]
    pub slash_marker: Box<Account<'info, SlashMarker>>,
    #[account(address = token_stake.mint @ TrustSubstrateError::StakeTokenMintMismatch)]
    pub mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(
        mut,
        address = token_stake.vault @ TrustSubstrateError::StakeTokenVaultMismatch,
        token::mint = mint,
        token::authority = token_stake,
        token::token_program = token_program
    )]
    pub vault: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        mut,
        seeds = [TOKEN_TREASURY_VAULT_SEED, mint.key().as_ref()],
        bump,
        token::mint = mint,
        token::token_program = token_program,
        constraint = treasury_token_vault.owner == token_treasury_authority_pda()
            @ TrustSubstrateError::StakeTokenTreasuryVaultMismatch
    )]
    pub treasury_token_vault: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(address = token_stake.token_program @ TrustSubstrateError::StakeTokenProgramMismatch)]
    pub token_program: Interface<'info, TokenInterface>,
    pub identity_registry_program: Program<'info, identity_registry::program::IdentityRegistry>,
    pub system_program: Program<'info, System>,
}

fn token_treasury_authority_pda() -> Pubkey {
    Pubkey::find_program_address(&[TREASURY_VAULT_SEED], &dispute_resolver::ID).0
}
