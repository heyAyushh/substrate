use crate::{state::DisputeVerdict, VerdictChallenged};
use anchor_lang::prelude::*;
use trust_substrate_core::{TrustSubstrateError, VERDICT_CLASS_SAFETY};

pub fn handler(ctx: Context<ChallengeVerdict>) -> Result<()> {
    require!(
        ctx.accounts.verdict.class != VERDICT_CLASS_SAFETY,
        TrustSubstrateError::VerdictChallengeUnsupported
    );
    require!(
        ctx.accounts.verdict.stale_after_slot > 0,
        TrustSubstrateError::VerdictStaleWindowMissing
    );
    require!(
        Clock::get()?.slot > ctx.accounts.verdict.stale_after_slot,
        TrustSubstrateError::VerdictChallengeWindowOpen
    );

    emit!(VerdictChallenged {
        verdict: ctx.accounts.verdict.key(),
        dispute_receipt: ctx.accounts.verdict.dispute_receipt,
        challenger: ctx.accounts.challenger.key(),
        adjudicator: ctx.accounts.verdict.adjudicator,
        slot: Clock::get()?.slot,
    });

    Ok(())
}

#[derive(Accounts)]
pub struct ChallengeVerdict<'info> {
    pub challenger: Signer<'info>,
    #[account(mut, close = challenger)]
    pub verdict: Account<'info, DisputeVerdict>,
}
