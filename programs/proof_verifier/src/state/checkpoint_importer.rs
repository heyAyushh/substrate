use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct CheckpointImporter {
    pub authority: Pubkey,
    pub bump: u8,
}
