use crate::{VerdictRecorded, state::{AdjudicatorConfig, DisputeVerdict}};
use anchor_lang::prelude::*;
use receipt_emitter::state::ReceiptRecord;
use trust_substrate_core::{
    is_valid_verdict_outcome, TrustSubstrateError, ADJUDICATOR_CONFIG_SEED, DISPUTE_KIND,
    VERDICT_SEED,
};

pub fn handler(ctx: Context<RecordVerdict>, outcome: u8, slash_amount: u64) -> Result<()> {
    require!(
        is_valid_verdict_outcome(outcome),
        TrustSubstrateError::InvalidVerdictOutcome
    );
    require_keys_eq!(
        ctx.accounts.adjudicator_config.adjudicator,
        ctx.accounts.adjudicator.key(),
        TrustSubstrateError::VerdictAdjudicatorMismatch
    );
    require!(
        ctx.accounts.dispute_receipt.kind == DISPUTE_KIND,
        TrustSubstrateError::VerdictReceiptKindMismatch
    );

    let verdict = &mut ctx.accounts.verdict;
    verdict.dispute_receipt = ctx.accounts.dispute_receipt.key();
    verdict.target_identity = ctx.accounts.dispute_receipt.identity;
    verdict.outcome = outcome;
    verdict.slash_amount = slash_amount;
    verdict.adjudicator = ctx.accounts.adjudicator.key();
    verdict.created_at_slot = Clock::get()?.slot;
    verdict.bump = ctx.bumps.verdict;

    emit!(VerdictRecorded {
        dispute_receipt: ctx.accounts.dispute_receipt.key(),
        target_identity: verdict.target_identity,
        outcome,
        slash_amount,
        adjudicator: ctx.accounts.adjudicator.key(),
        slot: verdict.created_at_slot,
    });

    Ok(())
}

#[derive(Accounts)]
pub struct RecordVerdict<'info> {
    #[account(mut)]
    pub adjudicator: Signer<'info>,
    #[account(
        seeds = [ADJUDICATOR_CONFIG_SEED],
        bump = adjudicator_config.bump
    )]
    pub adjudicator_config: Account<'info, AdjudicatorConfig>,
    pub dispute_receipt: Account<'info, ReceiptRecord>,
    #[account(
        init,
        payer = adjudicator,
        space = 8 + DisputeVerdict::INIT_SPACE,
        seeds = [VERDICT_SEED, dispute_receipt.key().as_ref()],
        bump
    )]
    pub verdict: Account<'info, DisputeVerdict>,
    pub system_program: Program<'info, System>,
}
