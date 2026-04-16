use anchor_lang::prelude::*;
use trust_substrate_core::{RUNTIME_ATTESTATION_SEED, TrustSubstrateError};

use crate::{
    events::RuntimeAttestationAppended,
    state::{AgentIdentity, RuntimeAttestation},
};

pub fn handler(
    ctx: Context<AppendRuntimeAttestation>,
    runtime_commit: [u8; 32],
    runtime_authority: Pubkey,
) -> Result<()> {
    require_keys_eq!(
        ctx.accounts.identity.authority,
        ctx.accounts.authority.key(),
        TrustSubstrateError::IdentityAuthorityMismatch
    );

    let valid_from_slot = Clock::get()?.slot;
    let attestation = &mut ctx.accounts.runtime_attestation;
    attestation.identity = ctx.accounts.identity.key();
    attestation.runtime_commit = runtime_commit;
    attestation.runtime_authority = runtime_authority;
    attestation.valid_from_slot = valid_from_slot;
    attestation.bump = ctx.bumps.runtime_attestation;

    emit!(RuntimeAttestationAppended {
        identity: ctx.accounts.identity.key(),
        runtime_attestation: ctx.accounts.runtime_attestation.key(),
        runtime_authority,
        runtime_commit,
        valid_from_slot,
    });

    Ok(())
}

#[derive(Accounts)]
#[instruction(runtime_commit: [u8; 32])]
pub struct AppendRuntimeAttestation<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        constraint = identity.authority == authority.key()
            @ TrustSubstrateError::IdentityAuthorityMismatch
    )]
    pub identity: Account<'info, AgentIdentity>,
    #[account(
        init,
        payer = authority,
        space = 8 + RuntimeAttestation::INIT_SPACE,
        seeds = [
            RUNTIME_ATTESTATION_SEED,
            identity.key().as_ref(),
            runtime_commit.as_ref()
        ],
        bump
    )]
    pub runtime_attestation: Account<'info, RuntimeAttestation>,
    pub system_program: Program<'info, System>,
}
