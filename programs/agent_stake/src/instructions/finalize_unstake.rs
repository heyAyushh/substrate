use anchor_lang::prelude::*;
use trust_substrate_core::{TrustSubstrateError, STAKE_SEED};

use crate::state::StakeAccount;
use crate::StakeUnstakeFinalized;

pub fn handler(ctx: Context<FinalizeUnstake>) -> Result<()> {
    require_keys_eq!(
        ctx.accounts.stake.owner,
        ctx.accounts.owner.key(),
        TrustSubstrateError::StakeAuthorityMismatch
    );

    let amount = ctx.accounts.stake.pending_unstake_amount;
    require!(amount > 0, TrustSubstrateError::StakeInsufficient);
    let slot = Clock::get()?.slot;
    require!(
        slot >= ctx.accounts.stake.unstake_unlocks_at,
        TrustSubstrateError::StakeCooldownNotElapsed
    );
    require!(
        amount <= ctx.accounts.stake.amount,
        TrustSubstrateError::StakeInsufficient
    );

    ctx.accounts.stake.amount = ctx
        .accounts
        .stake
        .amount
        .checked_sub(amount)
        .ok_or(TrustSubstrateError::StakeInsufficient)?;
    ctx.accounts.stake.pending_unstake_amount = 0;
    ctx.accounts.stake.unstake_unlocks_at = 0;

    let stake_info = ctx.accounts.stake.to_account_info();
    let owner_info = ctx.accounts.owner.to_account_info();

    **stake_info.try_borrow_mut_lamports()? = stake_info
        .lamports()
        .checked_sub(amount)
        .ok_or(TrustSubstrateError::StakeInsufficient)?;
    **owner_info.try_borrow_mut_lamports()? = owner_info
        .lamports()
        .checked_add(amount)
        .ok_or(TrustSubstrateError::StakeAmountOverflow)?;

    if ctx.accounts.stake.amount == 0 && ctx.accounts.stake.pending_unstake_amount == 0 {
        let identity_cpi_accounts = identity_registry::cpi::accounts::SetStakeActive {
            authority: ctx.accounts.owner.to_account_info(),
            identity: ctx.accounts.identity.to_account_info(),
        };
        let identity_cpi = CpiContext::new(
            ctx.accounts.identity_registry_program.key(),
            identity_cpi_accounts,
        );
        identity_registry::cpi::set_stake_active(identity_cpi, false)?;
    }

    emit!(StakeUnstakeFinalized {
        identity: ctx.accounts.stake.identity,
        authority: ctx.accounts.owner.key(),
        amount,
        slot,
    });

    Ok(())
}

#[derive(Accounts)]
pub struct FinalizeUnstake<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(mut)]
    pub identity: Account<'info, identity_registry::state::AgentIdentity>,
    #[account(
        mut,
        seeds = [STAKE_SEED, stake.identity.as_ref()],
        bump = stake.bump
    )]
    pub stake: Account<'info, StakeAccount>,
    pub identity_registry_program: Program<'info, identity_registry::program::IdentityRegistry>,
}
