use anchor_lang::prelude::*;
use trust_substrate_core::TrustSubstrateError;

use crate::{events::IdentityChallengeCountAdjusted, state::AgentIdentity};

const CPI_AUTHORITY_SEED: &[u8] = b"cpi_authority";
#[allow(unused_imports)]
const RECEIPT_EMITTER_PROGRAM_ID: Pubkey = pubkey!("FV5Nsn3jHH8xxBP6m1N43NawgswmMkhZo72HGYJaJLHp");

pub fn handler(ctx: Context<AdjustOpenChallengeCount>, delta: i8) -> Result<()> {
    let expected_authority =
        Pubkey::find_program_address(&[CPI_AUTHORITY_SEED], &RECEIPT_EMITTER_PROGRAM_ID).0;
    require_keys_eq!(
        ctx.accounts.challenge_authority.key(),
        expected_authority,
        TrustSubstrateError::IdentityChallengeAuthorityMismatch
    );

    let updated_count = apply_delta(ctx.accounts.identity.open_challenge_count, delta)
        .ok_or(TrustSubstrateError::IdentityChallengeCountUnderflow)?;
    ctx.accounts.identity.open_challenge_count = updated_count;

    emit!(IdentityChallengeCountAdjusted {
        identity: ctx.accounts.identity.key(),
        authority: ctx.accounts.challenge_authority.key(),
        open_challenge_count: updated_count,
        delta,
        slot: Clock::get()?.slot,
    });

    Ok(())
}

#[derive(Accounts)]
pub struct AdjustOpenChallengeCount<'info> {
    pub challenge_authority: Signer<'info>,
    #[account(mut)]
    pub identity: Account<'info, AgentIdentity>,
}

fn apply_delta(current: u32, delta: i8) -> Option<u32> {
    if delta >= 0 {
        current.checked_add(delta as u32)
    } else {
        current.checked_sub(delta.unsigned_abs() as u32)
    }
}
