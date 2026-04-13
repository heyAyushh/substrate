use crate::{state::HistoryCheckpoint, TrustSubstrateError, CHECKPOINT_SEED};
use anchor_lang::prelude::*;
use trust_substrate_core::verify_inclusion;

pub fn handler(
    ctx: Context<VerifyReceiptInclusion>,
    leaf: [u8; 32],
    leaf_index: u64,
    siblings: Vec<[u8; 32]>,
) -> Result<()> {
    require!(
        leaf_index < ctx.accounts.checkpoint.leaf_count,
        TrustSubstrateError::ProofIndexOutOfRange
    );
    require!(
        verify_inclusion(
            leaf,
            &siblings,
            leaf_index,
            ctx.accounts.checkpoint.leaf_count,
            ctx.accounts.checkpoint.root,
        ),
        TrustSubstrateError::InvalidMerkleProof
    );

    Ok(())
}

#[derive(Accounts)]
pub struct VerifyReceiptInclusion<'info> {
    #[account(
        seeds = [
            CHECKPOINT_SEED,
            checkpoint.identity.as_ref(),
            checkpoint.epoch.to_le_bytes().as_ref()
        ],
        bump = checkpoint.bump
    )]
    pub checkpoint: Account<'info, HistoryCheckpoint>,
}
