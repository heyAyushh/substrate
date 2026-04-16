use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct AdjudicatorConfig {
    pub governance: Pubkey,
    pub adjudicator: Pubkey,
    pub bump: u8,
}
