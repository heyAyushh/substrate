use crate::{AdjudicatorRegistered, state::{AdjudicatorConfig, TreasuryVault}};
use anchor_lang::prelude::*;
use trust_substrate_core::{ADJUDICATOR_CONFIG_SEED, TREASURY_VAULT_SEED};

pub fn handler(ctx: Context<RegisterAdjudicator>, adjudicator: Pubkey) -> Result<()> {
    let config = &mut ctx.accounts.adjudicator_config;
    config.governance = ctx.accounts.governance.key();
    config.adjudicator = adjudicator;
    config.bump = ctx.bumps.adjudicator_config;

    let treasury = &mut ctx.accounts.treasury_vault;
    treasury.bump = ctx.bumps.treasury_vault;

    emit!(AdjudicatorRegistered {
        governance: ctx.accounts.governance.key(),
        adjudicator,
        treasury_vault: ctx.accounts.treasury_vault.key(),
        slot: Clock::get()?.slot,
    });

    Ok(())
}

#[derive(Accounts)]
pub struct RegisterAdjudicator<'info> {
    #[account(mut)]
    pub governance: Signer<'info>,
    #[account(
        init,
        payer = governance,
        space = 8 + AdjudicatorConfig::INIT_SPACE,
        seeds = [ADJUDICATOR_CONFIG_SEED],
        bump
    )]
    pub adjudicator_config: Account<'info, AdjudicatorConfig>,
    #[account(
        init,
        payer = governance,
        space = 8 + TreasuryVault::INIT_SPACE,
        seeds = [TREASURY_VAULT_SEED],
        bump
    )]
    pub treasury_vault: Account<'info, TreasuryVault>,
    pub system_program: Program<'info, System>,
}
