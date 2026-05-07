use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct TokenStakeAccount {
    pub identity: Pubkey,
    pub owner: Pubkey,
    pub slash_authority: Pubkey,
    pub trust_mode: u8,
    pub scope: Pubkey,
    pub mint: Pubkey,
    pub token_program: Pubkey,
    pub vault: Pubkey,
    pub amount: u64,
    pub pending_unstake_amount: u64,
    pub unstake_unlocks_at: u64,
    pub slashed_total: u64,
    pub bump: u8,
    pub vault_bump: u8,
}
