use anchor_lang::prelude::*;
use anchor_spl::token_interface::{self, Mint, TokenAccount, TokenInterface, TransferChecked};
use trust_substrate_core::{TrustSubstrateError, TOKEN_STAKE_SEED};

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
}
