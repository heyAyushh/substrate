use anchor_lang::prelude::*;
use identity_registry::state::AgentIdentity;

use crate::{
    events::SocietyWorldSynced,
    state::{SocietyWorld, TaskRecord},
};
use trust_substrate_core::{
    hash_society_world_state, is_valid_society_world_status, TrustSubstrateError,
    MAX_SOCIETY_WORLD_STATE_BYTES, SOCIETY_WORLD_SEED, SOCIETY_WORLD_STATUS_ACTIVE,
};

#[derive(Accounts)]
pub struct UpdateSocietyWorld<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        constraint = identity.authority == authority.key() @ TrustSubstrateError::TaskAuthorityMismatch
    )]
    pub identity: Account<'info, AgentIdentity>,
    #[account(
        constraint = task.identity == identity.key() @ TrustSubstrateError::TaskIdentityMismatch
    )]
    pub task: Account<'info, TaskRecord>,
    #[account(
        mut,
        seeds = [SOCIETY_WORLD_SEED, task.key().as_ref()],
        bump = society_world.bump,
        has_one = identity @ TrustSubstrateError::SocietyWorldIdentityMismatch,
        has_one = task @ TrustSubstrateError::SocietyWorldTaskMismatch
    )]
    pub society_world: Account<'info, SocietyWorld>,
}

pub fn handler(
    ctx: Context<UpdateSocietyWorld>,
    current_tick: u32,
    last_sequence: u64,
    last_receipt: Pubkey,
    status: u8,
    state: Vec<u8>,
) -> Result<()> {
    require!(
        is_valid_society_world_status(status),
        TrustSubstrateError::InvalidSocietyWorldStatus
    );
    require!(
        state.len() <= MAX_SOCIETY_WORLD_STATE_BYTES,
        TrustSubstrateError::SocietyWorldStateTooLarge
    );

    let society_world = &mut ctx.accounts.society_world;
    require!(
        society_world.status == SOCIETY_WORLD_STATUS_ACTIVE,
        TrustSubstrateError::SocietyWorldFinalized
    );
    require!(
        current_tick >= society_world.current_tick,
        TrustSubstrateError::SocietyWorldTickRegression
    );
    require!(
        last_sequence >= society_world.last_sequence,
        TrustSubstrateError::SocietyWorldSequenceRegression
    );

    society_world.current_tick = current_tick;
    society_world.last_sequence = last_sequence;
    society_world.last_receipt = last_receipt;
    society_world.state_hash = hash_society_world_state(&state);
    society_world.status = status;
    society_world.state = state;

    emit!(SocietyWorldSynced {
        identity: society_world.identity,
        task: society_world.task,
        society_world: society_world.key(),
        current_tick: society_world.current_tick,
        last_sequence: society_world.last_sequence,
        status: society_world.status,
        state_hash: society_world.state_hash,
        slot: Clock::get()?.slot,
    });

    Ok(())
}
