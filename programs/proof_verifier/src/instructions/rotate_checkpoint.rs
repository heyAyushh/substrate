use crate::{
    state::{HistoryCheckpoint, HistoryUpdater, LatestCheckpoint},
    CheckpointRotated, TrustSubstrateError, CHECKPOINT_SEED,
};
use anchor_lang::prelude::*;
use identity_registry::state::AgentIdentity;
use trust_substrate_core::{empty_frontier, EMPTY_MERKLE_ROOT, LATEST_CHECKPOINT_SEED};

pub fn handler(ctx: Context<RotateCheckpoint>, new_epoch: u64) -> Result<()> {
    require_keys_eq!(
        ctx.accounts.identity.authority,
        ctx.accounts.authority.key(),
        TrustSubstrateError::CheckpointAuthorityMismatch
    );
    require_keys_eq!(
        ctx.accounts.previous_checkpoint.identity,
        ctx.accounts.identity.key(),
        TrustSubstrateError::CheckpointIdentityMismatch
    );
    require_keys_eq!(
        ctx.accounts.latest_checkpoint.checkpoint,
        ctx.accounts.previous_checkpoint.key(),
        TrustSubstrateError::StaleCheckpoint
    );
    let expected_epoch = ctx
        .accounts
        .previous_checkpoint
        .epoch
        .checked_add(1)
        .ok_or(TrustSubstrateError::CheckpointEpochOverflow)?;
    require!(
        new_epoch == expected_epoch,
        TrustSubstrateError::CheckpointEpochNotSequential
    );

    let checkpoint = &mut ctx.accounts.checkpoint;
    checkpoint.identity = ctx.accounts.identity.key();
    checkpoint.epoch = new_epoch;
    checkpoint.imported = false;
    checkpoint.root = EMPTY_MERKLE_ROOT;
    checkpoint.previous_root = ctx.accounts.previous_checkpoint.root;
    checkpoint.leaf_count = 0;
    checkpoint.latest_committed_receipt = Pubkey::default();
    checkpoint.latest_task = Pubkey::default();
    checkpoint.latest_sequence = 0;
    checkpoint.frontier = empty_frontier();
    checkpoint.bump = ctx.bumps.checkpoint;

    let latest_checkpoint = &mut ctx.accounts.latest_checkpoint;
    latest_checkpoint.checkpoint = checkpoint.key();
    latest_checkpoint.epoch = new_epoch;
    latest_checkpoint.root = checkpoint.root;

    emit!(CheckpointRotated {
        identity: checkpoint.identity,
        epoch: new_epoch,
        previous_root: checkpoint.previous_root,
        new_root: checkpoint.root,
        leaf_count: checkpoint.leaf_count,
        slot: Clock::get()?.slot,
    });

    let cpi_accounts = ::identity_registry::cpi::accounts::UpdateHistoryRoot {
        identity: ctx.accounts.identity.to_account_info(),
        history_updater: ctx.accounts.history_updater.to_account_info(),
    };
    let signer_seeds: &[&[&[u8]]] = &[&[b"history_updater", &[ctx.bumps.history_updater][..]]];
    let cpi_ctx = CpiContext::new_with_signer(
        ctx.accounts.identity_registry_program.key(),
        cpi_accounts,
        signer_seeds,
    );
    ::identity_registry::cpi::update_history_root(cpi_ctx, checkpoint.root)?;

    Ok(())
}

#[derive(Accounts)]
#[instruction(new_epoch: u64)]
pub struct RotateCheckpoint<'info> {
    #[account(mut)]
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
    pub previous_checkpoint: Box<Account<'info, HistoryCheckpoint>>,
    #[account(
        init,
        payer = authority,
        space = 8 + HistoryCheckpoint::INIT_SPACE,
        seeds = [CHECKPOINT_SEED, identity.key().as_ref(), new_epoch.to_le_bytes().as_ref()],
        bump
    )]
    pub checkpoint: Box<Account<'info, HistoryCheckpoint>>,
    #[account(
        mut,
        seeds = [LATEST_CHECKPOINT_SEED, identity.key().as_ref()],
        bump = latest_checkpoint.bump,
        constraint = latest_checkpoint.identity == identity.key() @ TrustSubstrateError::CheckpointIdentityMismatch
    )]
    pub latest_checkpoint: Box<Account<'info, LatestCheckpoint>>,
    #[account(
        seeds = [b"history_updater"],
        bump
    )]
    pub history_updater: Account<'info, HistoryUpdater>,
    pub identity_registry_program: Program<'info, ::identity_registry::program::IdentityRegistry>,
    pub system_program: Program<'info, System>,
}
