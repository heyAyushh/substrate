use crate::{
    identity_registry::state::AgentIdentity, state::HistoryCheckpoint, TrustSubstrateError,
    CHECKPOINT_SEED,
};
use anchor_lang::prelude::*;

pub fn handler(
    ctx: Context<RotateCheckpoint>,
    new_epoch: u64,
    new_root: [u8; 32],
    new_leaf_count: u64,
) -> Result<()> {
    require_keys_eq!(
        ctx.accounts.identity.authority,
        ctx.accounts.authority.key(),
        TrustSubstrateError::InvalidAuthority
    );
    require_keys_eq!(
        ctx.accounts.previous_checkpoint.identity,
        ctx.accounts.identity.key(),
        TrustSubstrateError::CheckpointIdentityMismatch
    );
    require!(
        new_epoch
            == ctx
                .accounts
                .previous_checkpoint
                .epoch
                .checked_add(1)
                .ok_or(TrustSubstrateError::InvalidTaskStatusTransition)?,
        TrustSubstrateError::InvalidTaskStatusTransition
    );
    require!(
        new_leaf_count >= ctx.accounts.previous_checkpoint.leaf_count,
        TrustSubstrateError::InvalidTaskStatusTransition
    );

    let checkpoint = &mut ctx.accounts.checkpoint;
    checkpoint.identity = ctx.accounts.identity.key();
    checkpoint.epoch = new_epoch;
    checkpoint.root = new_root;
    checkpoint.previous_root = ctx.accounts.previous_checkpoint.root;
    checkpoint.leaf_count = new_leaf_count;
    checkpoint.bump = ctx.bumps.checkpoint;

    Ok(())
}

#[derive(Accounts)]
#[instruction(new_epoch: u64)]
pub struct RotateCheckpoint<'info> {
    pub identity: Account<'info, AgentIdentity>,
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        seeds = [
            CHECKPOINT_SEED,
            identity.key().as_ref(),
            previous_checkpoint.epoch.to_le_bytes().as_ref()
        ],
        bump = previous_checkpoint.bump
    )]
    pub previous_checkpoint: Account<'info, HistoryCheckpoint>,
    #[account(
        init,
        payer = authority,
        space = 8 + HistoryCheckpoint::INIT_SPACE,
        seeds = [CHECKPOINT_SEED, identity.key().as_ref(), new_epoch.to_le_bytes().as_ref()],
        bump
    )]
    pub checkpoint: Account<'info, HistoryCheckpoint>,
    pub system_program: Program<'info, System>,
}
