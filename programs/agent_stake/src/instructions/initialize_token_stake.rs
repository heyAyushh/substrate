use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};
use identity_registry::state::AgentIdentity;
use trust_substrate_core::{
    is_valid_trust_mode, TrustSubstrateError, TOKEN_STAKE_SEED, TOKEN_STAKE_VAULT_SEED,
};

use crate::state::TokenStakeAccount;
use crate::TokenStakeInitialized;

pub fn handler(
    ctx: Context<InitializeTokenStake>,
    scope: Pubkey,
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

    let token_stake = &mut ctx.accounts.token_stake;
    token_stake.identity = ctx.accounts.identity.key();
    token_stake.owner = ctx.accounts.owner.key();
    token_stake.slash_authority = slash_authority;
    token_stake.trust_mode = trust_mode;
    token_stake.scope = scope;
    token_stake.mint = ctx.accounts.mint.key();
    token_stake.token_program = ctx.accounts.token_program.key();
    token_stake.vault = ctx.accounts.vault.key();
    token_stake.amount = 0;
    token_stake.pending_unstake_amount = 0;
    token_stake.unstake_unlocks_at = 0;
    token_stake.slashed_total = 0;
    token_stake.bump = ctx.bumps.token_stake;
    token_stake.vault_bump = ctx.bumps.vault;

    emit!(TokenStakeInitialized {
        identity: token_stake.identity,
        authority: token_stake.owner,
        slash_authority,
        trust_mode,
        scope,
        mint: token_stake.mint,
        vault: token_stake.vault,
        token_program: token_stake.token_program,
        slot: Clock::get()?.slot,
    });

    Ok(())
}

#[derive(Accounts)]
#[instruction(scope: Pubkey)]
pub struct InitializeTokenStake<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    pub identity: Account<'info, AgentIdentity>,
    pub mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(
        init,
        payer = owner,
        space = 8 + TokenStakeAccount::INIT_SPACE,
        seeds = [
            TOKEN_STAKE_SEED,
            identity.key().as_ref(),
            scope.as_ref(),
            mint.key().as_ref()
        ],
        bump
    )]
    pub token_stake: Account<'info, TokenStakeAccount>,
    #[account(
        init,
        payer = owner,
        seeds = [TOKEN_STAKE_VAULT_SEED, token_stake.key().as_ref()],
        bump,
        token::mint = mint,
        token::authority = token_stake,
        token::token_program = token_program
    )]
    pub vault: Box<InterfaceAccount<'info, TokenAccount>>,
    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}
