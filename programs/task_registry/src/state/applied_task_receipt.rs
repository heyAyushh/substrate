use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct AppliedTaskReceipt {
    pub task: Pubkey,
    pub receipt: Pubkey,
    pub bump: u8,
}
