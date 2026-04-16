use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct AgentIdentity {
    pub authority: Pubkey,
    pub agent_id: [u8; 32],
    pub policy_root: [u8; 32],
    pub history_root: [u8; 32],
    pub tier: u8,
    pub open_task_count: u32,
    pub open_challenge_count: u32,
    pub active_stake: bool,
    pub bump: u8,
}
