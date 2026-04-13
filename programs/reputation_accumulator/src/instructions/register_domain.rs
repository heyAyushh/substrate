use crate::state::{ReputationDomainCatalog, MAX_DOMAIN_CATALOG_ENTRIES};
use anchor_lang::prelude::*;
use trust_substrate_core::{TrustSubstrateError, DOMAIN_CATALOG_SEED};

pub fn handler(ctx: Context<RegisterDomain>, domain: [u8; 32]) -> Result<()> {
    let catalog = &mut ctx.accounts.domain_catalog;

    require!(
        catalog.find_domain_index(&domain).is_none(),
        TrustSubstrateError::DomainAlreadyRegistered
    );

    require!(
        catalog.domains.len() < MAX_DOMAIN_CATALOG_ENTRIES,
        TrustSubstrateError::DomainCatalogFull
    );

    catalog.domains.push(domain);
    catalog.deprecated.push(false);

    Ok(())
}

#[derive(Accounts)]
pub struct RegisterDomain<'info> {
    #[account(mut)]
    pub curator: Signer<'info>,
    #[account(
        mut,
        seeds = [DOMAIN_CATALOG_SEED],
        bump = domain_catalog.bump,
        constraint = domain_catalog.curator == curator.key()
    )]
    pub domain_catalog: Account<'info, ReputationDomainCatalog>,
}
