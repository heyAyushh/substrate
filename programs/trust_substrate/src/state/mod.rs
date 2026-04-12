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

#[account]
#[derive(InitSpace)]
pub struct TaskRecord {
    pub identity: Pubkey,
    pub task_id: [u8; 32],
    pub subtask_root: [u8; 32],
    pub subtask_count: u16,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct ReceiptRecord {
    pub identity: Pubkey,
    pub task: Pubkey,
    pub receipt_id: [u8; 32],
    pub actor: Pubkey,
    pub kind: u8,
    pub sequence: u64,
    pub domain: [u8; 32],
    pub previous_receipt: [u8; 32],
    pub payload_hash: [u8; 32],
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct DelegationRecord {
    pub identity: Pubkey,
    pub delegate: Pubkey,
    pub allowed_actions: u8,
    pub expires_at_slot: u64,
    pub revoked: bool,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct HistoryCheckpoint {
    pub identity: Pubkey,
    pub epoch: u64,
    pub root: [u8; 32],
    pub leaf_count: u64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct ReputationAccumulator {
    pub identity: Pubkey,
    pub domain: [u8; 32],
    pub completed: u64,
    pub disputed: u64,
    pub bump: u8,
}
