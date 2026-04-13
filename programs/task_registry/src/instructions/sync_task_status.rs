use anchor_lang::prelude::*;
use identity_registry::state::AgentIdentity;
use trust_substrate_core::{
    TrustSubstrateError, ASSIGNMENT_KIND, COMPLETION_KIND, DISPUTE_KIND, DISPUTE_RESOLVED_KIND,
    HANDOFF_KIND, TASK_STATUS_ACTIVE, TASK_STATUS_COMPLETED, TASK_STATUS_DISPUTED,
    TASK_STATUS_RESOLVED,
};

use crate::receipt_emitter::state::ReceiptRecord;
use crate::state::TaskRecord;

pub fn handler(ctx: Context<SyncTaskStatus>) -> Result<()> {
    require_keys_eq!(
        ctx.accounts.identity.authority,
        ctx.accounts.authority.key(),
        TrustSubstrateError::InvalidAuthority
    );
    require_keys_eq!(
        ctx.accounts.receipt.identity,
        ctx.accounts.identity.key(),
        TrustSubstrateError::ReceiptIdentityMismatch
    );
    require_keys_eq!(
        ctx.accounts.receipt.task,
        ctx.accounts.task.key(),
        TrustSubstrateError::ReceiptTaskMismatch
    );

    let task = &mut ctx.accounts.task;

    match ctx.accounts.receipt.kind {
        ASSIGNMENT_KIND | HANDOFF_KIND => {
            if task.status != TASK_STATUS_COMPLETED && task.status != TASK_STATUS_DISPUTED {
                task.status = TASK_STATUS_ACTIVE;
            }
        }
        COMPLETION_KIND => {
            task.completed_count = task.completed_count.saturating_add(1);
            if task.status != TASK_STATUS_DISPUTED {
                task.status = TASK_STATUS_COMPLETED;
            }
        }
        DISPUTE_KIND => {
            task.disputed_count = task.disputed_count.saturating_add(1);
            task.status = TASK_STATUS_DISPUTED;
        }
        DISPUTE_RESOLVED_KIND => {
            require!(
                task.status == TASK_STATUS_DISPUTED || task.disputed_count > 0,
                TrustSubstrateError::InvalidTaskStatusTransition
            );
            task.resolved_count = task.resolved_count.saturating_add(1);
            if task.resolved_count >= task.disputed_count {
                task.status = TASK_STATUS_RESOLVED;
            }
        }
        _ => return err!(TrustSubstrateError::InvalidReceiptKind),
    }

    Ok(())
}

#[derive(Accounts)]
pub struct SyncTaskStatus<'info> {
    pub authority: Signer<'info>,
    pub identity: Account<'info, AgentIdentity>,
    #[account(
        mut,
        has_one = identity
    )]
    pub task: Account<'info, TaskRecord>,
    pub receipt: Account<'info, ReceiptRecord>,
}
