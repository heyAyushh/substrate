use anchor_lang::prelude::*;
use identity_registry::state::AgentIdentity;

use crate::state::TaskRecord;
use trust_substrate_core::{TrustSubstrateError, TASK_STATUS_PENDING};

#[derive(Accounts)]
#[instruction(task_id: [u8; 32])]
pub struct CreateTask<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(mut)]
    pub identity: Account<'info, AgentIdentity>,
    #[account(
        init,
        payer = authority,
        space = 8 + TaskRecord::INIT_SPACE,
        seeds = [trust_substrate_core::TASK_SEED, identity.key().as_ref(), task_id.as_ref()],
        bump
    )]
    pub task: Account<'info, TaskRecord>,
    pub identity_registry_program: Program<'info, identity_registry::program::IdentityRegistry>,
    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<CreateTask>,
    task_id: [u8; 32],
    subtask_root: [u8; 32],
    subtask_count: u16,
    domain: [u8; 32],
) -> Result<()> {
    require_keys_eq!(
        ctx.accounts.identity.authority,
        ctx.accounts.authority.key(),
        TrustSubstrateError::TaskAuthorityMismatch
    );

    let task = &mut ctx.accounts.task;
    task.identity = ctx.accounts.identity.key();
    task.task_id = task_id;
    task.domain = domain;
    task.subtask_root = subtask_root;
    task.subtask_count = subtask_count;
    task.status = TASK_STATUS_PENDING;
    task.completed_count = 0;
    task.disputed_count = 0;
    task.resolved_count = 0;
    task.last_receipt = Pubkey::default();
    task.last_sequence = 0;
    task.bump = ctx.bumps.task;

    let identity_cpi_accounts = identity_registry::cpi::accounts::AdjustOpenTaskCount {
        authority: ctx.accounts.authority.to_account_info(),
        identity: ctx.accounts.identity.to_account_info(),
    };
    let identity_cpi = CpiContext::new(
        ctx.accounts.identity_registry_program.key(),
        identity_cpi_accounts,
    );
    identity_registry::cpi::adjust_open_task_count(identity_cpi, 1)?;

    Ok(())
}
