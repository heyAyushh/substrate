use anchor_lang::prelude::*;
use anchor_spl::token_interface::{self, Mint, TokenAccount, TokenInterface, TransferChecked};
use trust_substrate_core::{TrustSubstrateError, TOKEN_STAKE_SEED};

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

    ctx.accounts.token_stake.amount = ctx
        .accounts
        .token_stake
        .amount
        .checked_add(amount)
        .ok_or(TrustSubstrateError::StakeAmountOverflow)?;

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

    let identity_cpi_accounts = identity_registry::cpi::accounts::SetStakeActive {
        authority: ctx.accounts.owner.to_account_info(),
        identity: ctx.accounts.identity.to_account_info(),
    };
    let identity_cpi = CpiContext::new(
        ctx.accounts.identity_registry_program.key(),
        identity_cpi_accounts,
    );
    identity_registry::cpi::set_stake_active(identity_cpi, true)?;

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
    #[account(mut)]
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
