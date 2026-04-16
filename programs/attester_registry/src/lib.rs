pub mod events;
pub mod instructions;
pub mod state;

use anchor_lang::prelude::*;

pub use events::*;
pub use instructions::*;
pub use state::*;

pub mod __client_accounts_initialize_registry {
    pub use crate::instructions::initialize_registry::__client_accounts_initialize_registry::*;
}

pub mod __client_accounts_register_attester {
    pub use crate::instructions::register_attester::__client_accounts_register_attester::*;
}

pub mod __client_accounts_set_attester_tier {
    pub use crate::instructions::set_attester_tier::__client_accounts_set_attester_tier::*;
}

pub mod __client_accounts_close_attester {
    pub use crate::instructions::close_attester::__client_accounts_close_attester::*;
}

declare_id!("2GtbAjxWCHDFdc1B4RtF2a1tfY8ZuSwysAMJ5MJtqBxp");

#[program]
pub mod attester_registry {
    use super::*;

    pub fn initialize_registry(ctx: Context<InitializeRegistry>) -> Result<()> {
        instructions::initialize_registry::handler(ctx)
    }

    pub fn register_attester(
        ctx: Context<RegisterAttester>,
        category: String,
        self_declared_tier: u8,
    ) -> Result<()> {
        instructions::register_attester::handler(ctx, category, self_declared_tier)
    }

    pub fn set_attester_tier(
        ctx: Context<SetAttesterTier>,
        effective_tier: u8,
    ) -> Result<()> {
        instructions::set_attester_tier::handler(ctx, effective_tier)
    }

    pub fn close_attester(ctx: Context<CloseAttester>) -> Result<()> {
        instructions::close_attester::handler(ctx)
    }
}
