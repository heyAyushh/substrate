use anchor_lang::prelude::*;
use identity_registry::state::AgentIdentity;
use reputation_accumulator::state::ReputationDomainCatalog;
use task_registry::state::TaskRecord;
use trust_substrate_core::{TrustSubstrateError, DELEGATION_SEED, HANDOFF_KIND, RECEIPT_SEED};

use crate::events::ReceiptCommitted;
use crate::state::{CpiAuthority, ReceiptRecord};

pub fn handler(
    ctx: Context<EmitHandoffGrant>,
    receipt_id: [u8; 32],
    sequence: u64,
    domain: [u8; 32],
    previous_receipt: [u8; 32],
    payload_hash: [u8; 32],
    allowed_actions: u8,
    expires_at_slot: u64,
) -> Result<()> {
    let empty_domain = [0u8; 32];
    if domain != empty_domain {
        require!(
            ctx.accounts.domain_catalog.is_domain_registered(&domain),
            TrustSubstrateError::DomainNotRegistered
        );
    }

    let task = &ctx.accounts.task;
    require!(
        domain == task.domain,
        TrustSubstrateError::TaskDomainMismatch
    );
    require!(
        sequence == task.last_sequence + 1,
        TrustSubstrateError::ReceiptSequenceNotMonotonic
    );
    require!(
        previous_receipt == task.last_receipt.to_bytes(),
        TrustSubstrateError::ReceiptChainBroken
    );

    let delegation_cpi_accounts = delegation_engine::cpi::accounts::CreateDelegation {
        authority: ctx.accounts.authority.to_account_info(),
        identity: ctx.accounts.identity.to_account_info(),
        delegate: ctx.accounts.delegate.to_account_info(),
        delegation: ctx.accounts.delegation.to_account_info(),
        system_program: ctx.accounts.system_program.to_account_info(),
    };
    let delegation_cpi = CpiContext::new(
        ctx.accounts.delegation_engine_program.key(),
        delegation_cpi_accounts,
    );
    delegation_engine::cpi::create_delegation(delegation_cpi, allowed_actions, expires_at_slot)?;

    let receipt = &mut ctx.accounts.receipt;
    receipt.identity = ctx.accounts.identity.key();
    receipt.task = task.key();
    receipt.receipt_id = receipt_id;
    receipt.actor = ctx.accounts.authority.key();
    receipt.kind = HANDOFF_KIND;
    receipt.sequence = sequence;
    receipt.domain = domain;
    receipt.previous_receipt = previous_receipt;
    receipt.payload_hash = payload_hash;
    receipt.via_delegation = ctx.accounts.delegation.key();
    receipt.auditor_identity = Pubkey::default();
    receipt.target_receipt = Pubkey::default();
    receipt.challenge_receipt = Pubkey::default();
    receipt.deadline_slot = 0;
    receipt.round = 0;
    receipt.bump = ctx.bumps.receipt;

    let advance_cpi_accounts = task_registry::cpi::accounts::AdvanceReceiptChain {
        task: ctx.accounts.task.to_account_info(),
        identity: ctx.accounts.identity.to_account_info(),
        authority: ctx.accounts.cpi_authority.to_account_info(),
    };
    let signer_seeds: &[&[&[u8]]] = &[&[b"cpi_authority", &[ctx.bumps.cpi_authority][..]]];
    let advance_cpi = CpiContext::new_with_signer(
        ctx.accounts.task_registry_program.key(),
        advance_cpi_accounts,
        signer_seeds,
    );
    task_registry::cpi::advance_receipt_chain(advance_cpi, receipt.key(), sequence)?;

    emit!(ReceiptCommitted {
        identity: receipt.identity,
        task: receipt.task,
        receipt_id,
        actor: receipt.actor,
        kind: receipt.kind,
        sequence,
        domain,
        via_delegation: receipt.via_delegation,
    });

    Ok(())
}

#[derive(Accounts)]
#[instruction(receipt_id: [u8; 32])]
pub struct EmitHandoffGrant<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(constraint = identity.authority == authority.key() @ TrustSubstrateError::ReceiptAuthorityMismatch)]
    pub identity: Account<'info, AgentIdentity>,
    /// CHECK: The delegate only needs a public key because delegation state is created by CPI.
    pub delegate: UncheckedAccount<'info>,
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
    /// CHECK: This PDA is owned and initialized by the delegation engine CPI.
    #[account(
        mut,
        seeds = [
            DELEGATION_SEED,
            identity.key().as_ref(),
            delegate.key().as_ref()
        ],
        bump,
        seeds::program = delegation_engine::ID
    )]
    pub delegation: UncheckedAccount<'info>,
    pub domain_catalog: Account<'info, ReputationDomainCatalog>,
    #[account(
        seeds = [b"cpi_authority"],
        bump
    )]
    pub cpi_authority: Account<'info, CpiAuthority>,
    pub task_registry_program: Program<'info, task_registry::program::TaskRegistry>,
    pub delegation_engine_program: Program<'info, delegation_engine::program::DelegationEngine>,
    pub system_program: Program<'info, System>,
}
