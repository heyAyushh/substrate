use crate::state::DisputeVerdict;
use anchor_lang::prelude::*;
use trust_substrate_core::TrustSubstrateError;

pub fn handler(_ctx: Context<ChallengeVerdict>) -> Result<()> {
    err!(TrustSubstrateError::VerdictChallengeNotImplemented)
}

#[derive(Accounts)]
pub struct ChallengeVerdict<'info> {
    pub challenger: Signer<'info>,
    pub verdict: Account<'info, DisputeVerdict>,
}
