pub mod instructions;
pub mod state;

use anchor_lang::prelude::*;

pub use instructions::*;
pub use state::*;

pub mod __client_accounts_create_identity {
    pub use crate::instructions::create_identity::__client_accounts_create_identity::*;
}

pub mod __client_accounts_update_policy_root {
    pub use crate::instructions::update_policy_root::__client_accounts_update_policy_root::*;
}

#[cfg(feature = "cpi")]
pub mod __cpi_client_accounts_create_identity {
    pub use crate::instructions::create_identity::__cpi_client_accounts_create_identity::*;
}

#[cfg(feature = "cpi")]
pub mod __cpi_client_accounts_update_policy_root {
    pub use crate::instructions::update_policy_root::__cpi_client_accounts_update_policy_root::*;
}

declare_id!("7eJnW2rVFi7e64YyUXviTeuYDJtEMMgRnQsZbV3r3FDv");

#[program]
pub mod identity_registry {
    use super::*;

    pub fn create_identity(
        ctx: Context<CreateIdentity>,
        agent_id: [u8; 32],
        policy_root: [u8; 32],
        history_root: [u8; 32],
    ) -> Result<()> {
        instructions::create_identity::handler(ctx, agent_id, policy_root, history_root)
    }

    pub fn update_policy_root(ctx: Context<UpdatePolicyRoot>, new_root: [u8; 32]) -> Result<()> {
        instructions::update_policy_root::handler(ctx, new_root)
    }
}
