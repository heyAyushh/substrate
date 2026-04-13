use crate::{
    identity_registry::state::AgentIdentity,
    receipt_emitter::state::ReceiptRecord,
    state::{AppliedReputationReceipt, ReputationAccumulator},
    TrustSubstrateError,
};
use anchor_lang::prelude::*;
use trust_substrate_core::{
    COMPLETION_KIND, DISPUTE_KIND, DISPUTE_RESOLVED_KIND, REPUTATION_RECEIPT_APPLICATION_SEED,
};

pub fn handler(ctx: Context<ApplyReputationReceipt>) -> Result<()> {
    require_keys_eq!(
        ctx.accounts.identity.authority,
        ctx.accounts.authority.key(),
        TrustSubstrateError::ReputationAuthorityMismatch
    );
    require_keys_eq!(
        ctx.accounts.receipt.identity,
        ctx.accounts.identity.key(),
        TrustSubstrateError::ReceiptIdentityMismatch
    );
    require_keys_eq!(
        ctx.accounts.reputation.identity,
        ctx.accounts.identity.key(),
        TrustSubstrateError::ReputationIdentityMismatch
    );
    require!(
        ctx.accounts.reputation.domain == ctx.accounts.receipt.domain,
        TrustSubstrateError::ReputationDomainMismatch
    );
    require_keys_eq!(
        ctx.accounts.receipt_application.receipt,
        Pubkey::default(),
        TrustSubstrateError::ReceiptAlreadyAppliedToReputation
    );

    let reputation = &mut ctx.accounts.reputation;
    match ctx.accounts.receipt.kind {
        COMPLETION_KIND => {
            reputation.completed = reputation
                .completed
                .saturating_add(reputation.completion_weight);
        }
        DISPUTE_KIND => {
            reputation.disputed = reputation
                .disputed
                .saturating_add(reputation.dispute_weight);
        }
        DISPUTE_RESOLVED_KIND => {
            let credit = reputation.dispute_resolved_weight.min(reputation.disputed);
            reputation.disputed = reputation.disputed.saturating_sub(credit);
            reputation.resolved = reputation.resolved.saturating_add(credit);
        }
        _ => return err!(TrustSubstrateError::ReceiptKindNotAppliedToReputation),
    }

    let receipt_application = &mut ctx.accounts.receipt_application;
    receipt_application.reputation = reputation.key();
    receipt_application.receipt = ctx.accounts.receipt.key();
    receipt_application.bump = ctx.bumps.receipt_application;

    Ok(())
}

#[derive(Accounts)]
pub struct ApplyReputationReceipt<'info> {
    pub identity: Account<'info, AgentIdentity>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub receipt: Account<'info, ReceiptRecord>,
    #[account(mut, constraint = reputation.identity == identity.key() @ TrustSubstrateError::ReputationIdentityMismatch)]
    pub reputation: Account<'info, ReputationAccumulator>,
    #[account(
        init_if_needed,
        payer = authority,
        space = 8 + AppliedReputationReceipt::INIT_SPACE,
        seeds = [
            REPUTATION_RECEIPT_APPLICATION_SEED,
            reputation.key().as_ref(),
            receipt.key().as_ref()
        ],
        bump
    )]
    pub receipt_application: Account<'info, AppliedReputationReceipt>,
    pub system_program: Program<'info, System>,
}
