use anchor_lang::{prelude::*, system_program};
use identity_registry::state::{AgentIdentity, IdentityBond};
use trust_substrate_core::{
    TrustSubstrateError, ATTESTER_BOND_LAMPORTS, ATTESTER_CONFIG_SEED, ATTESTER_RECORD_SEED,
    IDENTITY_BOND_SEED, MAX_ATTESTER_CATEGORY_LEN, MAX_ATTESTER_EFFECTIVE_TIER,
};

use crate::{
    events::AttesterRegistered,
    state::{AttesterRecord, AttesterRegistryConfig},
};

pub fn handler(
    ctx: Context<RegisterAttester>,
    category: String,
    self_declared_tier: u8,
) -> Result<()> {
    require!(
        !category.is_empty() && category.len() <= MAX_ATTESTER_CATEGORY_LEN,
        TrustSubstrateError::AttesterCategoryInvalid
    );
    require!(
        self_declared_tier <= MAX_ATTESTER_EFFECTIVE_TIER,
        TrustSubstrateError::AttesterTierInvalid
    );
    require_keys_eq!(
        ctx.accounts.identity.authority,
        ctx.accounts.authority.key(),
        TrustSubstrateError::IdentityAuthorityMismatch
    );
    require_bonded_identity(&ctx.accounts.identity_bond, ctx.accounts.identity.key())?;

    system_program::transfer(
        CpiContext::new(
            ctx.accounts.system_program.key(),
            system_program::Transfer {
                from: ctx.accounts.authority.to_account_info(),
                to: ctx.accounts.attester.to_account_info(),
            },
        ),
        ATTESTER_BOND_LAMPORTS,
    )?;

    let attester = &mut ctx.accounts.attester;
    attester.identity = ctx.accounts.identity.key();
    attester.authority = ctx.accounts.authority.key();
    attester.category = category.clone();
    attester.self_declared_tier = self_declared_tier;
    attester.effective_tier = self_declared_tier;
    attester.bond_lamports = ATTESTER_BOND_LAMPORTS;
    attester.bump = ctx.bumps.attester;

    emit!(AttesterRegistered {
        identity: ctx.accounts.identity.key(),
        authority: ctx.accounts.authority.key(),
        category,
        self_declared_tier,
        effective_tier: self_declared_tier,
        bond_lamports: ATTESTER_BOND_LAMPORTS,
        slot: Clock::get()?.slot,
    });

    Ok(())
}

#[derive(Accounts)]
pub struct RegisterAttester<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    pub identity: Account<'info, AgentIdentity>,
    /// CHECK: the handler validates the PDA address, owner, and deserializes the account.
    pub identity_bond: UncheckedAccount<'info>,
    #[account(
        seeds = [ATTESTER_CONFIG_SEED],
        bump = config.bump
    )]
    pub config: Account<'info, AttesterRegistryConfig>,
    #[account(
        init,
        payer = authority,
        space = 8 + AttesterRecord::INIT_SPACE,
        seeds = [ATTESTER_RECORD_SEED, identity.key().as_ref()],
        bump
    )]
    pub attester: Account<'info, AttesterRecord>,
    pub system_program: Program<'info, System>,
}

fn require_bonded_identity(identity_bond: &UncheckedAccount<'_>, identity: Pubkey) -> Result<()> {
    let (expected_bond, _) = Pubkey::find_program_address(
        &[IDENTITY_BOND_SEED, identity.as_ref()],
        &identity_registry::ID,
    );
    require_keys_eq!(
        identity_bond.key(),
        expected_bond,
        TrustSubstrateError::IdentityBondRequired
    );
    require_keys_eq!(
        *identity_bond.owner,
        identity_registry::ID,
        TrustSubstrateError::IdentityBondRequired
    );
    require!(
        !identity_bond.data_is_empty(),
        TrustSubstrateError::IdentityBondRequired
    );

    let mut data: &[u8] = &identity_bond.try_borrow_data()?;
    let bond = IdentityBond::try_deserialize(&mut data)
        .map_err(|_| error!(TrustSubstrateError::IdentityBondRequired))?;

    require_keys_eq!(
        bond.identity,
        identity,
        TrustSubstrateError::IdentityBondRequired
    );

    Ok(())
}
