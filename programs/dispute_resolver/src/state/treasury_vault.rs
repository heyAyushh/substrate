use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct TreasuryVault {
    pub bump: u8,
}
