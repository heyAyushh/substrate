use anchor_lang::prelude::*;
use identity_registry::state::AgentIdentity;
use trust_substrate_core::{TrustSubstrateError, DELEGATION_SEED};

use crate::events::DelegationRevoked;
use crate::state::DelegationRecord;

pub fn handler(ctx: Context<RevokeDelegation>) -> Result<()> {
    ctx.accounts.delegation.revoked = true;

    emit!(DelegationRevoked {
        identity: ctx.accounts.delegation.identity,
        delegate: ctx.accounts.delegation.delegate,
        slot: Clock::get()?.slot,
    });

    Ok(())
}

#[derive(Accounts)]
pub struct RevokeDelegation<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(constraint = identity.authority == authority.key() @ TrustSubstrateError::DelegationAuthorityMismatch)]
    pub identity: Account<'info, AgentIdentity>,
    #[account(
        mut,
        seeds = [
            DELEGATION_SEED,
            identity.key().as_ref(),
            delegation.delegate.as_ref()
        ],
        bump = delegation.bump,
        has_one = identity
    )]
    pub delegation: Account<'info, DelegationRecord>,
}
