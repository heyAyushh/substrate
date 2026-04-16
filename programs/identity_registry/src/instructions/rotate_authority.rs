use anchor_lang::prelude::*;
use trust_substrate_core::{TrustSubstrateError, PENDING_ROTATION_SEED, ROTATION_COOLDOWN_SLOTS};

use crate::{
    events::AuthorityRotationRequested,
    state::{AgentIdentity, PendingAuthorityRotation},
};

pub fn handler(
    ctx: Context<RotateAuthority>,
    new_authority: Pubkey,
    unlock_slot: u64,
) -> Result<()> {
    let minimum_unlock_slot = Clock::get()?
        .slot
        .checked_add(ROTATION_COOLDOWN_SLOTS)
        .ok_or(TrustSubstrateError::AuthorityRotationCooldownOverflow)?;
    require!(
        unlock_slot >= minimum_unlock_slot,
        TrustSubstrateError::AuthorityRotationUnlockTooSoon
    );

    let pending_rotation = &mut ctx.accounts.pending_rotation;
    pending_rotation.identity = ctx.accounts.identity.key();
    pending_rotation.previous_authority = ctx.accounts.identity.authority;
    pending_rotation.new_authority = new_authority;
    pending_rotation.unlock_slot = unlock_slot;
    pending_rotation.bump = ctx.bumps.pending_rotation;

    emit!(AuthorityRotationRequested {
        identity: pending_rotation.identity,
        previous_authority: pending_rotation.previous_authority,
        new_authority: pending_rotation.new_authority,
        unlock_slot: pending_rotation.unlock_slot,
        slot: Clock::get()?.slot,
    });

    Ok(())
}

#[derive(Accounts)]
pub struct RotateAuthority<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        mut,
        constraint = identity.authority == authority.key() @ TrustSubstrateError::IdentityAuthorityMismatch
    )]
    pub identity: Account<'info, AgentIdentity>,
    #[account(
        init,
        payer = authority,
        space = 8 + PendingAuthorityRotation::INIT_SPACE,
        seeds = [PENDING_ROTATION_SEED, identity.key().as_ref()],
        bump
    )]
    pub pending_rotation: Account<'info, PendingAuthorityRotation>,
    pub system_program: Program<'info, System>,
}
