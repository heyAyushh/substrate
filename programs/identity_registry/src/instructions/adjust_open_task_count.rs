use anchor_lang::prelude::*;
use trust_substrate_core::{TrustSubstrateError, TASK_REGISTRY_PROGRAM_ID, TASK_SEED};

use crate::{events::IdentityTaskCountAdjusted, state::AgentIdentity};

pub fn handler(ctx: Context<AdjustOpenTaskCount>, task_id: [u8; 32], delta: i8) -> Result<()> {
    require_task_authority(
        &ctx.accounts.authority,
        ctx.accounts.identity.key(),
        task_id,
    )?;

    let updated_count = apply_delta(ctx.accounts.identity.open_task_count, delta)
        .ok_or(TrustSubstrateError::IdentityTaskCountUnderflow)?;
    ctx.accounts.identity.open_task_count = updated_count;

    emit!(IdentityTaskCountAdjusted {
        identity: ctx.accounts.identity.key(),
        authority: ctx.accounts.authority.key(),
        open_task_count: updated_count,
        delta,
        slot: Clock::get()?.slot,
    });

    Ok(())
}

#[derive(Accounts)]
pub struct AdjustOpenTaskCount<'info> {
    pub authority: Signer<'info>,
    #[account(mut)]
    pub identity: Account<'info, AgentIdentity>,
}

fn require_task_authority(
    authority: &Signer<'_>,
    identity: Pubkey,
    task_id: [u8; 32],
) -> Result<()> {
    let authority_info = authority.to_account_info();
    require_keys_eq!(
        *authority_info.owner,
        TASK_REGISTRY_PROGRAM_ID,
        TrustSubstrateError::IdentityTaskAuthorityMismatch
    );

    let expected = Pubkey::find_program_address(
        &[TASK_SEED, identity.as_ref(), task_id.as_ref()],
        &TASK_REGISTRY_PROGRAM_ID,
    )
    .0;
    require_keys_eq!(
        authority.key(),
        expected,
        TrustSubstrateError::IdentityTaskAuthorityMismatch
    );
    Ok(())
}

fn apply_delta(current: u32, delta: i8) -> Option<u32> {
    if delta >= 0 {
        current.checked_add(delta as u32)
    } else {
        current.checked_sub(delta.unsigned_abs() as u32)
    }
}
