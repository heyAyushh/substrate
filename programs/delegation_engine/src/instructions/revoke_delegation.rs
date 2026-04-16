use anchor_lang::prelude::*;
use identity_registry::state::AgentIdentity;
use trust_substrate_core::{TrustSubstrateError, DELEGATION_SEED};

use crate::events::DelegationRevoked;
use crate::state::DelegationRecord;

pub fn handler(ctx: Context<RevokeDelegation>, revoke_at_slot: u64) -> Result<()> {
    let current_slot = Clock::get()?.slot;
    let requested_revoke_at_slot = if revoke_at_slot == 0 || revoke_at_slot <= current_slot {
        current_slot
    } else {
        revoke_at_slot
    };

    let delegation = &mut ctx.accounts.delegation;
    delegation.revoked = true;
    delegation.revoke_at_slot = if delegation.revoke_at_slot == 0 {
        requested_revoke_at_slot
    } else {
        delegation.revoke_at_slot.min(requested_revoke_at_slot)
    };

    emit!(DelegationRevoked {
        identity: delegation.identity,
        delegate: delegation.delegate,
        revoke_at_slot: delegation.revoke_at_slot,
        slot: current_slot,
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
