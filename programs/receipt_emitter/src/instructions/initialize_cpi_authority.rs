use crate::state::CpiAuthority;
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct InitializeCpiAuthority<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(
        init,
        payer = payer,
        space = 8 + CpiAuthority::INIT_SPACE,
        seeds = [b"cpi_authority"],
        bump
    )]
    pub cpi_authority: Account<'info, CpiAuthority>,
    pub system_program: Program<'info, System>,
}

pub fn handler(_ctx: Context<InitializeCpiAuthority>) -> Result<()> {
    Ok(())
}
