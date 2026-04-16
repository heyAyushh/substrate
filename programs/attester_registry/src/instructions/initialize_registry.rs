use anchor_lang::prelude::*;
use trust_substrate_core::ATTESTER_CONFIG_SEED;

use crate::{events::AttesterRegistryInitialized, state::AttesterRegistryConfig};

pub fn handler(ctx: Context<InitializeRegistry>) -> Result<()> {
    let config = &mut ctx.accounts.config;
    config.curator = ctx.accounts.curator.key();
    config.bump = ctx.bumps.config;

    emit!(AttesterRegistryInitialized {
        curator: ctx.accounts.curator.key(),
        slot: Clock::get()?.slot,
    });

    Ok(())
}

#[derive(Accounts)]
pub struct InitializeRegistry<'info> {
    #[account(mut)]
    pub curator: Signer<'info>,
    #[account(
        init,
        payer = curator,
        space = 8 + AttesterRegistryConfig::INIT_SPACE,
        seeds = [ATTESTER_CONFIG_SEED],
        bump
    )]
    pub config: Account<'info, AttesterRegistryConfig>,
    pub system_program: Program<'info, System>,
}
