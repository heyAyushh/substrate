use anchor_lang::prelude::*;
use identity_registry::state::AgentIdentity;
use trust_substrate_core::{
    TrustSubstrateError, DELEGATION_SEED, EMPTY_SCOPE_BITMAP, VALID_SCOPE_BITMAP,
};

use crate::state::DelegationRecord;

pub fn handler(
    ctx: Context<CreateDelegation>,
    allowed_actions: u8,
    expires_at_slot: u64,
) -> Result<()> {
    require!(
        allowed_actions != EMPTY_SCOPE_BITMAP,
        TrustSubstrateError::EmptyDelegationScope
    );
    require!(
        allowed_actions & !VALID_SCOPE_BITMAP == 0,
        TrustSubstrateError::InvalidDelegationScope
    );

    let delegation = &mut ctx.accounts.delegation;
    delegation.identity = ctx.accounts.identity.key();
    delegation.delegate = ctx.accounts.delegate.key();
    delegation.allowed_actions = allowed_actions;
    delegation.expires_at_slot = expires_at_slot;
    delegation.revoked = false;
    delegation.bump = ctx.bumps.delegation;

    Ok(())
}

#[derive(Accounts)]
pub struct CreateDelegation<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(constraint = identity.authority == authority.key() @ TrustSubstrateError::DelegationAuthorityMismatch)]
    pub identity: Account<'info, AgentIdentity>,
    /// CHECK: The delegate is referenced by public key in the PDA and does not need account data.
    pub delegate: UncheckedAccount<'info>,
    #[account(
        init,
        payer = authority,
        space = 8 + DelegationRecord::INIT_SPACE,
        seeds = [
            DELEGATION_SEED,
            identity.key().as_ref(),
            delegate.key().as_ref()
        ],
        bump
    )]
    pub delegation: Account<'info, DelegationRecord>,
    pub system_program: Program<'info, System>,
}
