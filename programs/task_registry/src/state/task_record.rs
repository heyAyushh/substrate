use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct TaskRecord {
    pub identity: Pubkey,
    pub task_id: [u8; 32],
    pub subtask_root: [u8; 32],
    pub subtask_count: u16,
    pub status: u8,
    pub completed_count: u32,
    pub disputed_count: u32,
    pub resolved_count: u32,
    pub bump: u8,
}
