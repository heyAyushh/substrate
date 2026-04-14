use anchor_lang::{prelude::*, system_program};
use trust_substrate_core::{TrustSubstrateError, STAKE_SEED};

use crate::state::StakeAccount;
use crate::StakeDeposited;

pub fn handler(ctx: Context<Stake>, amount: u64) -> Result<()> {
    require!(amount > 0, TrustSubstrateError::StakeAmountMustBePositive);
    require_keys_eq!(
        ctx.accounts.stake.owner,
        ctx.accounts.owner.key(),
        TrustSubstrateError::StakeAuthorityMismatch
    );

    ctx.accounts.stake.amount = ctx
        .accounts
        .stake
        .amount
        .checked_add(amount)
        .ok_or(TrustSubstrateError::StakeAmountOverflow)?;

    system_program::transfer(
        CpiContext::new(
            ctx.accounts.system_program.key(),
            system_program::Transfer {
                from: ctx.accounts.owner.to_account_info(),
                to: ctx.accounts.stake.to_account_info(),
            },
        ),
        amount,
    )?;

    emit!(StakeDeposited {
        identity: ctx.accounts.stake.identity,
        authority: ctx.accounts.owner.key(),
        amount,
        slot: Clock::get()?.slot,
    });

    Ok(())
}

#[derive(Accounts)]
pub struct Stake<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(
        mut,
        seeds = [STAKE_SEED, stake.identity.as_ref()],
        bump = stake.bump
    )]
    pub stake: Account<'info, StakeAccount>,
    pub system_program: Program<'info, System>,
}
