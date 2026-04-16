use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct RuntimeAttestation {
    pub identity: Pubkey,
    pub runtime_commit: [u8; 32],
    pub runtime_authority: Pubkey,
    pub valid_from_slot: u64,
    pub bump: u8,
}
