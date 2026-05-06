use anchor_lang::prelude::*;

#[event]
pub struct TaskStatusSynced {
    pub identity: Pubkey,
    pub task: Pubkey,
    pub receipt: Pubkey,
    pub kind: u8,
    pub new_status: u8,
    pub slot: u64,
}

#[event]
pub struct SocietyWorldSynced {
    pub identity: Pubkey,
    pub task: Pubkey,
    pub society_world: Pubkey,
    pub current_tick: u32,
    pub last_sequence: u64,
    pub status: u8,
    pub state_hash: [u8; 32],
    pub slot: u64,
}
