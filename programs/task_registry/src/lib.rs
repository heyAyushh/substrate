pub mod events;
pub mod instructions;
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

pub mod __client_accounts_create_society_world {
    pub use crate::instructions::create_society_world::__client_accounts_create_society_world::*;
}

pub mod __client_accounts_sync_task_status {
    pub use crate::instructions::sync_task_status::__client_accounts_sync_task_status::*;
}

pub mod __client_accounts_task_receipt_already_applied {
    pub use crate::instructions::sync_task_status::__client_accounts_task_receipt_already_applied::*;
}

pub mod __client_accounts_update_society_world {
    pub use crate::instructions::update_society_world::__client_accounts_update_society_world::*;
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
pub mod __cpi_client_accounts_create_society_world {
    pub use crate::instructions::create_society_world::__cpi_client_accounts_create_society_world::*;
}

#[cfg(feature = "cpi")]
pub mod __cpi_client_accounts_sync_task_status {
    pub use crate::instructions::sync_task_status::__cpi_client_accounts_sync_task_status::*;
}

#[cfg(feature = "cpi")]
pub mod __cpi_client_accounts_task_receipt_already_applied {
    pub use crate::instructions::sync_task_status::__cpi_client_accounts_task_receipt_already_applied::*;
}

#[cfg(feature = "cpi")]
pub mod __cpi_client_accounts_update_society_world {
    pub use crate::instructions::update_society_world::__cpi_client_accounts_update_society_world::*;
}

declare_id!("E16iDriWzHDTyX6irMhoGwnfWLDBMiTZeW67gZJiLwt4");

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

    pub fn create_society_world(
        ctx: Context<CreateSocietyWorld>,
        current_tick: u32,
        last_sequence: u64,
        last_receipt: Pubkey,
        status: u8,
        state: Vec<u8>,
    ) -> Result<()> {
        instructions::create_society_world::handler(
            ctx,
            current_tick,
            last_sequence,
            last_receipt,
            status,
            state,
        )
    }

    pub fn update_society_world(
        ctx: Context<UpdateSocietyWorld>,
        current_tick: u32,
        last_sequence: u64,
        last_receipt: Pubkey,
        status: u8,
        state: Vec<u8>,
    ) -> Result<()> {
        instructions::update_society_world::handler(
            ctx,
            current_tick,
            last_sequence,
            last_receipt,
            status,
            state,
        )
    }

    pub fn sync_task_status(ctx: Context<SyncTaskStatus>) -> Result<()> {
        instructions::sync_task_status::handler(ctx)
    }

    pub fn task_receipt_already_applied(ctx: Context<TaskReceiptAlreadyApplied>) -> Result<()> {
        instructions::sync_task_status::already_applied_handler(ctx)
    }
}
