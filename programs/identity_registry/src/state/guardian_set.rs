use anchor_lang::prelude::*;
use trust_substrate_core::MAX_GUARDIANS;

#[account]
#[derive(InitSpace)]
pub struct GuardianSet {
    pub identity: Pubkey,
    #[max_len(MAX_GUARDIANS)]
    pub guardians: Vec<Pubkey>,
    pub threshold: u8,
    pub bump: u8,
}
