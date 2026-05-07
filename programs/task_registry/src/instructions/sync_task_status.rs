use anchor_lang::prelude::*;
use identity_registry::state::AgentIdentity;
use trust_substrate_core::ReceiptRecordAccount;
use trust_substrate_core::{
    TrustSubstrateError, ASSIGNMENT_KIND, COMPLETION_KIND, DISPUTE_KIND, DISPUTE_RESOLVED_KIND,
    HANDOFF_KIND, TASK_RECEIPT_APPLICATION_SEED, TASK_SEED, TASK_STATUS_ACTIVE,
    TASK_STATUS_COMPLETED, TASK_STATUS_DISPUTED, TASK_STATUS_RESOLVED,
};

use crate::events::TaskStatusSynced;
use crate::state::{AppliedTaskReceipt, TaskRecord};

pub fn handler(ctx: Context<SyncTaskStatus>) -> Result<()> {
    require_keys_eq!(
        ctx.accounts.identity.authority,
        ctx.accounts.authority.key(),
        TrustSubstrateError::TaskAuthorityMismatch
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
    require_keys_eq!(
        ctx.accounts.receipt_application.receipt,
        Pubkey::default(),
        TrustSubstrateError::ReceiptAlreadyAppliedToTask
    );

    let task = &mut ctx.accounts.task;
    let previous_status = task.status;

    match ctx.accounts.receipt.kind {
        ASSIGNMENT_KIND | HANDOFF_KIND => {
            if task.status != TASK_STATUS_COMPLETED && task.status != TASK_STATUS_DISPUTED {
                task.status = TASK_STATUS_ACTIVE;
            }
        }
        COMPLETION_KIND => {
            require!(
                task.subtask_count == 0 || task.completed_count < u32::from(task.subtask_count),
                TrustSubstrateError::TaskSubtaskCountExceeded
            );
            task.completed_count = task.completed_count.saturating_add(1);
            if task.status != TASK_STATUS_DISPUTED {
                task.status = TASK_STATUS_COMPLETED;
            }
        }
        DISPUTE_KIND => {
            require!(
                task.subtask_count == 0 || task.disputed_count < u32::from(task.subtask_count),
                TrustSubstrateError::TaskSubtaskCountExceeded
            );
            task.disputed_count = task.disputed_count.saturating_add(1);
            task.status = TASK_STATUS_DISPUTED;
        }
        DISPUTE_RESOLVED_KIND => {
            require!(
                task.status == TASK_STATUS_DISPUTED || task.disputed_count > 0,
                TrustSubstrateError::TaskDisputeRequiredForResolution
            );
            require!(
                task.resolved_count < task.disputed_count,
                TrustSubstrateError::TaskDisputeRequiredForResolution
            );
            task.resolved_count = task.resolved_count.saturating_add(1);
            if task.resolved_count >= task.disputed_count {
                task.status = TASK_STATUS_RESOLVED;
            }
        }
        _ => return err!(TrustSubstrateError::ReceiptKindNotSyncableToTask),
    }

    let receipt_application = &mut ctx.accounts.receipt_application;
    receipt_application.task = task.key();
    receipt_application.receipt = ctx.accounts.receipt.key();
    receipt_application.bump = ctx.bumps.receipt_application;

    let event_identity = task.identity;
    let event_task = task.key();
    let event_status = task.status;
    let identity_key = ctx.accounts.identity.key();
    let task_id = task.task_id;
    let task_bump = [task.bump];

    if let Some(delta) = settled_delta(previous_status, event_status) {
        let identity_cpi_accounts = identity_registry::cpi::accounts::AdjustOpenTaskCount {
            authority: ctx.accounts.task.to_account_info(),
            identity: ctx.accounts.identity.to_account_info(),
        };
        let signer_seeds: &[&[&[u8]]] = &[&[
            TASK_SEED,
            identity_key.as_ref(),
            task_id.as_ref(),
            &task_bump,
        ]];
        let identity_cpi = CpiContext::new_with_signer(
            ctx.accounts.identity_registry_program.key(),
            identity_cpi_accounts,
            signer_seeds,
        );
        identity_registry::cpi::adjust_open_task_count(identity_cpi, task_id, delta)?;
    }

    emit!(TaskStatusSynced {
        identity: event_identity,
        task: event_task,
        receipt: ctx.accounts.receipt.key(),
        kind: ctx.accounts.receipt.kind,
        new_status: event_status,
        slot: Clock::get()?.slot,
    });

    Ok(())
}

pub fn already_applied_handler(ctx: Context<TaskReceiptAlreadyApplied>) -> Result<()> {
    require_keys_eq!(
        ctx.accounts.receipt_application.task,
        ctx.accounts.task.key(),
        TrustSubstrateError::ReceiptAlreadyAppliedToTask
    );
    require_keys_eq!(
        ctx.accounts.receipt_application.receipt,
        ctx.accounts.receipt.key(),
        TrustSubstrateError::ReceiptAlreadyAppliedToTask
    );
    Ok(())
}

#[derive(Accounts)]
pub struct SyncTaskStatus<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(mut)]
    pub identity: Account<'info, AgentIdentity>,
    #[account(mut, constraint = task.identity == identity.key() @ TrustSubstrateError::TaskIdentityMismatch)]
    pub task: Account<'info, TaskRecord>,
    pub receipt: Account<'info, ReceiptRecordAccount>,
    #[account(
        init,
        payer = authority,
        space = 8 + AppliedTaskReceipt::INIT_SPACE,
        seeds = [
            TASK_RECEIPT_APPLICATION_SEED,
            task.key().as_ref(),
            receipt.key().as_ref()
        ],
        bump
    )]
    pub receipt_application: Account<'info, AppliedTaskReceipt>,
    pub identity_registry_program: Program<'info, identity_registry::program::IdentityRegistry>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct TaskReceiptAlreadyApplied<'info> {
    pub authority: Signer<'info>,
    pub identity: Account<'info, AgentIdentity>,
    #[account(constraint = task.identity == identity.key() @ TrustSubstrateError::TaskIdentityMismatch)]
    pub task: Account<'info, TaskRecord>,
    pub receipt: Account<'info, ReceiptRecordAccount>,
    #[account(
        seeds = [
            TASK_RECEIPT_APPLICATION_SEED,
            task.key().as_ref(),
            receipt.key().as_ref()
        ],
        bump = receipt_application.bump,
        has_one = task @ TrustSubstrateError::ReceiptAlreadyAppliedToTask,
        has_one = receipt @ TrustSubstrateError::ReceiptAlreadyAppliedToTask
    )]
    pub receipt_application: Account<'info, AppliedTaskReceipt>,
}

fn is_settled(status: u8) -> bool {
    status == TASK_STATUS_COMPLETED || status == TASK_STATUS_RESOLVED
}

fn settled_delta(previous_status: u8, next_status: u8) -> Option<i8> {
    match (is_settled(previous_status), is_settled(next_status)) {
        (false, true) => Some(-1),
        (true, false) => Some(1),
        _ => None,
    }
}
