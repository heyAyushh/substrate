use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct DomainStatsSnapshot {
    pub domain: [u8; 32],
    pub operator: Pubkey,
    pub receipt_count: u64,
    pub task_count: u64,
    pub agent_count: u64,
    pub snapshot_slot: u64,
    pub payload_hash: [u8; 32],
    pub bump: u8,
}
