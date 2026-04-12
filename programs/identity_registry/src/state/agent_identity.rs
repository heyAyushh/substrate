use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct AgentIdentity {
    pub authority: Pubkey,
    pub agent_id: [u8; 32],
    pub policy_root: [u8; 32],
    pub history_root: [u8; 32],
    pub bump: u8,
}
