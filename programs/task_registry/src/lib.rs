pub mod instructions;
pub mod state;

use anchor_lang::prelude::*;

pub use instructions::*;
pub use state::*;

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
}
