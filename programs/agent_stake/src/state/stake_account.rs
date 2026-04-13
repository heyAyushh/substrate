use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct StakeAccount {
    pub identity: Pubkey,
    pub owner: Pubkey,
    pub slash_authority: Pubkey,
    pub amount: u64,
    pub pending_unstake_amount: u64,
    pub unstake_unlocks_at: u64,
    pub slashed_total: u64,
    pub bump: u8,
}
