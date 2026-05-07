use anchor_lang::prelude::*;
use receipt_emitter::state::ReceiptRecord;
use trust_substrate_core::{
    is_valid_trust_mode, TrustSubstrateError, DISPUTE_RESOLVED_KIND, SLASH_MARKER_SEED, STAKE_SEED,
    TREASURY_VAULT_SEED, TRUST_MODE_AUTHORITY,
};

use crate::instructions::identity_stake_activity::sync_lamport_stake_activity;
use crate::state::{SlashMarker, StakeAccount};
use crate::StakeSlashedByAuthority;

pub fn handler(ctx: Context<SlashWithAuthority>, amount: u64) -> Result<()> {
    require!(amount > 0, TrustSubstrateError::StakeAmountMustBePositive);
    require!(
        is_valid_trust_mode(ctx.accounts.stake.trust_mode),
        TrustSubstrateError::InvalidTrustMode
    );
    require_keys_eq!(
        ctx.accounts.stake.slash_authority,
        ctx.accounts.slash_authority.key(),
        TrustSubstrateError::StakeSlashAuthorityMismatch
    );
    require!(
        ctx.accounts.stake.trust_mode == TRUST_MODE_AUTHORITY,
        TrustSubstrateError::StakeTrustModeMismatch
    );
    require_keys_eq!(
        ctx.accounts.dispute_receipt.identity,
        ctx.accounts.stake.identity,
        TrustSubstrateError::StakeReceiptIdentityMismatch
    );
    require!(
        ctx.accounts.dispute_receipt.kind == DISPUTE_RESOLVED_KIND,
        TrustSubstrateError::StakeReceiptKindMismatch
    );
    require!(
        ctx.accounts.slash_marker.dispute_receipt == Pubkey::default(),
        TrustSubstrateError::StakeSlashAlreadyApplied
    );
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
    marker.verdict = Pubkey::default();
    marker.amount = amount;
    marker.bump = ctx.bumps.slash_marker;

    emit!(StakeSlashedByAuthority {
        identity: ctx.accounts.stake.identity,
        slash_authority: ctx.accounts.slash_authority.key(),
        trust_mode: ctx.accounts.stake.trust_mode,
        dispute_receipt: ctx.accounts.dispute_receipt.key(),
        amount,
        slot: Clock::get()?.slot,
    });

    Ok(())
}

#[derive(Accounts)]
pub struct SlashWithAuthority<'info> {
    #[account(mut)]
    pub slash_authority: Signer<'info>,
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
        init,
        payer = slash_authority,
        space = 8 + SlashMarker::INIT_SPACE,
        seeds = [SLASH_MARKER_SEED, stake.key().as_ref(), dispute_receipt.key().as_ref()],
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

pub fn transfer_lamport_slash(
    stake_info: &AccountInfo<'_>,
    treasury_info: &AccountInfo<'_>,
    amount: u64,
) -> Result<()> {
    stake_info.sub_lamports(amount)?;
    treasury_info.add_lamports(amount)?;

    Ok(())
}
