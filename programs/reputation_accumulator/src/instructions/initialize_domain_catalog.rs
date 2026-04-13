use crate::state::ReputationDomainCatalog;
use anchor_lang::prelude::*;
use trust_substrate_core::DOMAIN_CATALOG_SEED;

pub fn handler(ctx: Context<InitializeDomainCatalog>) -> Result<()> {
    let catalog = &mut ctx.accounts.domain_catalog;
    catalog.curator = ctx.accounts.curator.key();
    catalog.domains = Vec::new();
    catalog.deprecated = Vec::new();
    catalog.bump = ctx.bumps.domain_catalog;
    Ok(())
}

#[derive(Accounts)]
pub struct InitializeDomainCatalog<'info> {
    #[account(mut)]
    pub curator: Signer<'info>,
    #[account(
        init,
        payer = curator,
        space = 8 + ReputationDomainCatalog::INIT_SPACE,
        seeds = [DOMAIN_CATALOG_SEED],
        bump
    )]
    pub domain_catalog: Account<'info, ReputationDomainCatalog>,
    pub system_program: Program<'info, System>,
}
