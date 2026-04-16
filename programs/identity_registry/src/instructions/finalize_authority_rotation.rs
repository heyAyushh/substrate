use anchor_lang::prelude::*;
use trust_substrate_core::{
    TrustSubstrateError, AUTHORITY_ROTATION_MODE_NORMAL, PENDING_ROTATION_SEED,
};

use crate::{
    events::AuthorityRotated,
    state::{AgentIdentity, PendingAuthorityRotation},
};

pub fn handler(ctx: Context<FinalizeAuthorityRotation>) -> Result<()> {
    let current_slot = Clock::get()?.slot;
    require!(
        current_slot >= ctx.accounts.pending_rotation.unlock_slot,
        TrustSubstrateError::AuthorityRotationCooldownNotElapsed
    );
    require_keys_eq!(
        ctx.accounts.pending_rotation.identity,
        ctx.accounts.identity.key(),
        TrustSubstrateError::AuthorityRotationIdentityMismatch
    );
    require_keys_eq!(
        ctx.accounts.identity.authority,
        ctx.accounts.pending_rotation.previous_authority,
        TrustSubstrateError::AuthorityRotationStateMismatch
    );

    let previous_authority = ctx.accounts.pending_rotation.previous_authority;
    let new_authority = ctx.accounts.pending_rotation.new_authority;
    ctx.accounts.identity.authority = new_authority;

    emit!(AuthorityRotated {
        identity: ctx.accounts.identity.key(),
        previous_authority,
        new_authority,
        slot: current_slot,
        mode: AUTHORITY_ROTATION_MODE_NORMAL,
    });

    Ok(())
}

#[derive(Accounts)]
pub struct FinalizeAuthorityRotation<'info> {
    #[account(mut)]
    pub caller: Signer<'info>,
    #[account(mut)]
    pub identity: Account<'info, AgentIdentity>,
    #[account(
        mut,
        close = caller,
        seeds = [PENDING_ROTATION_SEED, identity.key().as_ref()],
        bump = pending_rotation.bump
    )]
    pub pending_rotation: Account<'info, PendingAuthorityRotation>,
}
