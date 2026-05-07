use anchor_lang::prelude::*;
use anchor_spl::token::accessor;
use anchor_spl::token_interface::{self, Mint, TokenAccount, TokenInterface, TransferChecked};
use trust_substrate_core::{TrustSubstrateError, TOKEN_STAKE_SEED};

use crate::instructions::identity_stake_activity::sync_token_stake_activity;
use crate::state::TokenStakeAccount;
use crate::TokenStakeUnstakeFinalized;

pub fn handler(ctx: Context<FinalizeUnstakeToken>) -> Result<()> {
    require_keys_eq!(
        ctx.accounts.token_stake.owner,
        ctx.accounts.owner.key(),
        TrustSubstrateError::StakeAuthorityMismatch
    );
    require_keys_eq!(
        ctx.accounts.token_stake.token_program,
        ctx.accounts.token_program.key(),
        TrustSubstrateError::StakeTokenProgramMismatch
    );

    let amount = ctx.accounts.token_stake.pending_unstake_amount;
    require!(amount > 0, TrustSubstrateError::StakeInsufficient);
    let slot = Clock::get()?.slot;
    require!(
        slot >= ctx.accounts.token_stake.unstake_unlocks_at,
        TrustSubstrateError::StakeCooldownNotElapsed
    );
    require!(
        amount <= ctx.accounts.token_stake.amount,
        TrustSubstrateError::StakeInsufficient
    );
    let was_active = ctx.accounts.token_stake.amount > 0;

    ctx.accounts.token_stake.amount = ctx
        .accounts
        .token_stake
        .amount
        .checked_sub(amount)
        .ok_or(TrustSubstrateError::StakeInsufficient)?;
    ctx.accounts.token_stake.pending_unstake_amount = 0;
    ctx.accounts.token_stake.unstake_unlocks_at = 0;

    let identity = ctx.accounts.token_stake.identity;
    let scope = ctx.accounts.token_stake.scope;
    let mint = ctx.accounts.token_stake.mint;
    let owner_balance_before =
        accessor::amount(&ctx.accounts.owner_token_account.to_account_info())?;
    let bump = [ctx.accounts.token_stake.bump];
    let signer_seeds = &[&[
        TOKEN_STAKE_SEED,
        identity.as_ref(),
        scope.as_ref(),
        mint.as_ref(),
        &bump,
    ][..]];

    token_interface::transfer_checked(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.key(),
            TransferChecked {
                from: ctx.accounts.vault.to_account_info(),
                mint: ctx.accounts.mint.to_account_info(),
                to: ctx.accounts.owner_token_account.to_account_info(),
                authority: ctx.accounts.token_stake.to_account_info(),
            },
            signer_seeds,
        ),
        amount,
        ctx.accounts.mint.decimals,
    )?;

    let owner_balance_after =
        accessor::amount(&ctx.accounts.owner_token_account.to_account_info())?;
    let received_amount = owner_balance_after
        .checked_sub(owner_balance_before)
        .ok_or(TrustSubstrateError::StakeTokenTransferAmountMismatch)?;
    require!(
        received_amount == amount,
        TrustSubstrateError::StakeTokenTransferAmountMismatch
    );

    if ctx.accounts.token_stake.amount == 0 && ctx.accounts.token_stake.pending_unstake_amount == 0
    {
        if was_active {
            sync_token_stake_activity(
                ctx.accounts.identity_registry_program.key(),
                ctx.accounts.token_stake.to_account_info(),
                ctx.accounts.identity.to_account_info(),
                identity,
                scope,
                mint,
                ctx.accounts.token_stake.bump,
                false,
            )?;
        }
    }

    emit!(TokenStakeUnstakeFinalized {
        identity,
        authority: ctx.accounts.owner.key(),
        scope,
        mint,
        amount,
        slot,
    });

    Ok(())
}

#[derive(Accounts)]
pub struct FinalizeUnstakeToken<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(
        mut,
        seeds = [
            TOKEN_STAKE_SEED,
            token_stake.identity.as_ref(),
            token_stake.scope.as_ref(),
            token_stake.mint.as_ref()
        ],
        bump = token_stake.bump
    )]
    pub token_stake: Account<'info, TokenStakeAccount>,
    #[account(mut, address = token_stake.identity @ TrustSubstrateError::StakeIdentityMismatch)]
    /// CHECK: The address is pinned to the token stake identity;
    /// identity_registry deserializes and validates it during the CPI.
    pub identity: UncheckedAccount<'info>,
    #[account(address = token_stake.mint @ TrustSubstrateError::StakeTokenMintMismatch)]
    pub mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(
        mut,
        token::mint = mint,
        token::authority = owner,
        token::token_program = token_program
    )]
    pub owner_token_account: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        mut,
        address = token_stake.vault @ TrustSubstrateError::StakeTokenVaultMismatch,
        token::mint = mint,
        token::authority = token_stake,
        token::token_program = token_program
    )]
    pub vault: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(address = token_stake.token_program @ TrustSubstrateError::StakeTokenProgramMismatch)]
    pub token_program: Interface<'info, TokenInterface>,
    pub identity_registry_program: Program<'info, identity_registry::program::IdentityRegistry>,
}
