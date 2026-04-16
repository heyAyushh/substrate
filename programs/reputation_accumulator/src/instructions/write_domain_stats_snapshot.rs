use anchor_lang::prelude::*;
use trust_substrate_core::{TrustSubstrateError, DOMAIN_STATS_SEED};

use crate::state::{DomainStatsSnapshot, ReputationDomainCatalog};

pub fn handler(
    ctx: Context<WriteDomainStatsSnapshot>,
    domain: [u8; 32],
    receipt_count: u64,
    task_count: u64,
    agent_count: u64,
    snapshot_slot: u64,
    payload_hash: [u8; 32],
) -> Result<()> {
    require!(
        ctx.accounts.domain_catalog.is_domain_registered(&domain),
        TrustSubstrateError::DomainNotRegistered
    );

    let snapshot = &mut ctx.accounts.domain_stats_snapshot;
    snapshot.domain = domain;
    snapshot.operator = ctx.accounts.operator.key();
    snapshot.receipt_count = receipt_count;
    snapshot.task_count = task_count;
    snapshot.agent_count = agent_count;
    snapshot.snapshot_slot = snapshot_slot;
    snapshot.payload_hash = payload_hash;
    snapshot.bump = ctx.bumps.domain_stats_snapshot;

    Ok(())
}

#[derive(Accounts)]
#[instruction(
    domain: [u8; 32],
    receipt_count: u64,
    task_count: u64,
    agent_count: u64,
    snapshot_slot: u64,
    payload_hash: [u8; 32]
)]
pub struct WriteDomainStatsSnapshot<'info> {
    #[account(mut)]
    pub operator: Signer<'info>,
    pub domain_catalog: Account<'info, ReputationDomainCatalog>,
    #[account(
        init,
        payer = operator,
        space = 8 + DomainStatsSnapshot::INIT_SPACE,
        seeds = [
            DOMAIN_STATS_SEED,
            domain.as_ref(),
            operator.key().as_ref(),
            snapshot_slot.to_le_bytes().as_ref()
        ],
        bump
    )]
    pub domain_stats_snapshot: Account<'info, DomainStatsSnapshot>,
    pub system_program: Program<'info, System>,
}
