use anchor_lang::prelude::*;
use receipt_emitter::state::ReceiptRecord;
use trust_substrate_core::{
    is_valid_trust_mode, TrustSubstrateError, DISPUTE_RESOLVED_KIND, SLASH_MARKER_SEED,
    STAKE_SEED, TREASURY_VAULT_SEED, TRUST_MODE_AUTHORITY,
};

use crate::state::{SlashMarker, StakeAccount};
use crate::StakeSlashedByAuthority;

pub fn handler(ctx: Context<SlashWithAuthority>, amount: u64) -> Result<()> {
    require!(amount > 0, TrustSubstrateError::StakeAmountMustBePositive);
    require!(
        is_valid_trust_mode(ctx.accounts.stake.trust_mode),
        TrustSubstrateError::InvalidTrustMode
    );
    require_keys_eq!(
        ctx.accounts.stake.slash_authority,
        ctx.accounts.slash_authority.key(),
        TrustSubstrateError::StakeSlashAuthorityMismatch
    );
    require!(
        ctx.accounts.stake.trust_mode == TRUST_MODE_AUTHORITY,
        TrustSubstrateError::StakeTrustModeMismatch
    );
    require_keys_eq!(
        ctx.accounts.dispute_receipt.identity,
        ctx.accounts.stake.identity,
        TrustSubstrateError::StakeReceiptIdentityMismatch
    );
    require!(
        ctx.accounts.dispute_receipt.kind == DISPUTE_RESOLVED_KIND,
        TrustSubstrateError::StakeReceiptKindMismatch
    );
    require_keys_eq!(
        ctx.accounts.treasury_vault.key(),
        treasury_vault_pda(),
        TrustSubstrateError::StakeTreasuryVaultMismatch
    );
    require!(
        ctx.accounts.slash_marker.dispute_receipt == Pubkey::default(),
        TrustSubstrateError::StakeSlashAlreadyApplied
    );
    require!(
        amount <= ctx.accounts.stake.amount,
        TrustSubstrateError::StakeInsufficient
    );

    let treasury_info = ctx.accounts.treasury_vault.to_account_info();
    apply_slash(&mut ctx.accounts.stake, &treasury_info, amount)?;

    let marker = &mut ctx.accounts.slash_marker;
    marker.stake = ctx.accounts.stake.key();
    marker.dispute_receipt = ctx.accounts.dispute_receipt.key();
    marker.verdict = Pubkey::default();
    marker.amount = amount;
    marker.bump = ctx.bumps.slash_marker;

    emit!(StakeSlashedByAuthority {
        identity: ctx.accounts.stake.identity,
        slash_authority: ctx.accounts.slash_authority.key(),
        trust_mode: ctx.accounts.stake.trust_mode,
        dispute_receipt: ctx.accounts.dispute_receipt.key(),
        amount,
        slot: Clock::get()?.slot,
    });

    Ok(())
}

#[derive(Accounts)]
pub struct SlashWithAuthority<'info> {
    #[account(mut)]
    pub slash_authority: Signer<'info>,
    #[account(
        mut,
        seeds = [STAKE_SEED, stake.identity.as_ref()],
        bump = stake.bump
    )]
    pub stake: Account<'info, StakeAccount>,
    pub dispute_receipt: Account<'info, ReceiptRecord>,
    #[account(
        init,
        payer = slash_authority,
        space = 8 + SlashMarker::INIT_SPACE,
        seeds = [SLASH_MARKER_SEED, stake.key().as_ref(), dispute_receipt.key().as_ref()],
        bump
    )]
    pub slash_marker: Account<'info, SlashMarker>,
    /// CHECK: The treasury vault is a fixed PDA owned by `dispute_resolver`.
    #[account(mut)]
    pub treasury_vault: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

fn treasury_vault_pda() -> Pubkey {
    Pubkey::find_program_address(&[TREASURY_VAULT_SEED], &dispute_resolver::ID).0
}

pub fn apply_slash(
    stake: &mut Account<'_, StakeAccount>,
    treasury_info: &AccountInfo<'_>,
    amount: u64,
) -> Result<()> {
    stake.amount = stake
        .amount
        .checked_sub(amount)
        .ok_or(TrustSubstrateError::StakeInsufficient)?;
    stake.slashed_total = stake
        .slashed_total
        .checked_add(amount)
        .ok_or(TrustSubstrateError::StakeAmountOverflow)?;

    let stake_info = stake.to_account_info();

    **stake_info.try_borrow_mut_lamports()? = stake_info
        .lamports()
        .checked_sub(amount)
        .ok_or(TrustSubstrateError::StakeInsufficient)?;
    **treasury_info.try_borrow_mut_lamports()? = treasury_info
        .lamports()
        .checked_add(amount)
        .ok_or(TrustSubstrateError::StakeAmountOverflow)?;

    Ok(())
}
