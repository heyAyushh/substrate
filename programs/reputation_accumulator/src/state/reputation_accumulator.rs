use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct ReputationAccumulator {
    pub identity: Pubkey,
    pub domain: [u8; 32],
    pub completed: u64,
    pub disputed: u64,
    pub resolved: u64,
    pub attested: u64,
    pub weighted_completed: u64,
    pub weighted_disputed: u64,
    pub weighted_resolved: u64,
    pub weighted_attested: u64,
    pub reviewer_weight_sum: u64,
    pub slash_penalty_sum: u64,
    pub last_applied_slot: u64,
    pub completion_weight: u64,
    pub dispute_weight: u64,
    pub dispute_resolved_weight: u64,
    pub bump: u8,
}
