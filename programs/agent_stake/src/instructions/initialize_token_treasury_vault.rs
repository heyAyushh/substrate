use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};
use dispute_resolver::state::TreasuryVault;
use trust_substrate_core::{TOKEN_TREASURY_VAULT_SEED, TREASURY_VAULT_SEED};

pub fn handler(_ctx: Context<InitializeTokenTreasuryVault>) -> Result<()> {
    Ok(())
}

#[derive(Accounts)]
pub struct InitializeTokenTreasuryVault<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(
        seeds = [TREASURY_VAULT_SEED],
        bump = treasury_vault.bump,
        seeds::program = dispute_resolver::ID
    )]
    pub treasury_vault: Account<'info, TreasuryVault>,
    pub mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(
        init,
        payer = payer,
        seeds = [TOKEN_TREASURY_VAULT_SEED, mint.key().as_ref()],
        bump,
        token::mint = mint,
        token::authority = treasury_vault,
        token::token_program = token_program
    )]
    pub treasury_token_vault: Box<InterfaceAccount<'info, TokenAccount>>,
    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}
