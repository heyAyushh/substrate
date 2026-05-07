use crate::{
    state::ReputationAccumulator, state::ReputationDomainCatalog, TrustSubstrateError,
    REPUTATION_SEED,
};
use anchor_lang::prelude::*;
use identity_registry::state::AgentIdentity;
use trust_substrate_core::{
    DEFAULT_COMPLETION_WEIGHT, DEFAULT_DISPUTE_RESOLVED_WEIGHT, DEFAULT_DISPUTE_WEIGHT,
    MAX_REPUTATION_DOMAIN_WEIGHT,
};

pub fn handler(
    ctx: Context<CreateReputationDomain>,
    domain: [u8; 32],
    completion_weight: u64,
    dispute_weight: u64,
    dispute_resolved_weight: u64,
) -> Result<()> {
    require_keys_eq!(
        ctx.accounts.identity.authority,
        ctx.accounts.authority.key(),
        TrustSubstrateError::ReputationAuthorityMismatch
    );

    require!(
        ctx.accounts.domain_catalog.is_domain_active(&domain),
        TrustSubstrateError::DomainNotRegistered
    );

    let completion_weight = bounded_weight(completion_weight, DEFAULT_COMPLETION_WEIGHT)?;
    let dispute_weight = bounded_weight(dispute_weight, DEFAULT_DISPUTE_WEIGHT)?;
    let dispute_resolved_weight =
        bounded_weight(dispute_resolved_weight, DEFAULT_DISPUTE_RESOLVED_WEIGHT)?;

    let reputation = &mut ctx.accounts.reputation;
    reputation.identity = ctx.accounts.identity.key();
    reputation.domain = domain;
    reputation.completed = 0;
    reputation.disputed = 0;
    reputation.resolved = 0;
    reputation.attested = 0;
    reputation.weighted_completed = 0;
    reputation.weighted_disputed = 0;
    reputation.weighted_resolved = 0;
    reputation.weighted_attested = 0;
    reputation.reviewer_weight_sum = 0;
    reputation.slash_penalty_sum = 0;
    reputation.last_applied_slot = 0;
    reputation.completion_weight = completion_weight;
    reputation.dispute_weight = dispute_weight;
    reputation.dispute_resolved_weight = dispute_resolved_weight;
    reputation.bump = ctx.bumps.reputation;

    Ok(())
}

fn bounded_weight(input: u64, default_weight: u64) -> Result<u64> {
    let weight = if input == 0 { default_weight } else { input };
    require!(
        weight <= MAX_REPUTATION_DOMAIN_WEIGHT,
        TrustSubstrateError::ReputationWeightTooLarge
    );
    Ok(weight)
}

#[derive(Accounts)]
#[instruction(domain: [u8; 32])]
pub struct CreateReputationDomain<'info> {
    pub identity: Account<'info, AgentIdentity>,
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        init,
        payer = authority,
        space = 8 + ReputationAccumulator::INIT_SPACE,
        seeds = [REPUTATION_SEED, identity.key().as_ref(), domain.as_ref()],
        bump
    )]
    pub reputation: Account<'info, ReputationAccumulator>,
    pub domain_catalog: Account<'info, ReputationDomainCatalog>,
    pub system_program: Program<'info, System>,
}
