use anchor_lang::prelude::*;
use anchor_spl::token::accessor;
use anchor_spl::token_interface::{self, Mint, TokenAccount, TokenInterface, TransferChecked};
use trust_substrate_core::{TrustSubstrateError, TOKEN_STAKE_SEED};

use crate::instructions::identity_stake_activity::sync_token_stake_activity;
use crate::state::TokenStakeAccount;
use crate::TokenStakeDeposited;

pub fn handler(ctx: Context<StakeToken>, amount: u64) -> Result<()> {
    require!(amount > 0, TrustSubstrateError::StakeAmountMustBePositive);
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
    let was_inactive = ctx.accounts.token_stake.amount == 0;
    let vault_balance_before = accessor::amount(&ctx.accounts.vault.to_account_info())?;

    token_interface::transfer_checked(
        CpiContext::new(
            ctx.accounts.token_program.key(),
            TransferChecked {
                from: ctx.accounts.owner_token_account.to_account_info(),
                mint: ctx.accounts.mint.to_account_info(),
                to: ctx.accounts.vault.to_account_info(),
                authority: ctx.accounts.owner.to_account_info(),
            },
        ),
        amount,
        ctx.accounts.mint.decimals,
    )?;

    let vault_balance_after = accessor::amount(&ctx.accounts.vault.to_account_info())?;
    let received_amount = vault_balance_after
        .checked_sub(vault_balance_before)
        .ok_or(TrustSubstrateError::StakeTokenTransferAmountMismatch)?;
    require!(
        received_amount == amount,
        TrustSubstrateError::StakeTokenTransferAmountMismatch
    );

    ctx.accounts.token_stake.amount = ctx
        .accounts
        .token_stake
        .amount
        .checked_add(amount)
        .ok_or(TrustSubstrateError::StakeAmountOverflow)?;

    if was_inactive {
        sync_token_stake_activity(
            ctx.accounts.identity_registry_program.key(),
            ctx.accounts.token_stake.to_account_info(),
            ctx.accounts.identity.to_account_info(),
            ctx.accounts.token_stake.identity,
            ctx.accounts.token_stake.scope,
            ctx.accounts.token_stake.mint,
            ctx.accounts.token_stake.bump,
            true,
        )?;
    }

    emit!(TokenStakeDeposited {
        identity: ctx.accounts.token_stake.identity,
        authority: ctx.accounts.owner.key(),
        scope: ctx.accounts.token_stake.scope,
        mint: ctx.accounts.token_stake.mint,
        vault: ctx.accounts.token_stake.vault,
        amount,
        slot: Clock::get()?.slot,
    });

    Ok(())
}

#[derive(Accounts)]
pub struct StakeToken<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(mut, address = token_stake.identity @ TrustSubstrateError::StakeIdentityMismatch)]
    pub identity: Account<'info, identity_registry::state::AgentIdentity>,
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
    pub identity_registry_program: Program<'info, identity_registry::program::IdentityRegistry>,
}
