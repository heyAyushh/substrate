pub mod events;
pub mod identity_registry;
pub mod instructions;
pub mod state;

use anchor_lang::prelude::*;

pub use events::*;
pub use instructions::*;
pub use state::*;
pub use trust_substrate_core::{TrustSubstrateError, CHECKPOINT_SEED};

pub mod __client_accounts_checkpoint_history {
    pub use crate::instructions::checkpoint_history::__client_accounts_checkpoint_history::*;
}

pub mod __client_accounts_initialize_history_updater {
    pub use crate::instructions::initialize_history_updater::__client_accounts_initialize_history_updater::*;
}

pub mod __client_accounts_rotate_checkpoint {
    pub use crate::instructions::rotate_checkpoint::__client_accounts_rotate_checkpoint::*;
}

pub mod __client_accounts_verify_receipt_inclusion {
    pub use crate::instructions::verify_receipt_inclusion::__client_accounts_verify_receipt_inclusion::*;
}

#[cfg(feature = "cpi")]
pub mod __cpi_client_accounts_checkpoint_history {
    pub use crate::instructions::checkpoint_history::__cpi_client_accounts_checkpoint_history::*;
}

#[cfg(feature = "cpi")]
pub mod __cpi_client_accounts_initialize_history_updater {
    pub use crate::instructions::initialize_history_updater::__cpi_client_accounts_initialize_history_updater::*;
}

#[cfg(feature = "cpi")]
pub mod __cpi_client_accounts_rotate_checkpoint {
    pub use crate::instructions::rotate_checkpoint::__cpi_client_accounts_rotate_checkpoint::*;
}

#[cfg(feature = "cpi")]
pub mod __cpi_client_accounts_verify_receipt_inclusion {
    pub use crate::instructions::verify_receipt_inclusion::__cpi_client_accounts_verify_receipt_inclusion::*;
}

declare_id!("4arfpB8XKheZp41Ee8L9fZkHntw4td7Uy5L34PMzYnNi");

#[program]
pub mod proof_verifier {
    use super::*;

    pub fn initialize_history_updater(ctx: Context<InitializeHistoryUpdater>) -> Result<()> {
        instructions::initialize_history_updater::handler(ctx)
    }

    pub fn checkpoint_history(
        ctx: Context<CheckpointHistory>,
        epoch: u64,
        root: [u8; 32],
        leaf_count: u64,
    ) -> Result<()> {
        instructions::checkpoint_history::handler(ctx, epoch, root, leaf_count)
    }

    pub fn rotate_checkpoint(
        ctx: Context<RotateCheckpoint>,
        new_epoch: u64,
        new_root: [u8; 32],
        new_leaf_count: u64,
    ) -> Result<()> {
        instructions::rotate_checkpoint::handler(ctx, new_epoch, new_root, new_leaf_count)
    }

    pub fn verify_receipt_inclusion(
        ctx: Context<VerifyReceiptInclusion>,
        leaf: [u8; 32],
        leaf_index: u64,
        siblings: Vec<[u8; 32]>,
    ) -> Result<()> {
        instructions::verify_receipt_inclusion::handler(ctx, leaf, leaf_index, siblings)
    }
}
