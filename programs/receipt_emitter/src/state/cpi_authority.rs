use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct CpiAuthority {
    pub bump: u8,
}
