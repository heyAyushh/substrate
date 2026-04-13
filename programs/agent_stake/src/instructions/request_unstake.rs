use anchor_lang::prelude::*;
use trust_substrate_core::{TrustSubstrateError, STAKE_COOLDOWN_SLOTS, STAKE_SEED};

use crate::state::StakeAccount;
use crate::StakeUnstakeRequested;

pub fn handler(ctx: Context<RequestUnstake>, amount: u64) -> Result<()> {
    require!(amount > 0, TrustSubstrateError::StakeAmountMustBePositive);
    require_keys_eq!(
        ctx.accounts.stake.owner,
        ctx.accounts.owner.key(),
        TrustSubstrateError::StakeAuthorityMismatch
    );
    require!(
        amount <= ctx.accounts.stake.amount,
        TrustSubstrateError::StakeInsufficient
    );

    let slot = Clock::get()?.slot;
    let unlocks_at = slot
        .checked_add(STAKE_COOLDOWN_SLOTS)
        .ok_or(TrustSubstrateError::StakeAmountOverflow)?;

    ctx.accounts.stake.pending_unstake_amount = amount;
    ctx.accounts.stake.unstake_unlocks_at = unlocks_at;

    emit!(StakeUnstakeRequested {
        identity: ctx.accounts.stake.identity,
        authority: ctx.accounts.owner.key(),
        amount,
        pending_unstake_amount: amount,
        unlocks_at_slot: unlocks_at,
        slot,
    });

    Ok(())
}

#[derive(Accounts)]
pub struct RequestUnstake<'info> {
    pub owner: Signer<'info>,
    #[account(
        mut,
        seeds = [STAKE_SEED, stake.identity.as_ref()],
        bump = stake.bump
    )]
    pub stake: Account<'info, StakeAccount>,
}
