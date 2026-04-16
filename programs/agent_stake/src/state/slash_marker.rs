use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct SlashMarker {
    pub stake: Pubkey,
    pub dispute_receipt: Pubkey,
    pub verdict: Pubkey,
    pub amount: u64,
    pub bump: u8,
}
