use anchor_lang::prelude::*;
use trust_substrate_core::TrustSubstrateError;

use crate::{events::IdentityStakeActivitySynced, state::AgentIdentity};

pub fn handler(ctx: Context<SetStakeActive>, active_stake: bool) -> Result<()> {
    require_keys_eq!(
        ctx.accounts.identity.authority,
        ctx.accounts.authority.key(),
        TrustSubstrateError::IdentityAuthorityMismatch
    );

    ctx.accounts.identity.active_stake = active_stake;

    emit!(IdentityStakeActivitySynced {
        identity: ctx.accounts.identity.key(),
        authority: ctx.accounts.authority.key(),
        active_stake,
        slot: Clock::get()?.slot,
    });

    Ok(())
}

#[derive(Accounts)]
pub struct SetStakeActive<'info> {
    pub authority: Signer<'info>,
    #[account(mut)]
    pub identity: Account<'info, AgentIdentity>,
}
