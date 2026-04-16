use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct DelegationRecord {
    pub identity: Pubkey,
    pub delegate: Pubkey,
    pub allowed_actions: u8,
    pub expires_at_slot: u64,
    pub revoke_at_slot: u64,
    pub revoked: bool,
    pub bump: u8,
}
