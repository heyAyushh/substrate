use crate::state::{SlashMarker, StakeAccount};
use anchor_lang::prelude::*;
use receipt_emitter::state::ReceiptRecord;
use trust_substrate_core::{
    TrustSubstrateError, DISPUTE_RESOLVED_KIND, SLASH_MARKER_SEED, STAKE_SEED,
};

pub fn handler(ctx: Context<Slash>, amount: u64) -> Result<()> {
    require!(amount > 0, TrustSubstrateError::StakeAmountMustBePositive);
    require_keys_eq!(
        ctx.accounts.stake.slash_authority,
        ctx.accounts.slash_authority.key(),
        TrustSubstrateError::StakeSlashAuthorityMismatch
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

    let stake_info = ctx.accounts.stake.to_account_info();
    let treasury_info = ctx.accounts.treasury.to_account_info();

    **stake_info.try_borrow_mut_lamports()? = stake_info
        .lamports()
        .checked_sub(amount)
        .ok_or(TrustSubstrateError::StakeInsufficient)?;
    **treasury_info.try_borrow_mut_lamports()? = treasury_info
        .lamports()
        .checked_add(amount)
        .ok_or(TrustSubstrateError::StakeAmountOverflow)?;

    let marker = &mut ctx.accounts.slash_marker;
    marker.stake = ctx.accounts.stake.key();
    marker.dispute_receipt = ctx.accounts.dispute_receipt.key();
    marker.amount = amount;
    marker.bump = ctx.bumps.slash_marker;

    Ok(())
}

#[derive(Accounts)]
pub struct Slash<'info> {
    #[account(mut)]
    pub slash_authority: Signer<'info>,
    #[account(
        mut,
        seeds = [STAKE_SEED, stake.identity.as_ref()],
        bump = stake.bump
    )]
    pub stake: Account<'info, StakeAccount>,
    pub dispute_receipt: Account<'info, ReceiptRecord>,
    #[account(
        init_if_needed,
        payer = slash_authority,
        space = 8 + SlashMarker::INIT_SPACE,
        seeds = [
            SLASH_MARKER_SEED,
            stake.key().as_ref(),
            dispute_receipt.key().as_ref()
        ],
        bump
    )]
    pub slash_marker: Account<'info, SlashMarker>,
    /// CHECK: Treasury only receives lamports and is not read as program state.
    #[account(mut)]
    pub treasury: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}
