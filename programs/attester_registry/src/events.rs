use anchor_lang::prelude::*;

#[event]
pub struct AttesterRegistryInitialized {
    pub curator: Pubkey,
    pub slot: u64,
}

#[event]
pub struct AttesterRegistered {
    pub identity: Pubkey,
    pub authority: Pubkey,
    pub category: String,
    pub self_declared_tier: u8,
    pub effective_tier: u8,
    pub bond_lamports: u64,
    pub slot: u64,
}

#[event]
pub struct AttesterTierUpdated {
    pub identity: Pubkey,
    pub curator: Pubkey,
    pub previous_tier: u8,
    pub effective_tier: u8,
    pub slot: u64,
}

#[event]
pub struct AttesterClosed {
    pub identity: Pubkey,
    pub authority: Pubkey,
    pub slot: u64,
}
