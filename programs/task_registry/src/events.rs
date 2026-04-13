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
