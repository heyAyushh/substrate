use anchor_lang::prelude::*;

use crate::state::AgentIdentity;
use trust_substrate_core::TrustSubstrateError;

const PROOF_VERIFIER_PROGRAM_ID: Pubkey = pubkey!("7td4jQLbdqZoM4Je1VQKQ6uPfymNU7DdkWgXHcHQYbmE");

#[derive(Accounts)]
pub struct UpdateHistoryRoot<'info> {
    #[account(mut)]
    pub identity: Account<'info, AgentIdentity>,
    pub history_updater: Signer<'info>,
}

pub fn handler(ctx: Context<UpdateHistoryRoot>, new_root: [u8; 32]) -> Result<()> {
    let expected_history_updater =
        Pubkey::find_program_address(&[b"history_updater"], &PROOF_VERIFIER_PROGRAM_ID).0;

    require_keys_eq!(
        expected_history_updater,
        ctx.accounts.history_updater.key(),
        TrustSubstrateError::InvalidHistoryUpdater
    );

    ctx.accounts.identity.history_root = new_root;

    Ok(())
}
