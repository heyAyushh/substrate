use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct DisputeVerdict {
    pub dispute_receipt: Pubkey,
    pub target_identity: Pubkey,
    pub outcome: u8,
    pub slash_amount: u64,
    pub adjudicator: Pubkey,
    pub created_at_slot: u64,
    pub bump: u8,
}
