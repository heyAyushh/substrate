use crate::{
    events::CheckpointReceiptAppended,
    state::{HistoryCheckpoint, HistoryUpdater, LatestCheckpoint},
    TrustSubstrateError, CHECKPOINT_SEED,
};
use anchor_lang::prelude::*;
use identity_registry::state::AgentIdentity;
use receipt_emitter::state::ReceiptRecord;
use std::cmp::Ordering;
use trust_substrate_core::{append_leaf, frontier_root, LATEST_CHECKPOINT_SEED};

pub fn handler(ctx: Context<AppendReceiptToCheckpoint>) -> Result<()> {
    require_keys_eq!(
        ctx.accounts.receipt.identity,
        ctx.accounts.checkpoint.identity,
        TrustSubstrateError::CheckpointReceiptIdentityMismatch
    );
    require_keys_eq!(
        ctx.accounts.identity.key(),
        ctx.accounts.checkpoint.identity,
        TrustSubstrateError::CheckpointIdentityMismatch
    );
    require_keys_eq!(
        ctx.accounts.latest_checkpoint.checkpoint,
        ctx.accounts.checkpoint.key(),
        TrustSubstrateError::StaleCheckpoint
    );
    require!(
        !ctx.accounts.checkpoint.imported,
        TrustSubstrateError::CheckpointImportedIsReadOnly
    );

    let checkpoint = &mut ctx.accounts.checkpoint;
    let receipt_key = ctx.accounts.receipt.key();

    if checkpoint.leaf_count > 0 {
        require_keys_neq!(
            checkpoint.latest_committed_receipt,
            receipt_key,
            TrustSubstrateError::CheckpointReceiptAlreadyAppended
        );
    }
    require!(
        receipt_position_after(checkpoint, &ctx.accounts.receipt),
        TrustSubstrateError::CheckpointOrderingViolation
    );

    let previous_leaf_count = checkpoint.leaf_count;
    let next_leaf_count = append_leaf(
        &mut checkpoint.frontier,
        previous_leaf_count,
        trust_substrate_core::hash_leaf(receipt_key.as_ref()),
    )
    .ok_or(TrustSubstrateError::CheckpointLeafCountOverflow)?;

    checkpoint.leaf_count = next_leaf_count;
    checkpoint.root = frontier_root(&checkpoint.frontier, checkpoint.leaf_count);
    checkpoint.latest_committed_receipt = receipt_key;
    checkpoint.latest_task = ctx.accounts.receipt.task;
    checkpoint.latest_sequence = ctx.accounts.receipt.sequence;

    let latest_checkpoint = &mut ctx.accounts.latest_checkpoint;
    latest_checkpoint.root = checkpoint.root;

    emit!(CheckpointReceiptAppended {
        identity: checkpoint.identity,
        checkpoint: checkpoint.key(),
        receipt: receipt_key,
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

fn receipt_position_after(checkpoint: &HistoryCheckpoint, receipt: &ReceiptRecord) -> bool {
    if checkpoint.leaf_count == 0 {
        return receipt.sequence == 1;
    }

    match receipt
        .task
        .to_bytes()
        .cmp(&checkpoint.latest_task.to_bytes())
    {
        Ordering::Greater => receipt.sequence == 1,
        Ordering::Equal => receipt.sequence == checkpoint.latest_sequence.saturating_add(1),
        Ordering::Less => false,
    }
}

#[derive(Accounts)]
pub struct AppendReceiptToCheckpoint<'info> {
    #[account(
        mut,
        constraint = identity.key() == checkpoint.identity @ TrustSubstrateError::CheckpointIdentityMismatch
    )]
    pub identity: Account<'info, AgentIdentity>,
    #[account(
        mut,
        seeds = [
            CHECKPOINT_SEED,
            checkpoint.identity.as_ref(),
            checkpoint.epoch.to_le_bytes().as_ref()
        ],
        bump = checkpoint.bump
    )]
    pub checkpoint: Box<Account<'info, HistoryCheckpoint>>,
    #[account(
        mut,
        seeds = [LATEST_CHECKPOINT_SEED, checkpoint.identity.as_ref()],
        bump = latest_checkpoint.bump,
        constraint = latest_checkpoint.identity == checkpoint.identity @ TrustSubstrateError::CheckpointIdentityMismatch
    )]
    pub latest_checkpoint: Box<Account<'info, LatestCheckpoint>>,
    pub receipt: Account<'info, ReceiptRecord>,
    #[account(
        seeds = [b"history_updater"],
        bump
    )]
    pub history_updater: Account<'info, HistoryUpdater>,
    pub identity_registry_program: Program<'info, ::identity_registry::program::IdentityRegistry>,
}
