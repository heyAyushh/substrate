use anchor_lang::prelude::*;
use trust_substrate_core::MAX_ATTESTER_CATEGORY_LEN;

#[account]
#[derive(InitSpace)]
pub struct AttesterRecord {
    pub identity: Pubkey,
    pub authority: Pubkey,
    #[max_len(MAX_ATTESTER_CATEGORY_LEN)]
    pub category: String,
    pub self_declared_tier: u8,
    pub effective_tier: u8,
    pub bond_lamports: u64,
    pub bump: u8,
}
