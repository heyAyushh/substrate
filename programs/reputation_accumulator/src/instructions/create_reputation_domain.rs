use crate::{
    identity_registry::state::AgentIdentity, state::ReputationAccumulator, TrustSubstrateError,
    REPUTATION_SEED,
};
use anchor_lang::prelude::*;
use trust_substrate_core::{
    DEFAULT_COMPLETION_WEIGHT, DEFAULT_DISPUTE_RESOLVED_WEIGHT, DEFAULT_DISPUTE_WEIGHT,
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

    let reputation = &mut ctx.accounts.reputation;
    reputation.identity = ctx.accounts.identity.key();
    reputation.domain = domain;
    reputation.completed = 0;
    reputation.disputed = 0;
    reputation.resolved = 0;
    reputation.completion_weight = if completion_weight == 0 {
        DEFAULT_COMPLETION_WEIGHT
    } else {
        completion_weight
    };
    reputation.dispute_weight = if dispute_weight == 0 {
        DEFAULT_DISPUTE_WEIGHT
    } else {
        dispute_weight
    };
    reputation.dispute_resolved_weight = if dispute_resolved_weight == 0 {
        DEFAULT_DISPUTE_RESOLVED_WEIGHT
    } else {
        dispute_resolved_weight
    };
    reputation.bump = ctx.bumps.reputation;

    Ok(())
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
    pub system_program: Program<'info, System>,
}
