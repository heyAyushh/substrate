use anchor_lang::prelude::*;

pub const MAX_DOMAIN_CATALOG_ENTRIES: usize = 64;

#[account]
#[derive(InitSpace)]
pub struct ReputationDomainCatalog {
    pub curator: Pubkey,
    #[max_len(MAX_DOMAIN_CATALOG_ENTRIES)]
    pub domains: Vec<[u8; 32]>,
    #[max_len(MAX_DOMAIN_CATALOG_ENTRIES)]
    pub deprecated: Vec<bool>,
    pub bump: u8,
}

impl ReputationDomainCatalog {
    pub fn find_domain_index(&self, domain: &[u8; 32]) -> Option<usize> {
        self.domains.iter().position(|d| d == domain)
    }

    pub fn is_domain_active(&self, domain: &[u8; 32]) -> bool {
        self.find_domain_index(domain)
            .map(|idx| !self.deprecated[idx])
            .unwrap_or(false)
    }

    pub fn is_domain_registered(&self, domain: &[u8; 32]) -> bool {
        self.find_domain_index(domain).is_some()
    }
}
