pub mod instructions;
pub mod receipt_emitter;
pub mod state;

use anchor_lang::prelude::*;

pub use instructions::*;
pub use state::*;

pub mod __client_accounts_create_task {
    pub use crate::instructions::create_task::__client_accounts_create_task::*;
}

pub mod __client_accounts_sync_task_status {
    pub use crate::instructions::sync_task_status::__client_accounts_sync_task_status::*;
}

#[cfg(feature = "cpi")]
pub mod __cpi_client_accounts_create_task {
    pub use crate::instructions::create_task::__cpi_client_accounts_create_task::*;
}

#[cfg(feature = "cpi")]
pub mod __cpi_client_accounts_sync_task_status {
    pub use crate::instructions::sync_task_status::__cpi_client_accounts_sync_task_status::*;
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
    ) -> Result<()> {
        instructions::create_task::handler(ctx, task_id, subtask_root, subtask_count)
    }

    pub fn sync_task_status(ctx: Context<SyncTaskStatus>) -> Result<()> {
        instructions::sync_task_status::handler(ctx)
    }
}
