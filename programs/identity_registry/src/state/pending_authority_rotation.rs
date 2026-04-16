use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct PendingAuthorityRotation {
    pub identity: Pubkey,
    pub previous_authority: Pubkey,
    pub new_authority: Pubkey,
    pub unlock_slot: u64,
    pub bump: u8,
}
