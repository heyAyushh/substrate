use anchor_lang::prelude::*;
use trust_substrate_core::IDENTITY_TIER_UNBONDED;

use crate::state::AgentIdentity;

#[derive(Accounts)]
#[instruction(agent_id: [u8; 32])]
pub struct CreateIdentity<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + AgentIdentity::INIT_SPACE,
        seeds = [trust_substrate_core::IDENTITY_SEED, authority.key().as_ref(), agent_id.as_ref()],
        bump
    )]
    pub identity: Account<'info, AgentIdentity>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<CreateIdentity>,
    agent_id: [u8; 32],
    policy_root: [u8; 32],
    history_root: [u8; 32],
) -> Result<()> {
    let identity = &mut ctx.accounts.identity;
    identity.authority = ctx.accounts.authority.key();
    identity.agent_id = agent_id;
    identity.policy_root = policy_root;
    identity.history_root = history_root;
    identity.tier = IDENTITY_TIER_UNBONDED;
    identity.open_task_count = 0;
    identity.open_challenge_count = 0;
    identity.active_stake = false;
    identity.active_stake_count = 0;
    identity.bump = ctx.bumps.identity;

    Ok(())
}
