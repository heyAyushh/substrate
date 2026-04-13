use anchor_lang::prelude::*;
use identity_registry::state::AgentIdentity;

use crate::state::TaskRecord;
use trust_substrate_core::{TrustSubstrateError, TASK_STATUS_PENDING};

#[derive(Accounts)]
#[instruction(task_id: [u8; 32])]
pub struct CreateTask<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    pub identity: Account<'info, AgentIdentity>,
    #[account(
        init,
        payer = authority,
        space = 8 + TaskRecord::INIT_SPACE,
        seeds = [trust_substrate_core::TASK_SEED, identity.key().as_ref(), task_id.as_ref()],
        bump
    )]
    pub task: Account<'info, TaskRecord>,
    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<CreateTask>,
    task_id: [u8; 32],
    subtask_root: [u8; 32],
    subtask_count: u16,
) -> Result<()> {
    require_keys_eq!(
        ctx.accounts.identity.authority,
        ctx.accounts.authority.key(),
        TrustSubstrateError::InvalidAuthority
    );

    let task = &mut ctx.accounts.task;
    task.identity = ctx.accounts.identity.key();
    task.task_id = task_id;
    task.subtask_root = subtask_root;
    task.subtask_count = subtask_count;
    task.status = TASK_STATUS_PENDING;
    task.completed_count = 0;
    task.disputed_count = 0;
    task.resolved_count = 0;
    task.bump = ctx.bumps.task;

    Ok(())
}
