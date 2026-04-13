use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct AppliedReputationReceipt {
    pub reputation: Pubkey,
    pub receipt: Pubkey,
    pub bump: u8,
}
