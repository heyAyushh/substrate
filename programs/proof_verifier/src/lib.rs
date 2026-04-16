pub mod events;
pub mod identity_registry;
pub mod instructions;
pub mod receipt_emitter;
pub mod state;

use anchor_lang::prelude::*;

pub use events::*;
pub use instructions::*;
pub use state::*;
pub use trust_substrate_core::{TrustSubstrateError, CHECKPOINT_SEED};

pub mod __client_accounts_append_receipt_to_checkpoint {
    pub use crate::instructions::append_receipt_to_checkpoint::__client_accounts_append_receipt_to_checkpoint::*;
}

pub mod __client_accounts_checkpoint_import {
    pub use crate::instructions::checkpoint_import::__client_accounts_checkpoint_import::*;
}

pub mod __client_accounts_initialize_checkpoint {
    pub use crate::instructions::initialize_checkpoint::__client_accounts_initialize_checkpoint::*;
}

pub mod __client_accounts_initialize_checkpoint_importer {
    pub use crate::instructions::initialize_checkpoint_importer::__client_accounts_initialize_checkpoint_importer::*;
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
pub mod __cpi_client_accounts_append_receipt_to_checkpoint {
    pub use crate::instructions::append_receipt_to_checkpoint::__cpi_client_accounts_append_receipt_to_checkpoint::*;
}

#[cfg(feature = "cpi")]
pub mod __cpi_client_accounts_checkpoint_import {
    pub use crate::instructions::checkpoint_import::__cpi_client_accounts_checkpoint_import::*;
}

#[cfg(feature = "cpi")]
pub mod __cpi_client_accounts_initialize_checkpoint {
    pub use crate::instructions::initialize_checkpoint::__cpi_client_accounts_initialize_checkpoint::*;
}

#[cfg(feature = "cpi")]
pub mod __cpi_client_accounts_initialize_checkpoint_importer {
    pub use crate::instructions::initialize_checkpoint_importer::__cpi_client_accounts_initialize_checkpoint_importer::*;
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

    pub fn initialize_checkpoint(ctx: Context<InitializeCheckpoint>, epoch: u64) -> Result<()> {
        instructions::initialize_checkpoint::handler(ctx, epoch)
    }

    pub fn initialize_checkpoint_importer(
        ctx: Context<InitializeCheckpointImporter>,
        authority: Pubkey,
    ) -> Result<()> {
        instructions::initialize_checkpoint_importer::handler(ctx, authority)
    }

    pub fn checkpoint_import(
        ctx: Context<CheckpointImport>,
        epoch: u64,
        root: [u8; 32],
        leaf_count: u64,
    ) -> Result<()> {
        instructions::checkpoint_import::handler(ctx, epoch, root, leaf_count)
    }

    pub fn append_receipt_to_checkpoint(ctx: Context<AppendReceiptToCheckpoint>) -> Result<()> {
        instructions::append_receipt_to_checkpoint::handler(ctx)
    }

    pub fn rotate_checkpoint(ctx: Context<RotateCheckpoint>, new_epoch: u64) -> Result<()> {
        instructions::rotate_checkpoint::handler(ctx, new_epoch)
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
