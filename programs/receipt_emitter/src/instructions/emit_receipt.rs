use anchor_lang::prelude::*;
use identity_registry::state::AgentIdentity;
use reputation_accumulator::state::ReputationDomainCatalog;
use task_registry::state::TaskRecord;
use trust_substrate_core::{
    is_self_emittable_receipt_kind, is_valid_receipt_kind, TrustSubstrateError, RECEIPT_SEED,
};

use crate::events::ReceiptCommitted;
use crate::state::{CpiAuthority, ReceiptRecord};

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
    require!(
        is_self_emittable_receipt_kind(kind),
        TrustSubstrateError::ReceiptKindNotSelfEmittable
    );

    let empty_domain = [0u8; 32];
    if domain != empty_domain {
        require!(
            ctx.accounts.domain_catalog.is_domain_registered(&domain),
            TrustSubstrateError::DomainNotRegistered
        );
    }

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
    receipt.actor = ctx.accounts.authority.key();
    receipt.kind = kind;
    receipt.sequence = sequence;
    receipt.domain = domain;
    receipt.previous_receipt = previous_receipt;
    receipt.payload_hash = payload_hash;
    receipt.via_delegation = Pubkey::default();
    receipt.auditor_identity = Pubkey::default();
    receipt.target_receipt = Pubkey::default();
    receipt.round = 0;
    receipt.bump = ctx.bumps.receipt;

    let cpi_accounts = task_registry::cpi::accounts::AdvanceReceiptChain {
        task: ctx.accounts.task.to_account_info(),
        identity: ctx.accounts.identity.to_account_info(),
        authority: ctx.accounts.cpi_authority.to_account_info(),
    };
    let signer_seeds: &[&[&[u8]]] = &[&[b"cpi_authority", &[ctx.bumps.cpi_authority][..]]];
    let cpi_ctx = CpiContext::new_with_signer(
        ctx.accounts.task_registry_program.key(),
        cpi_accounts,
        signer_seeds,
    );
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
pub struct EmitReceipt<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(constraint = identity.authority == authority.key() @ TrustSubstrateError::ReceiptAuthorityMismatch)]
    pub identity: Account<'info, AgentIdentity>,
    #[account(
        mut,
        constraint = task.identity == identity.key() @ TrustSubstrateError::TaskIdentityMismatch
    )]
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
    pub domain_catalog: Account<'info, ReputationDomainCatalog>,
    #[account(
        seeds = [b"cpi_authority"],
        bump
    )]
    pub cpi_authority: Account<'info, CpiAuthority>,
    pub task_registry_program: Program<'info, task_registry::program::TaskRegistry>,
    pub system_program: Program<'info, System>,
}
