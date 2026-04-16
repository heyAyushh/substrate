use anchor_lang::prelude::*;
use trust_substrate_core::TrustSubstrateError;

use crate::{events::IdentityTaskCountAdjusted, state::AgentIdentity};

pub fn handler(ctx: Context<AdjustOpenTaskCount>, delta: i8) -> Result<()> {
    require_keys_eq!(
        ctx.accounts.identity.authority,
        ctx.accounts.authority.key(),
        TrustSubstrateError::IdentityAuthorityMismatch
    );

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

fn apply_delta(current: u32, delta: i8) -> Option<u32> {
    if delta >= 0 {
        current.checked_add(delta as u32)
    } else {
        current.checked_sub(delta.unsigned_abs() as u32)
    }
}
