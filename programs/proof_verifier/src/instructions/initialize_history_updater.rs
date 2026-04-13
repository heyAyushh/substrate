use anchor_lang::prelude::*;
use crate::state::HistoryUpdater;

#[derive(Accounts)]
pub struct InitializeHistoryUpdater<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(
        init,
        payer = payer,
        space = 8 + HistoryUpdater::INIT_SPACE,
        seeds = [b"history_updater"],
        bump
    )]
    pub history_updater: Account<'info, HistoryUpdater>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<InitializeHistoryUpdater>) -> Result<()> {
    ctx.accounts.history_updater.bump = ctx.bumps.history_updater;
    Ok(())
}
