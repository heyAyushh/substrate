pub mod events;
pub mod instructions;
pub mod state;

use anchor_lang::prelude::*;

pub use events::*;
pub use instructions::*;
pub use state::*;
pub use trust_substrate_core::{
    TrustSubstrateError, AGENT_LOST_OUTCOME, DISPUTE_KIND, NO_FAULT_OUTCOME,
    VERDICT_CLASS_PERFORMANCE, VERDICT_CLASS_POLICY, VERDICT_CLASS_SAFETY,
};

pub mod __client_accounts_record_verdict {
    pub use crate::instructions::record_verdict::__client_accounts_record_verdict::*;
}

pub mod __client_accounts_register_adjudicator {
    pub use crate::instructions::register_adjudicator::__client_accounts_register_adjudicator::*;
}

pub mod __client_accounts_challenge_verdict {
    pub use crate::instructions::challenge_verdict::__client_accounts_challenge_verdict::*;
}

#[cfg(feature = "cpi")]
pub mod __cpi_client_accounts_record_verdict {
    pub use crate::instructions::record_verdict::__cpi_client_accounts_record_verdict::*;
}

#[cfg(feature = "cpi")]
pub mod __cpi_client_accounts_register_adjudicator {
    pub use crate::instructions::register_adjudicator::__cpi_client_accounts_register_adjudicator::*;
}

#[cfg(feature = "cpi")]
pub mod __cpi_client_accounts_challenge_verdict {
    pub use crate::instructions::challenge_verdict::__cpi_client_accounts_challenge_verdict::*;
}

declare_id!("uJx2R2MHL7PEob6UPNz2DevGKpwd35fnKCrDQoavbtF");

#[program]
pub mod dispute_resolver {
    use super::*;

    pub fn register_adjudicator(
        ctx: Context<RegisterAdjudicator>,
        adjudicator: Pubkey,
    ) -> Result<()> {
        instructions::register_adjudicator::handler(ctx, adjudicator)
    }

    pub fn record_verdict(
        ctx: Context<RecordVerdict>,
        outcome: u8,
        slash_amount: u64,
        class: u8,
        stale_after_slot: u64,
    ) -> Result<()> {
        instructions::record_verdict::handler(ctx, outcome, slash_amount, class, stale_after_slot)
    }

    pub fn challenge_verdict(ctx: Context<ChallengeVerdict>) -> Result<()> {
        instructions::challenge_verdict::handler(ctx)
    }
}
