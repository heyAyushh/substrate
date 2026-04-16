use crate::state::{SlashMarker, StakeAccount};
use anchor_lang::prelude::*;
use receipt_emitter::state::ReceiptRecord;
use trust_substrate_core::{TrustSubstrateError, SLASH_MARKER_SEED, STAKE_SEED};

pub fn handler(ctx: Context<SlashAlreadyApplied>) -> Result<()> {
    require_keys_eq!(
        ctx.accounts.slash_marker.stake,
        ctx.accounts.stake.key(),
        TrustSubstrateError::StakeSlashAlreadyApplied
    );
    require_keys_eq!(
        ctx.accounts.slash_marker.dispute_receipt,
        ctx.accounts.dispute_receipt.key(),
        TrustSubstrateError::StakeSlashAlreadyApplied
    );
    Ok(())
}

#[derive(Accounts)]
pub struct SlashAlreadyApplied<'info> {
    pub authority: Signer<'info>,
    #[account(
        seeds = [STAKE_SEED, stake.identity.as_ref()],
        bump = stake.bump
    )]
    pub stake: Account<'info, StakeAccount>,
    pub dispute_receipt: Account<'info, ReceiptRecord>,
    #[account(
        seeds = [
            SLASH_MARKER_SEED,
            stake.key().as_ref(),
            dispute_receipt.key().as_ref()
        ],
        bump = slash_marker.bump,
        has_one = stake @ TrustSubstrateError::StakeSlashAlreadyApplied,
        has_one = dispute_receipt @ TrustSubstrateError::StakeSlashAlreadyApplied
    )]
    pub slash_marker: Account<'info, SlashMarker>,
}
