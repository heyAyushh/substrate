use anchor_lang::prelude::*;

#[event]
pub struct AuthorityRotationRequested {
    pub identity: Pubkey,
    pub previous_authority: Pubkey,
    pub new_authority: Pubkey,
    pub unlock_slot: u64,
    pub slot: u64,
}

#[event]
pub struct AuthorityRotated {
    pub identity: Pubkey,
    pub previous_authority: Pubkey,
    pub new_authority: Pubkey,
    pub slot: u64,
    pub mode: u8,
}
