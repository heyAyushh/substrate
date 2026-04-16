use anchor_lang::prelude::*;
use identity_registry::state::AgentIdentity;
use trust_substrate_core::{is_valid_trust_mode, TrustSubstrateError, STAKE_SEED};

use crate::state::StakeAccount;
use crate::StakeInitialized;

pub fn handler(
    ctx: Context<InitializeStake>,
    slash_authority: Pubkey,
    trust_mode: u8,
) -> Result<()> {
    require!(
        is_valid_trust_mode(trust_mode),
        TrustSubstrateError::InvalidTrustMode
    );
    require_keys_eq!(
        ctx.accounts.identity.authority,
        ctx.accounts.owner.key(),
        TrustSubstrateError::StakeAuthorityMismatch
    );

    let stake = &mut ctx.accounts.stake;
    stake.identity = ctx.accounts.identity.key();
    stake.owner = ctx.accounts.owner.key();
    stake.slash_authority = slash_authority;
    stake.trust_mode = trust_mode;
    stake.amount = 0;
    stake.pending_unstake_amount = 0;
    stake.unstake_unlocks_at = 0;
    stake.slashed_total = 0;
    stake.bump = ctx.bumps.stake;

    emit!(StakeInitialized {
        identity: stake.identity,
        authority: stake.owner,
        slash_authority,
        trust_mode,
        slot: Clock::get()?.slot,
    });

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
