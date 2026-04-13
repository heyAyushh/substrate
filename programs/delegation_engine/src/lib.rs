pub mod instructions;
pub mod state;

use anchor_lang::prelude::*;

pub use instructions::*;
pub use state::*;
pub use trust_substrate_core::{TrustSubstrateError, DELEGATION_SEED, EMPTY_SCOPE_BITMAP};

pub mod __client_accounts_create_delegation {
    pub use crate::instructions::create_delegation::__client_accounts_create_delegation::*;
}

pub mod __client_accounts_revoke_delegation {
    pub use crate::instructions::revoke_delegation::__client_accounts_revoke_delegation::*;
}

#[cfg(feature = "cpi")]
pub mod __cpi_client_accounts_create_delegation {
    pub use crate::instructions::create_delegation::__cpi_client_accounts_create_delegation::*;
}

#[cfg(feature = "cpi")]
pub mod __cpi_client_accounts_revoke_delegation {
    pub use crate::instructions::revoke_delegation::__cpi_client_accounts_revoke_delegation::*;
}

declare_id!("HoRjTc9J44oSqBC4DeHfDTavkR15Le8FY3qyPFy4pg49");

#[program]
pub mod delegation_engine {
    use super::*;

    pub fn create_delegation(
        ctx: Context<CreateDelegation>,
        allowed_actions: u8,
        expires_at_slot: u64,
    ) -> Result<()> {
        create_delegation::handler(ctx, allowed_actions, expires_at_slot)
    }

    pub fn revoke_delegation(ctx: Context<RevokeDelegation>) -> Result<()> {
        revoke_delegation::handler(ctx)
    }
}
