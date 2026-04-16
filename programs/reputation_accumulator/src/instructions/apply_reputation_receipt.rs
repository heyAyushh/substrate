use crate::{
    state::{AppliedReputationReceipt, ReputationAccumulator},
    TrustSubstrateError,
};
use anchor_lang::prelude::*;
use identity_registry::state::AgentIdentity;
use trust_substrate_core::ReceiptRecordAccount;
use trust_substrate_core::{
    AGENT_LOST_OUTCOME, COMPLETION_KIND, DISPUTE_KIND, DISPUTE_RESOLVED_KIND,
    REPUTATION_RECEIPT_APPLICATION_SEED, VERDICT_SEED,
};

const DISPUTE_RESOLVER_ID: Pubkey = pubkey!("9cYSvQHM78shtFPnpxSfHwyB26CArahmHuJt7byyUrHa");
const DISPUTE_VERDICT_DISPUTE_RECEIPT_OFFSET: usize = 8;
const DISPUTE_VERDICT_OUTCOME_OFFSET: usize = 72;
const DISPUTE_VERDICT_SERIALIZED_LEN: usize = 122;

fn require_negative_verdict(ctx: &Context<ApplyReputationReceipt>) -> Result<()> {
    let verdict_info = ctx
        .remaining_accounts
        .first()
        .ok_or_else(|| error!(TrustSubstrateError::ReputationVerdictMissing))?;
    let expected_verdict = Pubkey::find_program_address(
        &[VERDICT_SEED, ctx.accounts.receipt.key().as_ref()],
        &DISPUTE_RESOLVER_ID,
    )
    .0;

    require_keys_eq!(
        *verdict_info.key,
        expected_verdict,
        TrustSubstrateError::ReputationVerdictMismatch
    );
    require_keys_eq!(
        *verdict_info.owner,
        DISPUTE_RESOLVER_ID,
        TrustSubstrateError::ReputationVerdictMismatch
    );
    let verdict_data = verdict_info.try_borrow_data()?;
    require!(
        verdict_data.len() >= DISPUTE_VERDICT_SERIALIZED_LEN,
        TrustSubstrateError::ReputationVerdictMismatch
    );
    let mut dispute_receipt_bytes = [0u8; 32];
    dispute_receipt_bytes.copy_from_slice(
        &verdict_data
            [DISPUTE_VERDICT_DISPUTE_RECEIPT_OFFSET..DISPUTE_VERDICT_DISPUTE_RECEIPT_OFFSET + 32],
    );
    require_keys_eq!(
        Pubkey::new_from_array(dispute_receipt_bytes),
        ctx.accounts.receipt.key(),
        TrustSubstrateError::ReputationVerdictMismatch
    );
    require!(
        verdict_data[DISPUTE_VERDICT_OUTCOME_OFFSET] == AGENT_LOST_OUTCOME,
        TrustSubstrateError::ReputationVerdictOutcomeNotNegative
    );

    Ok(())
}

pub fn handler(ctx: Context<ApplyReputationReceipt>) -> Result<()> {
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

    if ctx.accounts.receipt.kind == DISPUTE_KIND {
        require_negative_verdict(&ctx)?;
    }

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

pub fn already_applied_handler(ctx: Context<ReputationReceiptAlreadyApplied>) -> Result<()> {
    require_keys_eq!(
        ctx.accounts.receipt_application.reputation,
        ctx.accounts.reputation.key(),
        TrustSubstrateError::ReceiptAlreadyAppliedToReputation
    );
    require_keys_eq!(
        ctx.accounts.receipt_application.receipt,
        ctx.accounts.receipt.key(),
        TrustSubstrateError::ReceiptAlreadyAppliedToReputation
    );
    Ok(())
}

#[derive(Accounts)]
pub struct ApplyReputationReceipt<'info> {
    pub identity: Account<'info, AgentIdentity>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub receipt: Account<'info, ReceiptRecordAccount>,
    #[account(mut, constraint = reputation.identity == identity.key() @ TrustSubstrateError::ReputationIdentityMismatch)]
    pub reputation: Account<'info, ReputationAccumulator>,
    #[account(
        init,
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

#[derive(Accounts)]
pub struct ReputationReceiptAlreadyApplied<'info> {
    pub identity: Account<'info, AgentIdentity>,
    pub authority: Signer<'info>,
    pub receipt: Account<'info, ReceiptRecordAccount>,
    #[account(constraint = reputation.identity == identity.key() @ TrustSubstrateError::ReputationIdentityMismatch)]
    pub reputation: Account<'info, ReputationAccumulator>,
    #[account(
        seeds = [
            REPUTATION_RECEIPT_APPLICATION_SEED,
            reputation.key().as_ref(),
            receipt.key().as_ref()
        ],
        bump = receipt_application.bump,
        has_one = reputation @ TrustSubstrateError::ReceiptAlreadyAppliedToReputation,
        has_one = receipt @ TrustSubstrateError::ReceiptAlreadyAppliedToReputation
    )]
    pub receipt_application: Account<'info, AppliedReputationReceipt>,
}
