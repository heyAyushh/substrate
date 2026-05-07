use anchor_lang::prelude::*;
use identity_registry::state::AgentIdentity;
use trust_substrate_core::TrustSubstrateError;

use crate::state::TaskRecord;

const RECEIPT_EMITTER_PROGRAM_ID: Pubkey = pubkey!("FR2iXdHVBWbzkdn5qQdWEuyLWWaB2zR9ipRLTA8rGvJk");

pub fn handler(
    ctx: Context<AdvanceReceiptChain>,
    last_receipt: Pubkey,
    last_sequence: u64,
) -> Result<()> {
    let task = &mut ctx.accounts.task;
    let expected_sequence = task
        .last_sequence
        .checked_add(1)
        .ok_or(TrustSubstrateError::ReceiptSequenceOverflow)?;
    require!(
        last_sequence == expected_sequence,
        TrustSubstrateError::ReceiptSequenceNotMonotonic
    );
    task.last_receipt = last_receipt;
    task.last_sequence = last_sequence;
    Ok(())
}

#[derive(Accounts)]
pub struct AdvanceReceiptChain<'info> {
    #[account(
        mut,
        constraint = task.identity == identity.key()
    )]
    pub task: Account<'info, TaskRecord>,
    pub identity: Account<'info, AgentIdentity>,
    #[account(
        seeds = [b"cpi_authority"],
        bump,
        seeds::program = RECEIPT_EMITTER_PROGRAM_ID
    )]
    pub authority: Signer<'info>,
}
