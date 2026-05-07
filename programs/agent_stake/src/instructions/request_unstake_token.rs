use anchor_lang::prelude::*;
use trust_substrate_core::{TrustSubstrateError, STAKE_COOLDOWN_SLOTS, TOKEN_STAKE_SEED};

use crate::state::TokenStakeAccount;
use crate::TokenStakeUnstakeRequested;

pub fn handler(ctx: Context<RequestUnstakeToken>, amount: u64) -> Result<()> {
    require!(amount > 0, TrustSubstrateError::StakeAmountMustBePositive);
    require_keys_eq!(
        ctx.accounts.token_stake.owner,
        ctx.accounts.owner.key(),
        TrustSubstrateError::StakeAuthorityMismatch
    );
    require!(
        amount <= ctx.accounts.token_stake.amount,
        TrustSubstrateError::StakeInsufficient
    );

    let slot = Clock::get()?.slot;
    let unlocks_at = slot
        .checked_add(STAKE_COOLDOWN_SLOTS)
        .ok_or(TrustSubstrateError::StakeAmountOverflow)?;

    ctx.accounts.token_stake.pending_unstake_amount = amount;
    ctx.accounts.token_stake.unstake_unlocks_at = unlocks_at;

    emit!(TokenStakeUnstakeRequested {
        identity: ctx.accounts.token_stake.identity,
        authority: ctx.accounts.owner.key(),
        scope: ctx.accounts.token_stake.scope,
        mint: ctx.accounts.token_stake.mint,
        amount,
        pending_unstake_amount: amount,
        unlocks_at_slot: unlocks_at,
        slot,
    });

    Ok(())
}

#[derive(Accounts)]
pub struct RequestUnstakeToken<'info> {
    pub owner: Signer<'info>,
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
}
