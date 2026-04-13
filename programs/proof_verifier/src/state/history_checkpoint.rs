use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct HistoryCheckpoint {
    pub identity: Pubkey,
    pub epoch: u64,
    pub root: [u8; 32],
    pub previous_root: [u8; 32],
    pub leaf_count: u64,
    pub bump: u8,
}
