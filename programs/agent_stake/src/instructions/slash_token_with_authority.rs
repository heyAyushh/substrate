use anchor_lang::prelude::*;
use anchor_spl::token_interface::{self, Mint, TokenInterface, TransferChecked};
use receipt_emitter::state::ReceiptRecord;
use trust_substrate_core::{
    is_valid_trust_mode, TrustSubstrateError, DISPUTE_RESOLVED_KIND, SLASH_MARKER_SEED,
    TOKEN_STAKE_SEED, TOKEN_TREASURY_VAULT_SEED, TRUST_MODE_AUTHORITY,
};

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

    apply_token_slash(
        &mut ctx.accounts.token_stake,
        &ctx.accounts.vault,
        &ctx.accounts.treasury_token_vault,
        &ctx.accounts.mint,
        &ctx.accounts.token_program,
        amount,
    )?;

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
    pub dispute_receipt: Account<'info, ReceiptRecord>,
    #[account(
        init,
        payer = slash_authority,
        space = 8 + SlashMarker::INIT_SPACE,
        seeds = [SLASH_MARKER_SEED, token_stake.key().as_ref(), dispute_receipt.key().as_ref()],
        bump
    )]
    pub slash_marker: Account<'info, SlashMarker>,
    #[account(address = token_stake.mint @ TrustSubstrateError::StakeTokenMintMismatch)]
    pub mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(
        mut,
        address = token_stake.vault @ TrustSubstrateError::StakeTokenVaultMismatch
    )]
    /// CHECK: The address is pinned to the vault recorded on the stake account,
    /// and the SPL Token program validates it as a token account during transfer.
    pub vault: UncheckedAccount<'info>,
    #[account(
        mut,
        seeds = [TOKEN_TREASURY_VAULT_SEED, mint.key().as_ref()],
        bump
    )]
    /// CHECK: The address is the program-derived token treasury vault for this
    /// mint; the SPL Token program validates the account and mint on receipt.
    pub treasury_token_vault: UncheckedAccount<'info>,
    #[account(address = token_stake.token_program @ TrustSubstrateError::StakeTokenProgramMismatch)]
    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

pub fn apply_token_slash<'info>(
    token_stake: &mut Account<'info, TokenStakeAccount>,
    vault: &UncheckedAccount<'info>,
    treasury_token_vault: &UncheckedAccount<'info>,
    mint: &InterfaceAccount<'info, Mint>,
    token_program: &Interface<'info, TokenInterface>,
    amount: u64,
) -> Result<()> {
    token_stake.amount = token_stake
        .amount
        .checked_sub(amount)
        .ok_or(TrustSubstrateError::StakeInsufficient)?;
    token_stake.slashed_total = token_stake
        .slashed_total
        .checked_add(amount)
        .ok_or(TrustSubstrateError::StakeAmountOverflow)?;

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

    Ok(())
}
