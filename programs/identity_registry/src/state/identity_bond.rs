use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct IdentityBond {
    pub identity: Pubkey,
    pub authority: Pubkey,
    pub amount: u64,
    pub bump: u8,
}
