use anchor_lang::prelude::*;

#[event]
pub struct CheckpointCreated {
    pub identity: Pubkey,
    pub epoch: u64,
    pub root: [u8; 32],
    pub leaf_count: u64,
    pub slot: u64,
}

#[event]
pub struct CheckpointRotated {
    pub identity: Pubkey,
    pub epoch: u64,
    pub previous_root: [u8; 32],
    pub new_root: [u8; 32],
    pub leaf_count: u64,
    pub slot: u64,
}

#[event]
pub struct InclusionVerified {
    pub identity: Pubkey,
    pub checkpoint: Pubkey,
    pub receipt: [u8; 32],
    pub slot: u64,
}
