use anchor_lang::prelude::*;
use identity_registry::state::AgentIdentity;
use task_registry::state::TaskRecord;
use trust_substrate_core::{
    is_valid_receipt_kind, TrustSubstrateError, RECEIPT_CHAIN_SEED, RECEIPT_SEED,
};

use crate::events::ReceiptCommitted;
use crate::state::{ReceiptChain, ReceiptRecord};

pub fn handler(
    ctx: Context<EmitReceipt>,
    receipt_id: [u8; 32],
    kind: u8,
    sequence: u64,
    domain: [u8; 32],
    previous_receipt: [u8; 32],
    payload_hash: [u8; 32],
) -> Result<()> {
    require!(
        is_valid_receipt_kind(kind),
        TrustSubstrateError::InvalidReceiptKind
    );

    let task = &ctx.accounts.task;
    let receipt_chain = &mut ctx.accounts.receipt_chain;
    if receipt_chain.identity == Pubkey::default() {
        receipt_chain.identity = ctx.accounts.identity.key();
        receipt_chain.task = task.key();
        receipt_chain.last_receipt = Pubkey::default();
        receipt_chain.last_sequence = 0;
        receipt_chain.bump = ctx.bumps.receipt_chain;
    }

    require!(
        sequence == receipt_chain.last_sequence + 1,
        TrustSubstrateError::ReceiptSequenceNotMonotonic
    );
    require!(
        previous_receipt == receipt_chain.last_receipt.to_bytes(),
        TrustSubstrateError::ReceiptChainBroken
    );

    let receipt = &mut ctx.accounts.receipt;
    receipt.identity = ctx.accounts.identity.key();
    receipt.task = task.key();
    receipt.receipt_id = receipt_id;
    receipt.actor = ctx.accounts.authority.key();
    receipt.kind = kind;
    receipt.sequence = sequence;
    receipt.domain = domain;
    receipt.previous_receipt = previous_receipt;
    receipt.payload_hash = payload_hash;
    receipt.via_delegation = Pubkey::default();
    receipt.bump = ctx.bumps.receipt;

    receipt_chain.last_receipt = receipt.key();
    receipt_chain.last_sequence = sequence;

    emit!(ReceiptCommitted {
        identity: receipt.identity,
        task: receipt.task,
        receipt_id,
        actor: receipt.actor,
        kind,
        sequence,
        domain,
        via_delegation: receipt.via_delegation,
    });

    Ok(())
}

#[derive(Accounts)]
#[instruction(receipt_id: [u8; 32])]
pub struct EmitReceipt<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(constraint = identity.authority == authority.key() @ TrustSubstrateError::ReceiptAuthorityMismatch)]
    pub identity: Account<'info, AgentIdentity>,
    #[account(constraint = task.identity == identity.key() @ TrustSubstrateError::TaskIdentityMismatch)]
    pub task: Account<'info, TaskRecord>,
    #[account(
        init_if_needed,
        payer = authority,
        space = 8 + ReceiptChain::INIT_SPACE,
        seeds = [
            RECEIPT_CHAIN_SEED,
            identity.key().as_ref(),
            task.key().as_ref()
        ],
        bump,
        constraint = receipt_chain.identity == Pubkey::default() || receipt_chain.identity == identity.key() @ TrustSubstrateError::ReceiptIdentityMismatch,
        constraint = receipt_chain.task == Pubkey::default() || receipt_chain.task == task.key() @ TrustSubstrateError::TaskIdentityMismatch
    )]
    pub receipt_chain: Account<'info, ReceiptChain>,
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
