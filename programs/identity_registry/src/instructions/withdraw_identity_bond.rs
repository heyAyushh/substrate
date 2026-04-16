use anchor_lang::prelude::*;
use trust_substrate_core::{TrustSubstrateError, IDENTITY_BOND_SEED, IDENTITY_TIER_UNBONDED};

use crate::{
    events::IdentityBondWithdrawn,
    state::{AgentIdentity, IdentityBond},
};

pub fn handler(ctx: Context<WithdrawIdentityBond>) -> Result<()> {
    require_keys_eq!(
        ctx.accounts.identity.authority,
        ctx.accounts.authority.key(),
        TrustSubstrateError::IdentityAuthorityMismatch
    );
    require!(
        ctx.accounts.identity.open_task_count == 0,
        TrustSubstrateError::IdentityHasOpenTasks
    );
    require!(
        ctx.accounts.identity.open_challenge_count == 0,
        TrustSubstrateError::IdentityHasOpenChallenges
    );
    require!(
        !ctx.accounts.identity.active_stake,
        TrustSubstrateError::IdentityHasActiveStake
    );

    let amount = ctx.accounts.identity_bond.amount;
    require!(amount > 0, TrustSubstrateError::IdentityNotBonded);
    ctx.accounts.identity.tier = IDENTITY_TIER_UNBONDED;

    emit!(IdentityBondWithdrawn {
        identity: ctx.accounts.identity.key(),
        authority: ctx.accounts.authority.key(),
        amount,
        slot: Clock::get()?.slot,
    });

    Ok(())
}

#[derive(Accounts)]
pub struct WithdrawIdentityBond<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        mut,
        constraint = identity.authority == authority.key()
            @ TrustSubstrateError::IdentityAuthorityMismatch
    )]
    pub identity: Account<'info, AgentIdentity>,
    #[account(
        mut,
        close = authority,
        seeds = [IDENTITY_BOND_SEED, identity.key().as_ref()],
        bump = identity_bond.bump,
        has_one = identity @ TrustSubstrateError::IdentityNotBonded,
        has_one = authority @ TrustSubstrateError::IdentityAuthorityMismatch
    )]
    pub identity_bond: Account<'info, IdentityBond>,
}
