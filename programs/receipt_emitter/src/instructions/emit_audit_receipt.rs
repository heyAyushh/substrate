use anchor_lang::prelude::*;
use identity_registry::state::AgentIdentity;
use reputation_accumulator::state::ReputationDomainCatalog;
use trust_substrate_core::{
    derive_audit_receipt_id, is_auditable_receipt_kind, is_valid_receipt_kind,
    TrustSubstrateError, AUDIT_RECEIPT_SEED, CHALLENGE_KIND,
};

use crate::events::AuditReceiptCommitted;
use crate::state::ReceiptRecord;

pub fn handler(
    ctx: Context<EmitAuditReceipt>,
    kind: u8,
    domain: [u8; 32],
    payload_hash: [u8; 32],
    sequence: u64,
    round: u16,
    deadline_slot: u64,
) -> Result<()> {
    require!(
        is_valid_receipt_kind(kind),
        TrustSubstrateError::InvalidReceiptKind
    );
    require!(
        is_auditable_receipt_kind(kind),
        TrustSubstrateError::ReceiptKindNotAuditable
    );

    let empty_domain = [0u8; 32];
    if domain != empty_domain {
        require!(
            ctx.accounts.domain_catalog.is_domain_registered(&domain),
            TrustSubstrateError::DomainNotRegistered
        );
    }

    let auditor_identity_key = ctx.accounts.auditor_identity.key();
    let target_receipt_key = ctx.accounts.target_receipt.key();
    let target_receipt = &ctx.accounts.target_receipt;
    if kind == CHALLENGE_KIND {
        require!(
            deadline_slot > 0,
            TrustSubstrateError::ChallengeDeadlineMissing
        );
    } else {
        require!(
            deadline_slot == 0,
            TrustSubstrateError::ReceiptDeadlineNotSupported
        );
    }

    require_keys_neq!(
        auditor_identity_key,
        target_receipt.identity,
        TrustSubstrateError::ReceiptAuditorCannotTargetOwnReceipt
    );
    require!(
        domain == target_receipt.domain,
        TrustSubstrateError::AuditDomainMismatch
    );

    let receipt_id = derive_audit_receipt_id(
        auditor_identity_key.as_ref(),
        target_receipt_key.as_ref(),
        kind,
        round,
    );

    let audit_receipt = &mut ctx.accounts.audit_receipt;
    audit_receipt.identity = target_receipt.identity;
    audit_receipt.task = target_receipt.task;
    audit_receipt.receipt_id = receipt_id;
    audit_receipt.actor = ctx.accounts.authority.key();
    audit_receipt.kind = kind;
    audit_receipt.sequence = sequence;
    audit_receipt.domain = domain;
    audit_receipt.previous_receipt = target_receipt_key.to_bytes();
    audit_receipt.payload_hash = payload_hash;
    audit_receipt.via_delegation = Pubkey::default();
    audit_receipt.auditor_identity = auditor_identity_key;
    audit_receipt.target_receipt = target_receipt_key;
    audit_receipt.challenge_receipt = Pubkey::default();
    audit_receipt.deadline_slot = deadline_slot;
    audit_receipt.round = round;
    audit_receipt.bump = ctx.bumps.audit_receipt;

    emit!(AuditReceiptCommitted {
        auditor_identity: auditor_identity_key,
        target_identity: audit_receipt.identity,
        target_receipt: target_receipt_key,
        audit_receipt: audit_receipt.key(),
        actor: audit_receipt.actor,
        kind,
        sequence,
        domain,
        round,
    });

    Ok(())
}

#[derive(Accounts)]
#[instruction(kind: u8, _domain: [u8; 32], _payload_hash: [u8; 32], _sequence: u64, round: u16, _deadline_slot: u64)]
pub struct EmitAuditReceipt<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        constraint = auditor_identity.authority == authority.key()
            @ TrustSubstrateError::ReceiptAuthorityMismatch
    )]
    pub auditor_identity: Account<'info, AgentIdentity>,
    pub target_identity: Account<'info, AgentIdentity>,
    #[account(
        constraint = target_receipt.identity == target_identity.key()
            @ TrustSubstrateError::ReceiptIdentityMismatch
    )]
    pub target_receipt: Account<'info, ReceiptRecord>,
    #[account(
        init,
        payer = authority,
        space = 8 + ReceiptRecord::INIT_SPACE,
        seeds = [
            AUDIT_RECEIPT_SEED,
            auditor_identity.key().as_ref(),
            target_receipt.key().as_ref(),
            kind.to_le_bytes().as_ref(),
            round.to_le_bytes().as_ref(),
        ],
        bump
    )]
    pub audit_receipt: Account<'info, ReceiptRecord>,
    pub domain_catalog: Account<'info, ReputationDomainCatalog>,
    pub system_program: Program<'info, System>,
}
