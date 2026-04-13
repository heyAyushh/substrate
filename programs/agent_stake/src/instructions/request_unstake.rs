use anchor_lang::prelude::*;
use trust_substrate_core::{TrustSubstrateError, STAKE_COOLDOWN_SLOTS, STAKE_SEED};

use crate::state::StakeAccount;

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

    let unlocks_at = Clock::get()?
        .slot
        .checked_add(STAKE_COOLDOWN_SLOTS)
        .ok_or(TrustSubstrateError::StakeAmountOverflow)?;

    ctx.accounts.stake.pending_unstake_amount = amount;
    ctx.accounts.stake.unstake_unlocks_at = unlocks_at;

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
