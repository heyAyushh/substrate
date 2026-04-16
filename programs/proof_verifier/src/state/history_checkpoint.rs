use anchor_lang::prelude::*;
use trust_substrate_core::MERKLE_FRONTIER_HEIGHT;

#[account]
#[derive(InitSpace)]
pub struct HistoryCheckpoint {
    pub identity: Pubkey,
    pub epoch: u64,
    pub root: [u8; 32],
    pub previous_root: [u8; 32],
    pub leaf_count: u64,
    pub latest_committed_receipt: Pubkey,
    pub latest_task: Pubkey,
    pub latest_sequence: u64,
    pub frontier: [[u8; 32]; MERKLE_FRONTIER_HEIGHT],
    pub bump: u8,
}
