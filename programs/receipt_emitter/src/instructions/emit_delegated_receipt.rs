use anchor_lang::prelude::*;
use delegation_engine::state::DelegationRecord;
use identity_registry::state::AgentIdentity;
use task_registry::state::TaskRecord;
use trust_substrate_core::{
    is_valid_receipt_kind, scope_bit_for_kind, TrustSubstrateError, DELEGATION_SEED, RECEIPT_SEED,
};

use crate::events::ReceiptCommitted;
use crate::state::{CpiAuthority, ReceiptRecord};

pub fn handler(
    ctx: Context<EmitDelegatedReceipt>,
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

    let delegation = &ctx.accounts.delegation;
    require_keys_eq!(
        delegation.delegate,
        ctx.accounts.delegate.key(),
        TrustSubstrateError::DelegationDelegateMismatch
    );
    require!(!delegation.revoked, TrustSubstrateError::DelegationRevoked);

    let now = Clock::get()?.slot;
    require!(
        delegation.expires_at_slot == 0 || now <= delegation.expires_at_slot,
        TrustSubstrateError::DelegationExpired
    );

    let scope_bit = scope_bit_for_kind(kind).ok_or(TrustSubstrateError::InvalidReceiptKind)?;
    require!(
        delegation.allowed_actions & scope_bit != 0,
        TrustSubstrateError::DelegationScopeMismatch
    );

    let task = &ctx.accounts.task;
    require!(
        sequence == task.last_sequence + 1,
        TrustSubstrateError::ReceiptSequenceNotMonotonic
    );
    require!(
        previous_receipt == task.last_receipt.to_bytes(),
        TrustSubstrateError::ReceiptChainBroken
    );

    let receipt = &mut ctx.accounts.receipt;
    receipt.identity = ctx.accounts.identity.key();
    receipt.task = task.key();
    receipt.receipt_id = receipt_id;
    receipt.actor = ctx.accounts.delegate.key();
    receipt.kind = kind;
    receipt.sequence = sequence;
    receipt.domain = domain;
    receipt.previous_receipt = previous_receipt;
    receipt.payload_hash = payload_hash;
    receipt.via_delegation = delegation.key();
    receipt.bump = ctx.bumps.receipt;

    let cpi_program = ctx.accounts.task_registry_program.to_account_info();
    let cpi_accounts = task_registry::cpi::accounts::AdvanceReceiptChain {
        task: ctx.accounts.task.to_account_info(),
        identity: ctx.accounts.identity.to_account_info(),
        authority: ctx.accounts.cpi_authority.to_account_info(),
    };
    let signer_seeds: &[&[&[u8]]] = &[&[b"cpi_authority", &[ctx.bumps.cpi_authority][..]]];
    let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer_seeds);
    task_registry::cpi::advance_receipt_chain(cpi_ctx, receipt.key(), sequence)?;

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
pub struct EmitDelegatedReceipt<'info> {
    #[account(mut)]
    pub delegate: Signer<'info>,
    pub identity: Account<'info, AgentIdentity>,
    #[account(
        seeds = [
            DELEGATION_SEED,
            identity.key().as_ref(),
            delegate.key().as_ref()
        ],
        seeds::program = delegation_engine::ID,
        bump = delegation.bump,
        constraint = delegation.identity == identity.key() @ TrustSubstrateError::DelegationIdentityMismatch
    )]
    pub delegation: Account<'info, DelegationRecord>,
    #[account(
        mut,
        constraint = task.identity == identity.key() @ TrustSubstrateError::TaskIdentityMismatch
    )]
    pub task: Account<'info, TaskRecord>,
    #[account(
        init,
        payer = delegate,
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
    #[account(
        seeds = [b"cpi_authority"],
        bump
    )]
    pub cpi_authority: Account<'info, CpiAuthority>,
    pub task_registry_program: Program<'info, task_registry::program::TaskRegistry>,
    pub system_program: Program<'info, System>,
}
