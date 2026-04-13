use crate::{
    identity_registry::state::AgentIdentity, state::HistoryCheckpoint, TrustSubstrateError,
    CHECKPOINT_SEED,
};
use anchor_lang::prelude::*;
use trust_substrate_core::EMPTY_MERKLE_ROOT;

pub fn handler(
    ctx: Context<CheckpointHistory>,
    epoch: u64,
    root: [u8; 32],
    leaf_count: u64,
) -> Result<()> {
    require_keys_eq!(
        ctx.accounts.identity.authority,
        ctx.accounts.authority.key(),
        TrustSubstrateError::InvalidAuthority
    );

    let checkpoint = &mut ctx.accounts.checkpoint;
    checkpoint.identity = ctx.accounts.identity.key();
    checkpoint.epoch = epoch;
    checkpoint.root = root;
    checkpoint.previous_root = EMPTY_MERKLE_ROOT;
    checkpoint.leaf_count = leaf_count;
    checkpoint.bump = ctx.bumps.checkpoint;

    Ok(())
}

#[derive(Accounts)]
#[instruction(epoch: u64)]
pub struct CheckpointHistory<'info> {
    pub identity: Account<'info, AgentIdentity>,
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        init,
        payer = authority,
        space = 8 + HistoryCheckpoint::INIT_SPACE,
        seeds = [CHECKPOINT_SEED, identity.key().as_ref(), epoch.to_le_bytes().as_ref()],
        bump
    )]
    pub checkpoint: Account<'info, HistoryCheckpoint>,
    pub system_program: Program<'info, System>,
}
