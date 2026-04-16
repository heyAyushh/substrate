use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct AttesterRegistryConfig {
    pub curator: Pubkey,
    pub bump: u8,
}
