use anchor_lang::prelude::*;
use identity_registry::state::AgentIdentity;

use crate::state::TaskRecord;

const RECEIPT_EMITTER_PROGRAM_ID: Pubkey = pubkey!("FV5Nsn3jHH8xxBP6m1N43NawgswmMkhZo72HGYJaJLHp");

pub fn handler(
    ctx: Context<AdvanceReceiptChain>,
    last_receipt: Pubkey,
    last_sequence: u64,
) -> Result<()> {
    let task = &mut ctx.accounts.task;
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
    /// CHECK: Verified via PDA seeds to receipt_emitter program
    pub authority: UncheckedAccount<'info>,
}
