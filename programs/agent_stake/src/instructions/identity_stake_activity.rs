use anchor_lang::prelude::*;
use trust_substrate_core::{STAKE_SEED, TOKEN_STAKE_SEED};

pub fn sync_lamport_stake_activity<'info>(
    identity_registry_program: Pubkey,
    stake: AccountInfo<'info>,
    identity: AccountInfo<'info>,
    identity_key: Pubkey,
    stake_bump: u8,
    active: bool,
) -> Result<()> {
    let stake_bump = [stake_bump];
    let signer_seeds: &[&[&[u8]]] = &[&[STAKE_SEED, identity_key.as_ref(), &stake_bump]];
    sync_stake_activity(
        identity_registry_program,
        stake,
        identity,
        signer_seeds,
        active,
    )
}

pub fn sync_token_stake_activity<'info>(
    identity_registry_program: Pubkey,
    token_stake: AccountInfo<'info>,
    identity: AccountInfo<'info>,
    identity_key: Pubkey,
    scope: Pubkey,
    mint: Pubkey,
    token_stake_bump: u8,
    active: bool,
) -> Result<()> {
    let token_stake_bump = [token_stake_bump];
    let signer_seeds: &[&[&[u8]]] = &[&[
        TOKEN_STAKE_SEED,
        identity_key.as_ref(),
        scope.as_ref(),
        mint.as_ref(),
        &token_stake_bump,
    ]];
    sync_stake_activity(
        identity_registry_program,
        token_stake,
        identity,
        signer_seeds,
        active,
    )
}

fn sync_stake_activity<'info>(
    identity_registry_program: Pubkey,
    stake_authority: AccountInfo<'info>,
    identity: AccountInfo<'info>,
    signer_seeds: &[&[&[u8]]],
    active: bool,
) -> Result<()> {
    let identity_cpi_accounts = identity_registry::cpi::accounts::SetStakeActive {
        authority: stake_authority,
        identity,
    };
    let identity_cpi = CpiContext::new_with_signer(
        identity_registry_program,
        identity_cpi_accounts,
        signer_seeds,
    );
    identity_registry::cpi::set_stake_active(identity_cpi, active)
}
