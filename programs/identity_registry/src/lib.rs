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

pub mod __client_accounts_deposit_identity_bond {
    pub use crate::instructions::deposit_identity_bond::__client_accounts_deposit_identity_bond::*;
}

pub mod __client_accounts_withdraw_identity_bond {
    pub use crate::instructions::withdraw_identity_bond::__client_accounts_withdraw_identity_bond::*;
}

pub mod __client_accounts_adjust_open_task_count {
    pub use crate::instructions::adjust_open_task_count::__client_accounts_adjust_open_task_count::*;
}

pub mod __client_accounts_adjust_open_challenge_count {
    pub use crate::instructions::adjust_open_challenge_count::__client_accounts_adjust_open_challenge_count::*;
}

pub mod __client_accounts_set_stake_active {
    pub use crate::instructions::set_stake_active::__client_accounts_set_stake_active::*;
}

pub mod __client_accounts_append_runtime_attestation {
    pub use crate::instructions::append_runtime_attestation::__client_accounts_append_runtime_attestation::*;
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
pub mod __cpi_client_accounts_deposit_identity_bond {
    pub use crate::instructions::deposit_identity_bond::__cpi_client_accounts_deposit_identity_bond::*;
}

#[cfg(feature = "cpi")]
pub mod __cpi_client_accounts_withdraw_identity_bond {
    pub use crate::instructions::withdraw_identity_bond::__cpi_client_accounts_withdraw_identity_bond::*;
}

#[cfg(feature = "cpi")]
pub mod __cpi_client_accounts_adjust_open_task_count {
    pub use crate::instructions::adjust_open_task_count::__cpi_client_accounts_adjust_open_task_count::*;
}

#[cfg(feature = "cpi")]
pub mod __cpi_client_accounts_adjust_open_challenge_count {
    pub use crate::instructions::adjust_open_challenge_count::__cpi_client_accounts_adjust_open_challenge_count::*;
}

#[cfg(feature = "cpi")]
pub mod __cpi_client_accounts_set_stake_active {
    pub use crate::instructions::set_stake_active::__cpi_client_accounts_set_stake_active::*;
}

#[cfg(feature = "cpi")]
pub mod __cpi_client_accounts_append_runtime_attestation {
    pub use crate::instructions::append_runtime_attestation::__cpi_client_accounts_append_runtime_attestation::*;
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

    pub fn deposit_identity_bond(ctx: Context<DepositIdentityBond>) -> Result<()> {
        instructions::deposit_identity_bond::handler(ctx)
    }

    pub fn withdraw_identity_bond(ctx: Context<WithdrawIdentityBond>) -> Result<()> {
        instructions::withdraw_identity_bond::handler(ctx)
    }

    pub fn adjust_open_task_count(ctx: Context<AdjustOpenTaskCount>, delta: i8) -> Result<()> {
        instructions::adjust_open_task_count::handler(ctx, delta)
    }

    pub fn adjust_open_challenge_count(
        ctx: Context<AdjustOpenChallengeCount>,
        delta: i8,
    ) -> Result<()> {
        instructions::adjust_open_challenge_count::handler(ctx, delta)
    }

    pub fn set_stake_active(ctx: Context<SetStakeActive>, active_stake: bool) -> Result<()> {
        instructions::set_stake_active::handler(ctx, active_stake)
    }

    pub fn append_runtime_attestation(
        ctx: Context<AppendRuntimeAttestation>,
        runtime_commit: [u8; 32],
        runtime_authority: Pubkey,
    ) -> Result<()> {
        instructions::append_runtime_attestation::handler(ctx, runtime_commit, runtime_authority)
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
