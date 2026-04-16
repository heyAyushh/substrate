use anchor_lang::prelude::*;
use trust_substrate_core::{
    TrustSubstrateError, GUARDIAN_SET_SEED, MAX_GUARDIANS,
};

use crate::{
    events::GuardianSetInitialized,
    state::{AgentIdentity, GuardianSet},
};

pub fn handler(
    ctx: Context<InitializeGuardianSet>,
    guardians: Vec<Pubkey>,
    threshold: u8,
) -> Result<()> {
    validate_guardian_configuration(&guardians, threshold)?;

    let guardian_set = &mut ctx.accounts.guardian_set;
    guardian_set.identity = ctx.accounts.identity.key();
    guardian_set.guardians = guardians.clone();
    guardian_set.threshold = threshold;
    guardian_set.bump = ctx.bumps.guardian_set;

    emit!(GuardianSetInitialized {
        identity: guardian_set.identity,
        guardians,
        threshold,
        slot: Clock::get()?.slot,
    });

    Ok(())
}

fn validate_guardian_configuration(guardians: &[Pubkey], threshold: u8) -> Result<()> {
    require!(
        !guardians.is_empty() && guardians.len() <= MAX_GUARDIANS,
        TrustSubstrateError::GuardianSetSizeInvalid
    );
    require!(
        threshold > 0 && usize::from(threshold) <= guardians.len(),
        TrustSubstrateError::GuardianThresholdInvalid
    );

    let mut unique_guardians = Vec::with_capacity(guardians.len());
    for guardian in guardians {
        require!(
            !unique_guardians.contains(guardian),
            TrustSubstrateError::GuardianSetDuplicateMember
        );
        unique_guardians.push(*guardian);
    }

    Ok(())
}

#[derive(Accounts)]
pub struct InitializeGuardianSet<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        mut,
        constraint = identity.authority == authority.key() @ TrustSubstrateError::IdentityAuthorityMismatch
    )]
    pub identity: Account<'info, AgentIdentity>,
    #[account(
        init,
        payer = authority,
        space = 8 + GuardianSet::INIT_SPACE,
        seeds = [GUARDIAN_SET_SEED, identity.key().as_ref()],
        bump
    )]
    pub guardian_set: Account<'info, GuardianSet>,
    pub system_program: Program<'info, System>,
}
