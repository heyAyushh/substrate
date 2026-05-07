use crate::instructions::slash_token_with_authority::apply_token_slash;
use crate::state::{SlashMarker, TokenStakeAccount};
use crate::TokenStakeSlashedWithVerdict;
use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenInterface};
use dispute_resolver::state::DisputeVerdict;
use receipt_emitter::state::ReceiptRecord;
use trust_substrate_core::{
    TrustSubstrateError, AGENT_LOST_OUTCOME, DISPUTE_KIND, SLASH_MARKER_SEED, TOKEN_STAKE_SEED,
    TOKEN_TREASURY_VAULT_SEED, TRUST_MODE_VERDICT, VERDICT_CLASS_SAFETY, VERDICT_SEED,
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

    apply_token_slash(
        &mut ctx.accounts.token_stake,
        &ctx.accounts.vault,
        &ctx.accounts.treasury_token_vault,
        &ctx.accounts.mint,
        &ctx.accounts.token_program,
        amount,
    )?;

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
    pub token_stake: Account<'info, TokenStakeAccount>,
    pub dispute_receipt: Account<'info, ReceiptRecord>,
    #[account(
        seeds = [VERDICT_SEED, dispute_receipt.key().as_ref()],
        bump = verdict.bump,
        seeds::program = dispute_resolver::ID
    )]
    pub verdict: Account<'info, DisputeVerdict>,
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
    pub slash_marker: Account<'info, SlashMarker>,
    #[account(address = token_stake.mint @ TrustSubstrateError::StakeTokenMintMismatch)]
    pub mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(
        mut,
        address = token_stake.vault @ TrustSubstrateError::StakeTokenVaultMismatch
    )]
    /// CHECK: The address is pinned to the vault recorded on the stake account,
    /// and the SPL Token program validates it as a token account during transfer.
    pub vault: UncheckedAccount<'info>,
    #[account(
        mut,
        seeds = [TOKEN_TREASURY_VAULT_SEED, mint.key().as_ref()],
        bump
    )]
    /// CHECK: The address is the program-derived token treasury vault for this
    /// mint; the SPL Token program validates the account and mint on receipt.
    pub treasury_token_vault: UncheckedAccount<'info>,
    #[account(address = token_stake.token_program @ TrustSubstrateError::StakeTokenProgramMismatch)]
    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}
