use anchor_lang::prelude::*;
use trust_substrate_core::{TrustSubstrateError, ATTESTER_CONFIG_SEED, MAX_ATTESTER_TIER};

use crate::{
    events::AttesterTierUpdated,
    state::{AttesterRecord, AttesterRegistryConfig},
};

pub fn handler(ctx: Context<SetAttesterTier>, effective_tier: u8) -> Result<()> {
    require!(
        effective_tier <= MAX_ATTESTER_TIER,
        TrustSubstrateError::AttesterTierInvalid
    );
    require_keys_eq!(
        ctx.accounts.config.curator,
        ctx.accounts.curator.key(),
        TrustSubstrateError::AttesterCuratorMismatch
    );

    let previous_tier = ctx.accounts.attester.effective_tier;
    ctx.accounts.attester.effective_tier = effective_tier;

    emit!(AttesterTierUpdated {
        identity: ctx.accounts.attester.identity,
        curator: ctx.accounts.curator.key(),
        previous_tier,
        effective_tier,
        slot: Clock::get()?.slot,
    });

    Ok(())
}

#[derive(Accounts)]
pub struct SetAttesterTier<'info> {
    #[account(mut)]
    pub curator: Signer<'info>,
    #[account(
        seeds = [ATTESTER_CONFIG_SEED],
        bump = config.bump
    )]
    pub config: Account<'info, AttesterRegistryConfig>,
    #[account(mut)]
    pub attester: Account<'info, AttesterRecord>,
}
