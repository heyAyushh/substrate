use anchor_lang::prelude::*;
use identity_registry::state::AgentIdentity;
use trust_substrate_core::{
    TrustSubstrateError, CHALLENGE_KIND, CHALLENGE_RESPONSE_KIND, CHALLENGE_RESPONSE_SEED,
};

use crate::events::ChallengeResponseCommitted;
use crate::state::ReceiptRecord;

pub fn handler(ctx: Context<EmitChallengeResponse>, payload_hash: [u8; 32]) -> Result<()> {
    let challenge = &ctx.accounts.challenge;
    require!(
        challenge.kind == CHALLENGE_KIND,
        TrustSubstrateError::ChallengeReceiptKindMismatch
    );
    require!(
        challenge.deadline_slot > 0,
        TrustSubstrateError::ChallengeDeadlineMissing
    );
    require!(
        Clock::get()?.slot <= challenge.deadline_slot,
        TrustSubstrateError::ChallengeResponseWindowClosed
    );
    require_keys_eq!(
        challenge.identity,
        ctx.accounts.identity.key(),
        TrustSubstrateError::ReceiptIdentityMismatch
    );

    let response_sequence = challenge
        .sequence
        .checked_add(1)
        .ok_or(TrustSubstrateError::ReceiptSequenceOverflow)?;
    let response_key = ctx.accounts.challenge_response.key();
    let response = &mut ctx.accounts.challenge_response;
    response.identity = challenge.identity;
    response.task = challenge.task;
    response.receipt_id = response_key.to_bytes();
    response.actor = ctx.accounts.authority.key();
    response.kind = CHALLENGE_RESPONSE_KIND;
    response.sequence = response_sequence;
    response.domain = challenge.domain;
    response.previous_receipt = challenge.key().to_bytes();
    response.payload_hash = payload_hash;
    response.via_delegation = Pubkey::default();
    response.auditor_identity = Pubkey::default();
    response.target_receipt = challenge.target_receipt;
    response.challenge_receipt = challenge.key();
    response.deadline_slot = 0;
    response.round = challenge.round;
    response.bump = ctx.bumps.challenge_response;

    emit!(ChallengeResponseCommitted {
        identity: response.identity,
        task: response.task,
        challenge_receipt: response.challenge_receipt,
        response_receipt: response_key,
        actor: response.actor,
        domain: response.domain,
    });

    Ok(())
}

#[derive(Accounts)]
pub struct EmitChallengeResponse<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        constraint = identity.authority == authority.key()
            @ TrustSubstrateError::ReceiptAuthorityMismatch
    )]
    pub identity: Account<'info, AgentIdentity>,
    pub challenge: Account<'info, ReceiptRecord>,
    #[account(
        init,
        payer = authority,
        space = 8 + ReceiptRecord::INIT_SPACE,
        seeds = [
            CHALLENGE_RESPONSE_SEED,
            challenge.key().as_ref()
        ],
        bump
    )]
    pub challenge_response: Account<'info, ReceiptRecord>,
    pub system_program: Program<'info, System>,
}
