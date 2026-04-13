use anchor_lang::prelude::*;
use identity_registry::state::AgentIdentity;
use trust_substrate_core::{TrustSubstrateError, STAKE_SEED};

use crate::state::StakeAccount;

pub fn handler(ctx: Context<InitializeStake>, slash_authority: Pubkey) -> Result<()> {
    require_keys_eq!(
        ctx.accounts.identity.authority,
        ctx.accounts.owner.key(),
        TrustSubstrateError::StakeAuthorityMismatch
    );

    let stake = &mut ctx.accounts.stake;
    stake.identity = ctx.accounts.identity.key();
    stake.owner = ctx.accounts.owner.key();
    stake.slash_authority = slash_authority;
    stake.amount = 0;
    stake.pending_unstake_amount = 0;
    stake.unstake_unlocks_at = 0;
    stake.slashed_total = 0;
    stake.bump = ctx.bumps.stake;

    Ok(())
}

#[derive(Accounts)]
pub struct InitializeStake<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    pub identity: Account<'info, AgentIdentity>,
    #[account(
        init,
        payer = owner,
        space = 8 + StakeAccount::INIT_SPACE,
        seeds = [STAKE_SEED, identity.key().as_ref()],
        bump
    )]
    pub stake: Account<'info, StakeAccount>,
    pub system_program: Program<'info, System>,
}
