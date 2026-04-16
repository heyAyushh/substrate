use anchor_lang::prelude::*;

#[event]
pub struct StakeInitialized {
    pub identity: Pubkey,
    pub authority: Pubkey,
    pub slash_authority: Pubkey,
    pub trust_mode: u8,
    pub slot: u64,
}

#[event]
pub struct StakeDeposited {
    pub identity: Pubkey,
    pub authority: Pubkey,
    pub amount: u64,
    pub slot: u64,
}

#[event]
pub struct StakeUnstakeRequested {
    pub identity: Pubkey,
    pub authority: Pubkey,
    pub amount: u64,
    pub pending_unstake_amount: u64,
    pub unlocks_at_slot: u64,
    pub slot: u64,
}

#[event]
pub struct StakeUnstakeFinalized {
    pub identity: Pubkey,
    pub authority: Pubkey,
    pub amount: u64,
    pub slot: u64,
}

#[event]
pub struct StakeSlashedWithVerdict {
    pub identity: Pubkey,
    pub adjudicator: Pubkey,
    pub dispute_receipt: Pubkey,
    pub verdict: Pubkey,
    pub amount: u64,
    pub trust_mode: u8,
    pub slot: u64,
}

#[event]
pub struct StakeSlashedByAuthority {
    pub identity: Pubkey,
    pub slash_authority: Pubkey,
    pub dispute_receipt: Pubkey,
    pub amount: u64,
    pub trust_mode: u8,
    pub slot: u64,
}
