use anchor_lang::prelude::*;
use identity_registry::state::AgentIdentity;
use task_registry::state::TaskRecord;
use trust_substrate_core::{
    ASSIGNMENT_KIND, DISPUTE_KIND, HANDOFF_KIND, COMPLETION_KIND, RECEIPT_SEED,
    TrustSubstrateError,
};

use crate::events::ReceiptCommitted;
use crate::state::ReceiptRecord;

pub fn handle_emit_receipt(
    ctx: Context<EmitReceipt>,
    receipt_id: [u8; 32],
    kind: u8,
    sequence: u64,
    domain: [u8; 32],
    previous_receipt: [u8; 32],
    payload_hash: [u8; 32],
) -> Result<()> {
    require!(
        matches!(
            kind,
            ASSIGNMENT_KIND | HANDOFF_KIND | COMPLETION_KIND | DISPUTE_KIND
        ),
        TrustSubstrateError::InvalidReceiptKind
    );

    let receipt = &mut ctx.accounts.receipt;
    receipt.identity = ctx.accounts.identity.key();
    receipt.task = ctx.accounts.task.key();
    receipt.receipt_id = receipt_id;
    receipt.actor = ctx.accounts.authority.key();
    receipt.kind = kind;
    receipt.sequence = sequence;
    receipt.domain = domain;
    receipt.previous_receipt = previous_receipt;
    receipt.payload_hash = payload_hash;
    receipt.bump = ctx.bumps.receipt;

    emit!(ReceiptCommitted {
        identity: receipt.identity,
        task: receipt.task,
        receipt_id,
        actor: receipt.actor,
        kind,
        sequence,
        domain,
    });

    Ok(())
}

#[derive(Accounts)]
#[instruction(receipt_id: [u8; 32])]
pub struct EmitReceipt<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(constraint = identity.authority == authority.key() @ TrustSubstrateError::InvalidAuthority)]
    pub identity: Account<'info, AgentIdentity>,
    #[account(constraint = task.identity == identity.key() @ TrustSubstrateError::ReceiptIdentityMismatch)]
    pub task: Account<'info, TaskRecord>,
    #[account(
        init,
        payer = authority,
        space = 8 + ReceiptRecord::INIT_SPACE,
        seeds = [
            RECEIPT_SEED,
            identity.key().as_ref(),
            task.key().as_ref(),
            receipt_id.as_ref()
        ],
        bump
    )]
    pub receipt: Account<'info, ReceiptRecord>,
    pub system_program: Program<'info, System>,
}
