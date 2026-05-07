use crate::instructions::{
    identity_stake_activity::sync_lamport_stake_activity,
    slash_with_authority::transfer_lamport_slash,
};
use crate::state::{SlashMarker, StakeAccount};
use crate::StakeSlashedWithVerdict;
use anchor_lang::prelude::*;
use dispute_resolver::state::DisputeVerdict;
use receipt_emitter::state::ReceiptRecord;
use trust_substrate_core::{
    TrustSubstrateError, AGENT_LOST_OUTCOME, DISPUTE_KIND, SLASH_MARKER_SEED, STAKE_SEED,
    TREASURY_VAULT_SEED, TRUST_MODE_VERDICT, VERDICT_CLASS_SAFETY, VERDICT_SEED,
};

pub fn handler(ctx: Context<SlashWithVerdict>) -> Result<()> {
    require!(
        ctx.accounts.stake.trust_mode == TRUST_MODE_VERDICT,
        TrustSubstrateError::StakeTrustModeMismatch
    );
    require_keys_eq!(
        ctx.accounts.verdict.adjudicator,
        ctx.accounts.adjudicator.key(),
        TrustSubstrateError::VerdictAdjudicatorMismatch
    );
    require_keys_eq!(
        ctx.accounts.verdict.target_identity,
        ctx.accounts.stake.identity,
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
        ctx.accounts.stake.identity,
        TrustSubstrateError::StakeReceiptIdentityMismatch
    );

    let amount = ctx.accounts.verdict.slash_amount;
    require!(
        amount <= ctx.accounts.stake.amount,
        TrustSubstrateError::StakeInsufficient
    );
    let was_active = ctx.accounts.stake.amount > 0;
    let treasury_info = ctx.accounts.treasury_vault.to_account_info();
    ctx.accounts.stake.amount = ctx
        .accounts
        .stake
        .amount
        .checked_sub(amount)
        .ok_or(TrustSubstrateError::StakeInsufficient)?;
    ctx.accounts.stake.slashed_total = ctx
        .accounts
        .stake
        .slashed_total
        .checked_add(amount)
        .ok_or(TrustSubstrateError::StakeAmountOverflow)?;
    if ctx.accounts.stake.pending_unstake_amount > ctx.accounts.stake.amount {
        ctx.accounts.stake.pending_unstake_amount = ctx.accounts.stake.amount;
    }
    if ctx.accounts.stake.pending_unstake_amount == 0 {
        ctx.accounts.stake.unstake_unlocks_at = 0;
    }
    if was_active && ctx.accounts.stake.amount == 0 {
        sync_lamport_stake_activity(
            ctx.accounts.identity_registry_program.key(),
            ctx.accounts.stake.to_account_info(),
            ctx.accounts.identity.to_account_info(),
            ctx.accounts.stake.identity,
            ctx.accounts.stake.bump,
            false,
        )?;
    }
    transfer_lamport_slash(
        &ctx.accounts.stake.to_account_info(),
        &treasury_info,
        amount,
    )?;

    let marker = &mut ctx.accounts.slash_marker;
    marker.stake = ctx.accounts.stake.key();
    marker.dispute_receipt = ctx.accounts.dispute_receipt.key();
    marker.verdict = ctx.accounts.verdict.key();
    marker.amount = amount;
    marker.bump = ctx.bumps.slash_marker;

    emit!(StakeSlashedWithVerdict {
        identity: ctx.accounts.stake.identity,
        adjudicator: ctx.accounts.adjudicator.key(),
        dispute_receipt: ctx.accounts.dispute_receipt.key(),
        verdict: ctx.accounts.verdict.key(),
        amount,
        trust_mode: ctx.accounts.stake.trust_mode,
        slot: Clock::get()?.slot,
    });

    Ok(())
}

#[derive(Accounts)]
pub struct SlashWithVerdict<'info> {
    #[account(mut)]
    pub adjudicator: Signer<'info>,
    #[account(mut, address = stake.identity @ TrustSubstrateError::StakeIdentityMismatch)]
    /// CHECK: The address is pinned to the stake identity; identity_registry
    /// deserializes and validates the account during the CPI.
    pub identity: UncheckedAccount<'info>,
    #[account(
        mut,
        seeds = [STAKE_SEED, stake.identity.as_ref()],
        bump = stake.bump
    )]
    pub stake: Account<'info, StakeAccount>,
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
            stake.key().as_ref(),
            dispute_receipt.key().as_ref()
        ],
        bump
    )]
    pub slash_marker: Account<'info, SlashMarker>,
    #[account(
        mut,
        seeds = [TREASURY_VAULT_SEED],
        bump,
        seeds::program = dispute_resolver::ID,
        owner = dispute_resolver::ID
    )]
    /// CHECK: The address and owner constraints pin this to the dispute
    /// resolver treasury PDA. The foreign program owns the account data.
    pub treasury_vault: UncheckedAccount<'info>,
    pub identity_registry_program: Program<'info, identity_registry::program::IdentityRegistry>,
    pub system_program: Program<'info, System>,
}
