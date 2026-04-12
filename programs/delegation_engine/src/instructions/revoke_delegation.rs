use anchor_lang::prelude::*;
use identity_registry::state::AgentIdentity;
use trust_substrate_core::{DELEGATION_SEED, TrustSubstrateError};

use crate::state::DelegationRecord;

pub fn handle_revoke_delegation(ctx: Context<RevokeDelegation>) -> Result<()> {
    ctx.accounts.delegation.revoked = true;
    Ok(())
}

#[derive(Accounts)]
pub struct RevokeDelegation<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(constraint = identity.authority == authority.key() @ TrustSubstrateError::InvalidAuthority)]
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
