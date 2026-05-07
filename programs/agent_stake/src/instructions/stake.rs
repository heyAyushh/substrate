use anchor_lang::{prelude::*, system_program};
use trust_substrate_core::{TrustSubstrateError, STAKE_SEED};

use crate::instructions::identity_stake_activity::sync_lamport_stake_activity;
use crate::state::StakeAccount;
use crate::StakeDeposited;

pub fn handler(ctx: Context<Stake>, amount: u64) -> Result<()> {
    require!(amount > 0, TrustSubstrateError::StakeAmountMustBePositive);
    require_keys_eq!(
        ctx.accounts.stake.owner,
        ctx.accounts.owner.key(),
        TrustSubstrateError::StakeAuthorityMismatch
    );
    let was_inactive = ctx.accounts.stake.amount == 0;

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

    if was_inactive {
        sync_lamport_stake_activity(
            ctx.accounts.identity_registry_program.key(),
            ctx.accounts.stake.to_account_info(),
            ctx.accounts.identity.to_account_info(),
            ctx.accounts.stake.identity,
            ctx.accounts.stake.bump,
            true,
        )?;
    }

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
    #[account(mut, address = stake.identity @ TrustSubstrateError::StakeIdentityMismatch)]
    pub identity: Account<'info, identity_registry::state::AgentIdentity>,
    #[account(
        mut,
        seeds = [STAKE_SEED, stake.identity.as_ref()],
        bump = stake.bump
    )]
    pub stake: Account<'info, StakeAccount>,
    pub identity_registry_program: Program<'info, identity_registry::program::IdentityRegistry>,
    pub system_program: Program<'info, System>,
}
