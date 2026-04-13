use anchor_lang::prelude::*;

#[event]
pub struct DelegationCreated {
    pub identity: Pubkey,
    pub delegate: Pubkey,
    pub allowed_actions: u8,
    pub expires_at_slot: u64,
    pub slot: u64,
}

#[event]
pub struct DelegationRevoked {
    pub identity: Pubkey,
    pub delegate: Pubkey,
    pub slot: u64,
}
