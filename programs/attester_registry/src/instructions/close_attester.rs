use anchor_lang::prelude::*;
use trust_substrate_core::{TrustSubstrateError, ATTESTER_RECORD_SEED};

use crate::{events::AttesterClosed, state::AttesterRecord};

pub fn handler(ctx: Context<CloseAttester>) -> Result<()> {
    require_keys_eq!(
        ctx.accounts.attester.authority,
        ctx.accounts.authority.key(),
        TrustSubstrateError::IdentityAuthorityMismatch
    );

    emit!(AttesterClosed {
        identity: ctx.accounts.attester.identity,
        authority: ctx.accounts.authority.key(),
        slot: Clock::get()?.slot,
    });

    Ok(())
}

#[derive(Accounts)]
pub struct CloseAttester<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        mut,
        close = authority,
        seeds = [ATTESTER_RECORD_SEED, attester.identity.as_ref()],
        bump = attester.bump
    )]
    pub attester: Account<'info, AttesterRecord>,
}
