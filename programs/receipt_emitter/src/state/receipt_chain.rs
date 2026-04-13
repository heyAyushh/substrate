use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct ReceiptChain {
    pub identity: Pubkey,
    pub task: Pubkey,
    pub last_receipt: Pubkey,
    pub last_sequence: u64,
    pub bump: u8,
}
