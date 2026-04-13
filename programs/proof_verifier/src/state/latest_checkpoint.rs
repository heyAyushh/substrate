use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct LatestCheckpoint {
    pub identity: Pubkey,
    pub checkpoint: Pubkey,
    pub epoch: u64,
    pub root: [u8; 32],
    pub bump: u8,
}
