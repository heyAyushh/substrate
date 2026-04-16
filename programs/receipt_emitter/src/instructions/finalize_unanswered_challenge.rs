use anchor_lang::prelude::*;
use trust_substrate_core::{
    derive_audit_receipt_id, TrustSubstrateError, AUDIT_RECEIPT_SEED, CHALLENGE_KIND,
    CHALLENGE_RESPONSE_KIND, CHALLENGE_RESPONSE_SEED, DISPUTE_KIND,
};

use crate::events::AuditReceiptCommitted;
use crate::state::{CpiAuthority, ReceiptRecord};

pub fn handler(ctx: Context<FinalizeUnansweredChallenge>) -> Result<()> {
    let challenge = &ctx.accounts.challenge;
    require!(
        challenge.kind == CHALLENGE_KIND,
        TrustSubstrateError::ChallengeReceiptKindMismatch
    );
    require_keys_eq!(
        challenge.target_receipt,
        ctx.accounts.target_receipt.key(),
        TrustSubstrateError::ChallengeTargetReceiptMismatch
    );
    require_keys_eq!(
        challenge.identity,
        ctx.accounts.target_receipt.identity,
        TrustSubstrateError::ReceiptIdentityMismatch
    );
    require_keys_eq!(
        challenge.task,
        ctx.accounts.target_receipt.task,
        TrustSubstrateError::ReceiptTaskMismatch
    );
    require!(
        challenge.deadline_slot > 0,
        TrustSubstrateError::ChallengeDeadlineMissing
    );
    require!(
        Clock::get()?.slot > challenge.deadline_slot,
        TrustSubstrateError::ChallengeDeadlineNotElapsed
    );

    if ctx.accounts.challenge_response.owner == &crate::ID
        && !ctx.accounts.challenge_response.data_is_empty()
    {
        let data = ctx.accounts.challenge_response.try_borrow_data()?;
        let mut data_slice: &[u8] = &data;
        let response = ReceiptRecord::try_deserialize(&mut data_slice)
            .map_err(|_| error!(TrustSubstrateError::ReceiptAccountTypeMismatch))?;

        require!(
            response.kind == CHALLENGE_RESPONSE_KIND,
            TrustSubstrateError::ChallengeResponseKindMismatch
        );
        require_keys_eq!(
            response.challenge_receipt,
            challenge.key(),
            TrustSubstrateError::ChallengeResponseMismatch
        );
        require_keys_eq!(
            response.identity,
            challenge.identity,
            TrustSubstrateError::ReceiptIdentityMismatch
        );
        require_keys_eq!(
            response.task,
            challenge.task,
            TrustSubstrateError::ReceiptTaskMismatch
        );
        require_keys_eq!(
            response.target_receipt,
            challenge.target_receipt,
            TrustSubstrateError::ChallengeResponseMismatch
        );

        return err!(TrustSubstrateError::ChallengeAlreadyResponded);
    }

    let challenge_key = challenge.key();
    let dispute_receipt_id = derive_audit_receipt_id(
        challenge.auditor_identity.as_ref(),
        challenge.target_receipt.as_ref(),
        DISPUTE_KIND,
        challenge.round,
    );
    let dispute_sequence = challenge
        .sequence
        .checked_add(1)
        .ok_or(TrustSubstrateError::ReceiptSequenceOverflow)?;

    let dispute_receipt = &mut ctx.accounts.audit_receipt;
    dispute_receipt.identity = challenge.identity;
    dispute_receipt.task = challenge.task;
    dispute_receipt.receipt_id = dispute_receipt_id;
    dispute_receipt.actor = ctx.accounts.authority.key();
    dispute_receipt.kind = DISPUTE_KIND;
    dispute_receipt.sequence = dispute_sequence;
    dispute_receipt.domain = challenge.domain;
    dispute_receipt.previous_receipt = challenge_key.to_bytes();
    dispute_receipt.payload_hash = challenge.payload_hash;
    dispute_receipt.via_delegation = Pubkey::default();
    dispute_receipt.auditor_identity = challenge.auditor_identity;
    dispute_receipt.target_receipt = challenge.target_receipt;
    dispute_receipt.challenge_receipt = challenge_key;
    dispute_receipt.deadline_slot = 0;
    dispute_receipt.round = challenge.round;
    dispute_receipt.bump = ctx.bumps.audit_receipt;

    emit!(AuditReceiptCommitted {
        auditor_identity: challenge.auditor_identity,
        target_identity: challenge.identity,
        target_receipt: challenge.target_receipt,
        audit_receipt: dispute_receipt.key(),
        actor: dispute_receipt.actor,
        kind: dispute_receipt.kind,
        sequence: dispute_receipt.sequence,
        domain: dispute_receipt.domain,
        round: dispute_receipt.round,
    });

    let identity_cpi_accounts = identity_registry::cpi::accounts::AdjustOpenChallengeCount {
        challenge_authority: ctx.accounts.cpi_authority.to_account_info(),
        identity: ctx.accounts.target_identity.to_account_info(),
    };
    let signer_seeds: &[&[&[u8]]] = &[&[b"cpi_authority", &[ctx.bumps.cpi_authority][..]]];
    let identity_cpi = CpiContext::new_with_signer(
        ctx.accounts.identity_registry_program.key(),
        identity_cpi_accounts,
        signer_seeds,
    );
    identity_registry::cpi::adjust_open_challenge_count(identity_cpi, -1)?;

    Ok(())
}

#[derive(Accounts)]
pub struct FinalizeUnansweredChallenge<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(mut, address = challenge.identity @ TrustSubstrateError::ReceiptIdentityMismatch)]
    pub target_identity: Account<'info, identity_registry::state::AgentIdentity>,
    pub challenge: Account<'info, ReceiptRecord>,
    pub target_receipt: Account<'info, ReceiptRecord>,
    #[account(
        seeds = [
            CHALLENGE_RESPONSE_SEED,
            challenge.key().as_ref()
        ],
        bump
    )]
    /// CHECK: this PDA may be uninitialized; the handler deserializes it only when present.
    pub challenge_response: UncheckedAccount<'info>,
    #[account(
        init,
        payer = authority,
        space = 8 + ReceiptRecord::INIT_SPACE,
        seeds = [
            AUDIT_RECEIPT_SEED,
            challenge.auditor_identity.as_ref(),
            challenge.target_receipt.as_ref(),
            DISPUTE_KIND.to_le_bytes().as_ref(),
            challenge.round.to_le_bytes().as_ref(),
        ],
        bump
    )]
    pub audit_receipt: Account<'info, ReceiptRecord>,
    #[account(
        seeds = [b"cpi_authority"],
        bump
    )]
    pub cpi_authority: Account<'info, CpiAuthority>,
    pub identity_registry_program: Program<'info, identity_registry::program::IdentityRegistry>,
    pub system_program: Program<'info, System>,
}
