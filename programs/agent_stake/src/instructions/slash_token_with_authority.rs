use anchor_lang::prelude::*;
use anchor_spl::token::accessor;
use anchor_spl::token_interface::{self, Mint, TokenAccount, TokenInterface, TransferChecked};
use receipt_emitter::state::ReceiptRecord;
use trust_substrate_core::{
    is_valid_trust_mode, TrustSubstrateError, DISPUTE_RESOLVED_KIND, SLASH_MARKER_SEED,
    TOKEN_STAKE_SEED, TOKEN_TREASURY_VAULT_SEED, TREASURY_VAULT_SEED, TRUST_MODE_AUTHORITY,
};

use crate::instructions::identity_stake_activity::sync_token_stake_activity;
use crate::state::{SlashMarker, TokenStakeAccount};
use crate::TokenStakeSlashedByAuthority;

pub fn handler(ctx: Context<SlashTokenWithAuthority>, amount: u64) -> Result<()> {
    require!(amount > 0, TrustSubstrateError::StakeAmountMustBePositive);
    require!(
        is_valid_trust_mode(ctx.accounts.token_stake.trust_mode),
        TrustSubstrateError::InvalidTrustMode
    );
    require_keys_eq!(
        ctx.accounts.token_stake.slash_authority,
        ctx.accounts.slash_authority.key(),
        TrustSubstrateError::StakeSlashAuthorityMismatch
    );
    require!(
        ctx.accounts.token_stake.trust_mode == TRUST_MODE_AUTHORITY,
        TrustSubstrateError::StakeTrustModeMismatch
    );
    require_keys_eq!(
        ctx.accounts.dispute_receipt.identity,
        ctx.accounts.token_stake.identity,
        TrustSubstrateError::StakeReceiptIdentityMismatch
    );
    require!(
        ctx.accounts.dispute_receipt.kind == DISPUTE_RESOLVED_KIND,
        TrustSubstrateError::StakeReceiptKindMismatch
    );
    require_keys_eq!(
        ctx.accounts.token_stake.token_program,
        ctx.accounts.token_program.key(),
        TrustSubstrateError::StakeTokenProgramMismatch
    );
    require!(
        ctx.accounts.slash_marker.dispute_receipt == Pubkey::default(),
        TrustSubstrateError::StakeSlashAlreadyApplied
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
    ctx.accounts.token_stake.slashed_total = ctx
        .accounts
        .token_stake
        .slashed_total
        .checked_add(amount)
        .ok_or(TrustSubstrateError::StakeAmountOverflow)?;
    if ctx.accounts.token_stake.pending_unstake_amount > ctx.accounts.token_stake.amount {
        ctx.accounts.token_stake.pending_unstake_amount = ctx.accounts.token_stake.amount;
    }
    if ctx.accounts.token_stake.pending_unstake_amount == 0 {
        ctx.accounts.token_stake.unstake_unlocks_at = 0;
    }
    transfer_token_slash(
        &ctx.accounts.token_stake,
        &ctx.accounts.vault,
        &ctx.accounts.treasury_token_vault,
        &ctx.accounts.mint,
        &ctx.accounts.token_program,
        amount,
    )?;
    if was_active && ctx.accounts.token_stake.amount == 0 {
        sync_token_stake_activity(
            ctx.accounts.identity_registry_program.key(),
            ctx.accounts.token_stake.to_account_info(),
            ctx.accounts.identity.to_account_info(),
            ctx.accounts.token_stake.identity,
            ctx.accounts.token_stake.scope,
            ctx.accounts.token_stake.mint,
            ctx.accounts.token_stake.bump,
            false,
        )?;
    }

    let marker = &mut ctx.accounts.slash_marker;
    marker.stake = ctx.accounts.token_stake.key();
    marker.dispute_receipt = ctx.accounts.dispute_receipt.key();
    marker.verdict = Pubkey::default();
    marker.amount = amount;
    marker.bump = ctx.bumps.slash_marker;

    emit!(TokenStakeSlashedByAuthority {
        identity: ctx.accounts.token_stake.identity,
        slash_authority: ctx.accounts.slash_authority.key(),
        dispute_receipt: ctx.accounts.dispute_receipt.key(),
        scope: ctx.accounts.token_stake.scope,
        mint: ctx.accounts.token_stake.mint,
        amount,
        trust_mode: ctx.accounts.token_stake.trust_mode,
        slot: Clock::get()?.slot,
    });

    Ok(())
}

#[derive(Accounts)]
pub struct SlashTokenWithAuthority<'info> {
    #[account(mut)]
    pub slash_authority: Signer<'info>,
    #[account(mut, address = token_stake.identity @ TrustSubstrateError::StakeIdentityMismatch)]
    /// CHECK: The address is pinned to the token stake identity;
    /// identity_registry deserializes and validates it during the CPI.
    pub identity: UncheckedAccount<'info>,
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
    pub token_stake: Box<Account<'info, TokenStakeAccount>>,
    pub dispute_receipt: Box<Account<'info, ReceiptRecord>>,
    #[account(
        init,
        payer = slash_authority,
        space = 8 + SlashMarker::INIT_SPACE,
        seeds = [SLASH_MARKER_SEED, token_stake.key().as_ref(), dispute_receipt.key().as_ref()],
        bump
    )]
    pub slash_marker: Box<Account<'info, SlashMarker>>,
    #[account(address = token_stake.mint @ TrustSubstrateError::StakeTokenMintMismatch)]
    pub mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(
        mut,
        address = token_stake.vault @ TrustSubstrateError::StakeTokenVaultMismatch,
        token::mint = mint,
        token::authority = token_stake,
        token::token_program = token_program
    )]
    pub vault: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        mut,
        seeds = [TOKEN_TREASURY_VAULT_SEED, mint.key().as_ref()],
        bump,
        token::mint = mint,
        token::token_program = token_program,
        constraint = treasury_token_vault.owner == token_treasury_authority_pda()
            @ TrustSubstrateError::StakeTokenTreasuryVaultMismatch
    )]
    pub treasury_token_vault: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(address = token_stake.token_program @ TrustSubstrateError::StakeTokenProgramMismatch)]
    pub token_program: Interface<'info, TokenInterface>,
    pub identity_registry_program: Program<'info, identity_registry::program::IdentityRegistry>,
    pub system_program: Program<'info, System>,
}

pub fn transfer_token_slash<'info>(
    token_stake: &Account<'info, TokenStakeAccount>,
    vault: &InterfaceAccount<'info, TokenAccount>,
    treasury_token_vault: &InterfaceAccount<'info, TokenAccount>,
    mint: &InterfaceAccount<'info, Mint>,
    token_program: &Interface<'info, TokenInterface>,
    amount: u64,
) -> Result<()> {
    let treasury_balance_before = accessor::amount(&treasury_token_vault.to_account_info())?;
    let identity = token_stake.identity;
    let scope = token_stake.scope;
    let mint_key = token_stake.mint;
    let bump = [token_stake.bump];
    let signer_seeds = &[&[
        TOKEN_STAKE_SEED,
        identity.as_ref(),
        scope.as_ref(),
        mint_key.as_ref(),
        &bump,
    ][..]];

    token_interface::transfer_checked(
        CpiContext::new_with_signer(
            token_program.key(),
            TransferChecked {
                from: vault.to_account_info(),
                mint: mint.to_account_info(),
                to: treasury_token_vault.to_account_info(),
                authority: token_stake.to_account_info(),
            },
            signer_seeds,
        ),
        amount,
        mint.decimals,
    )?;

    let treasury_balance_after = accessor::amount(&treasury_token_vault.to_account_info())?;
    let received_amount = treasury_balance_after
        .checked_sub(treasury_balance_before)
        .ok_or(TrustSubstrateError::StakeTokenTransferAmountMismatch)?;
    require!(
        received_amount == amount,
        TrustSubstrateError::StakeTokenTransferAmountMismatch
    );

    Ok(())
}

fn token_treasury_authority_pda() -> Pubkey {
    Pubkey::find_program_address(&[TREASURY_VAULT_SEED], &dispute_resolver::ID).0
}
