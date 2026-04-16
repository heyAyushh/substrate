use crate::{
    identity_registry::state::AgentIdentity,
    state::{HistoryCheckpoint, HistoryUpdater, LatestCheckpoint},
    CheckpointCreated,
    TrustSubstrateError, CHECKPOINT_SEED,
};
use anchor_lang::prelude::*;
use trust_substrate_core::{empty_frontier, EMPTY_MERKLE_ROOT, LATEST_CHECKPOINT_SEED};

pub fn handler(ctx: Context<InitializeCheckpoint>, epoch: u64) -> Result<()> {
    require_keys_eq!(
        ctx.accounts.identity.authority,
        ctx.accounts.authority.key(),
        TrustSubstrateError::CheckpointAuthorityMismatch
    );

    let checkpoint = &mut ctx.accounts.checkpoint;
    checkpoint.identity = ctx.accounts.identity.key();
    checkpoint.epoch = epoch;
    checkpoint.root = EMPTY_MERKLE_ROOT;
    checkpoint.previous_root = EMPTY_MERKLE_ROOT;
    checkpoint.leaf_count = 0;
    checkpoint.latest_committed_receipt = Pubkey::default();
    checkpoint.latest_task = Pubkey::default();
    checkpoint.latest_sequence = 0;
    checkpoint.frontier = empty_frontier();
    checkpoint.bump = ctx.bumps.checkpoint;

    let latest_checkpoint = &mut ctx.accounts.latest_checkpoint;
    latest_checkpoint.identity = ctx.accounts.identity.key();
    latest_checkpoint.checkpoint = checkpoint.key();
    latest_checkpoint.epoch = epoch;
    latest_checkpoint.root = EMPTY_MERKLE_ROOT;
    latest_checkpoint.bump = ctx.bumps.latest_checkpoint;

    emit!(CheckpointCreated {
        identity: checkpoint.identity,
        epoch,
        root: checkpoint.root,
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
#[instruction(epoch: u64)]
pub struct InitializeCheckpoint<'info> {
    #[account(mut)]
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
    pub checkpoint: Box<Account<'info, HistoryCheckpoint>>,
    #[account(
        init,
        payer = authority,
        space = 8 + LatestCheckpoint::INIT_SPACE,
        seeds = [LATEST_CHECKPOINT_SEED, identity.key().as_ref()],
        bump
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
