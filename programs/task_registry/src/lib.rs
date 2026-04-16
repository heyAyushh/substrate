pub mod events;
pub mod instructions;
pub mod receipt_emitter;
pub mod state;

use anchor_lang::prelude::*;

pub use events::*;
pub use instructions::*;
pub use state::*;

pub mod __client_accounts_advance_receipt_chain {
    pub use crate::instructions::advance_receipt_chain::__client_accounts_advance_receipt_chain::*;
}

pub mod __client_accounts_create_task {
    pub use crate::instructions::create_task::__client_accounts_create_task::*;
}

pub mod __client_accounts_sync_task_status {
    pub use crate::instructions::sync_task_status::__client_accounts_sync_task_status::*;
}

pub mod __client_accounts_task_receipt_already_applied {
    pub use crate::instructions::sync_task_status::__client_accounts_task_receipt_already_applied::*;
}

#[cfg(feature = "cpi")]
pub mod __cpi_client_accounts_advance_receipt_chain {
    pub use crate::instructions::advance_receipt_chain::__cpi_client_accounts_advance_receipt_chain::*;
}

#[cfg(feature = "cpi")]
pub mod __cpi_client_accounts_create_task {
    pub use crate::instructions::create_task::__cpi_client_accounts_create_task::*;
}

#[cfg(feature = "cpi")]
pub mod __cpi_client_accounts_sync_task_status {
    pub use crate::instructions::sync_task_status::__cpi_client_accounts_sync_task_status::*;
}

#[cfg(feature = "cpi")]
pub mod __cpi_client_accounts_task_receipt_already_applied {
    pub use crate::instructions::sync_task_status::__cpi_client_accounts_task_receipt_already_applied::*;
}

declare_id!("5CjbVQQgjKeCqCsyxcb4HqPpAVgB8eNXZiZovaChQ7R4");

#[program]
pub mod task_registry {
    use super::*;

    pub fn create_task(
        ctx: Context<CreateTask>,
        task_id: [u8; 32],
        subtask_root: [u8; 32],
        subtask_count: u16,
        domain: [u8; 32],
    ) -> Result<()> {
        instructions::create_task::handler(ctx, task_id, subtask_root, subtask_count, domain)
    }

    pub fn advance_receipt_chain(
        ctx: Context<AdvanceReceiptChain>,
        last_receipt: Pubkey,
        last_sequence: u64,
    ) -> Result<()> {
        instructions::advance_receipt_chain::handler(ctx, last_receipt, last_sequence)
    }

    pub fn sync_task_status(ctx: Context<SyncTaskStatus>) -> Result<()> {
        instructions::sync_task_status::handler(ctx)
    }

    pub fn task_receipt_already_applied(ctx: Context<TaskReceiptAlreadyApplied>) -> Result<()> {
        instructions::sync_task_status::already_applied_handler(ctx)
    }
}
