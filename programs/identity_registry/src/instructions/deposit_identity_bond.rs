use anchor_lang::{prelude::*, system_program};
use trust_substrate_core::{
    TrustSubstrateError, IDENTITY_BOND_LAMPORTS, IDENTITY_BOND_SEED, IDENTITY_TIER_BONDED,
};

use crate::{
    events::IdentityBondDeposited,
    state::{AgentIdentity, IdentityBond},
};

pub fn handler(ctx: Context<DepositIdentityBond>) -> Result<()> {
    require_keys_eq!(
        ctx.accounts.identity.authority,
        ctx.accounts.authority.key(),
        TrustSubstrateError::IdentityAuthorityMismatch
    );
    require!(
        ctx.accounts.identity_bond.amount == 0,
        TrustSubstrateError::IdentityAlreadyBonded
    );

    system_program::transfer(
        CpiContext::new(
            ctx.accounts.system_program.key(),
            system_program::Transfer {
                from: ctx.accounts.authority.to_account_info(),
                to: ctx.accounts.identity_bond.to_account_info(),
            },
        ),
        IDENTITY_BOND_LAMPORTS,
    )?;

    let bond = &mut ctx.accounts.identity_bond;
    bond.identity = ctx.accounts.identity.key();
    bond.authority = ctx.accounts.authority.key();
    bond.amount = IDENTITY_BOND_LAMPORTS;
    bond.bump = ctx.bumps.identity_bond;

    ctx.accounts.identity.tier = IDENTITY_TIER_BONDED;

    emit!(IdentityBondDeposited {
        identity: ctx.accounts.identity.key(),
        authority: ctx.accounts.authority.key(),
        amount: IDENTITY_BOND_LAMPORTS,
        slot: Clock::get()?.slot,
    });

    Ok(())
}

#[derive(Accounts)]
pub struct DepositIdentityBond<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        mut,
        constraint = identity.authority == authority.key()
            @ TrustSubstrateError::IdentityAuthorityMismatch
    )]
    pub identity: Account<'info, AgentIdentity>,
    #[account(
        init,
        payer = authority,
        space = 8 + IdentityBond::INIT_SPACE,
        seeds = [IDENTITY_BOND_SEED, identity.key().as_ref()],
        bump
    )]
    pub identity_bond: Account<'info, IdentityBond>,
    pub system_program: Program<'info, System>,
}
