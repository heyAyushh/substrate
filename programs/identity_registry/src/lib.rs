pub mod events;
pub mod instructions;
pub mod state;

use anchor_lang::prelude::*;

pub use events::*;
pub use instructions::*;
pub use state::*;

pub mod __client_accounts_create_identity {
    pub use crate::instructions::create_identity::__client_accounts_create_identity::*;
}

pub mod __client_accounts_emergency_rotate_authority {
    pub use crate::instructions::emergency_rotate_authority::__client_accounts_emergency_rotate_authority::*;
}

pub mod __client_accounts_finalize_authority_rotation {
    pub use crate::instructions::finalize_authority_rotation::__client_accounts_finalize_authority_rotation::*;
}

pub mod __client_accounts_initialize_guardian_set {
    pub use crate::instructions::initialize_guardian_set::__client_accounts_initialize_guardian_set::*;
}

pub mod __client_accounts_rotate_authority {
    pub use crate::instructions::rotate_authority::__client_accounts_rotate_authority::*;
}

pub mod __client_accounts_update_history_root {
    pub use crate::instructions::update_history_root::__client_accounts_update_history_root::*;
}

pub mod __client_accounts_update_policy_root {
    pub use crate::instructions::update_policy_root::__client_accounts_update_policy_root::*;
}

#[cfg(feature = "cpi")]
pub mod __cpi_client_accounts_create_identity {
    pub use crate::instructions::create_identity::__cpi_client_accounts_create_identity::*;
}

#[cfg(feature = "cpi")]
pub mod __cpi_client_accounts_emergency_rotate_authority {
    pub use crate::instructions::emergency_rotate_authority::__cpi_client_accounts_emergency_rotate_authority::*;
}

#[cfg(feature = "cpi")]
pub mod __cpi_client_accounts_finalize_authority_rotation {
    pub use crate::instructions::finalize_authority_rotation::__cpi_client_accounts_finalize_authority_rotation::*;
}

#[cfg(feature = "cpi")]
pub mod __cpi_client_accounts_initialize_guardian_set {
    pub use crate::instructions::initialize_guardian_set::__cpi_client_accounts_initialize_guardian_set::*;
}

#[cfg(feature = "cpi")]
pub mod __cpi_client_accounts_rotate_authority {
    pub use crate::instructions::rotate_authority::__cpi_client_accounts_rotate_authority::*;
}

#[cfg(feature = "cpi")]
pub mod __cpi_client_accounts_update_history_root {
    pub use crate::instructions::update_history_root::__cpi_client_accounts_update_history_root::*;
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

    pub fn rotate_authority(
        ctx: Context<RotateAuthority>,
        new_authority: Pubkey,
        unlock_slot: u64,
    ) -> Result<()> {
        instructions::rotate_authority::handler(ctx, new_authority, unlock_slot)
    }

    pub fn initialize_guardian_set(
        ctx: Context<InitializeGuardianSet>,
        guardians: Vec<Pubkey>,
        threshold: u8,
    ) -> Result<()> {
        instructions::initialize_guardian_set::handler(ctx, guardians, threshold)
    }

    pub fn emergency_rotate_authority(
        ctx: Context<EmergencyRotateAuthority>,
        new_authority: Pubkey,
    ) -> Result<()> {
        instructions::emergency_rotate_authority::handler(ctx, new_authority)
    }

    pub fn finalize_authority_rotation(ctx: Context<FinalizeAuthorityRotation>) -> Result<()> {
        instructions::finalize_authority_rotation::handler(ctx)
    }

    pub fn update_history_root(ctx: Context<UpdateHistoryRoot>, new_root: [u8; 32]) -> Result<()> {
        instructions::update_history_root::handler(ctx, new_root)
    }

    pub fn update_policy_root(ctx: Context<UpdatePolicyRoot>, new_root: [u8; 32]) -> Result<()> {
        instructions::update_policy_root::handler(ctx, new_root)
    }
}
