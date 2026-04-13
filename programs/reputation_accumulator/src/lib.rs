pub mod identity_registry;
pub mod instructions;
pub mod receipt_emitter;
pub mod state;

use anchor_lang::prelude::*;

pub use instructions::*;
pub use state::*;
pub use trust_substrate_core::{
    TrustSubstrateError, COMPLETION_CREDIT, COMPLETION_KIND, DISPUTE_CREDIT, DISPUTE_KIND,
    REPUTATION_SEED,
};

pub mod __client_accounts_apply_reputation_receipt {
    pub use crate::instructions::apply_reputation_receipt::__client_accounts_apply_reputation_receipt::*;
}

pub mod __client_accounts_create_reputation_domain {
    pub use crate::instructions::create_reputation_domain::__client_accounts_create_reputation_domain::*;
}

#[cfg(feature = "cpi")]
pub mod __cpi_client_accounts_apply_reputation_receipt {
    pub use crate::instructions::apply_reputation_receipt::__cpi_client_accounts_apply_reputation_receipt::*;
}

#[cfg(feature = "cpi")]
pub mod __cpi_client_accounts_create_reputation_domain {
    pub use crate::instructions::create_reputation_domain::__cpi_client_accounts_create_reputation_domain::*;
}

declare_id!("8tTBEKBqvk51C21spCmzJFNYpBkcWZSkiW2uVwHnHLdv");

#[program]
pub mod reputation_accumulator {
    use super::*;

    pub fn create_reputation_domain(
        ctx: Context<CreateReputationDomain>,
        domain: [u8; 32],
        completion_weight: u64,
        dispute_weight: u64,
        dispute_resolved_weight: u64,
    ) -> Result<()> {
        instructions::create_reputation_domain::handler(
            ctx,
            domain,
            completion_weight,
            dispute_weight,
            dispute_resolved_weight,
        )
    }

    pub fn apply_reputation_receipt(ctx: Context<ApplyReputationReceipt>) -> Result<()> {
        instructions::apply_reputation_receipt::handler(ctx)
    }
}
