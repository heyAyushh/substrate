use crate::{
    events::InclusionVerified,
    state::{HistoryCheckpoint, LatestCheckpoint},
    TrustSubstrateError, CHECKPOINT_SEED,
};
use anchor_lang::prelude::*;
use trust_substrate_core::{verify_inclusion, LATEST_CHECKPOINT_SEED};

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
    require_keys_eq!(
        ctx.accounts.latest_checkpoint.checkpoint,
        ctx.accounts.checkpoint.key(),
        TrustSubstrateError::StaleCheckpoint
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

    emit!(InclusionVerified {
        identity: ctx.accounts.checkpoint.identity,
        checkpoint: ctx.accounts.checkpoint.key(),
        receipt: leaf,
        slot: Clock::get()?.slot,
    });

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
    pub checkpoint: Box<Account<'info, HistoryCheckpoint>>,
    #[account(
        seeds = [
            LATEST_CHECKPOINT_SEED,
            checkpoint.identity.as_ref()
        ],
        bump = latest_checkpoint.bump,
        constraint = latest_checkpoint.identity == checkpoint.identity @ TrustSubstrateError::CheckpointIdentityMismatch
    )]
    pub latest_checkpoint: Box<Account<'info, LatestCheckpoint>>,
}
