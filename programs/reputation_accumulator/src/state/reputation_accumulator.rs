use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct ReputationAccumulator {
    pub identity: Pubkey,
    pub domain: [u8; 32],
    pub completed: u64,
    pub disputed: u64,
    pub resolved: u64,
    pub completion_weight: u64,
    pub dispute_weight: u64,
    pub dispute_resolved_weight: u64,
    pub bump: u8,
}
