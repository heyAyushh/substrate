use crate::state::ReputationDomainCatalog;
use anchor_lang::prelude::*;
use trust_substrate_core::{TrustSubstrateError, DOMAIN_CATALOG_SEED};

pub fn handler(ctx: Context<DeprecateDomain>, domain: [u8; 32]) -> Result<()> {
    let catalog = &mut ctx.accounts.domain_catalog;

    let idx = catalog
        .find_domain_index(&domain)
        .ok_or(TrustSubstrateError::DomainNotRegistered)?;

    let mut deprecated = catalog.deprecated.clone();
    deprecated[idx] = true;
    catalog.deprecated = deprecated;

    Ok(())
}

#[derive(Accounts)]
pub struct DeprecateDomain<'info> {
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
