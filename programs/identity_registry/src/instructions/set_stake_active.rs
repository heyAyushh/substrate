use anchor_lang::prelude::*;
use trust_substrate_core::{
    StakeAccountView, TokenStakeAccountView, TrustSubstrateError, AGENT_STAKE_PROGRAM_ID,
    STAKE_SEED, TOKEN_STAKE_SEED,
};

use crate::{events::IdentityStakeActivitySynced, state::AgentIdentity};

pub fn handler(ctx: Context<SetStakeActive>, active_stake: bool) -> Result<()> {
    require_stake_authority(&ctx.accounts.authority, ctx.accounts.identity.key())?;

    if active_stake {
        ctx.accounts.identity.active_stake_count = ctx
            .accounts
            .identity
            .active_stake_count
            .checked_add(1)
            .ok_or(TrustSubstrateError::StakeAmountOverflow)?;
    } else {
        ctx.accounts.identity.active_stake_count = ctx
            .accounts
            .identity
            .active_stake_count
            .checked_sub(1)
            .ok_or(TrustSubstrateError::IdentityStakeActivityUnderflow)?;
    }
    ctx.accounts.identity.active_stake = ctx.accounts.identity.active_stake_count > 0;

    emit!(IdentityStakeActivitySynced {
        identity: ctx.accounts.identity.key(),
        authority: ctx.accounts.authority.key(),
        active_stake: ctx.accounts.identity.active_stake,
        active_stake_count: ctx.accounts.identity.active_stake_count,
        slot: Clock::get()?.slot,
    });

    Ok(())
}

#[derive(Accounts)]
pub struct SetStakeActive<'info> {
    pub authority: Signer<'info>,
    #[account(mut)]
    pub identity: Account<'info, AgentIdentity>,
}

fn require_stake_authority(authority: &Signer<'_>, identity: Pubkey) -> Result<()> {
    let authority_info = authority.to_account_info();
    require_keys_eq!(
        *authority_info.owner,
        AGENT_STAKE_PROGRAM_ID,
        TrustSubstrateError::IdentityStakeAuthorityMismatch
    );

    if validate_lamport_stake_authority(&authority_info, identity).is_ok()
        || validate_token_stake_authority(&authority_info, identity).is_ok()
    {
        return Ok(());
    }

    err!(TrustSubstrateError::IdentityStakeAuthorityMismatch)
}

fn validate_lamport_stake_authority(account: &AccountInfo<'_>, identity: Pubkey) -> Result<()> {
    let data = account.try_borrow_data()?;
    let mut data_slice: &[u8] = &data;
    let stake = StakeAccountView::try_deserialize(&mut data_slice)
        .map_err(|_| error!(TrustSubstrateError::IdentityStakeAuthorityMismatch))?;
    require_keys_eq!(
        stake.identity,
        identity,
        TrustSubstrateError::IdentityStakeAuthorityMismatch
    );
    let expected =
        Pubkey::find_program_address(&[STAKE_SEED, identity.as_ref()], &AGENT_STAKE_PROGRAM_ID).0;
    require_keys_eq!(
        account.key(),
        expected,
        TrustSubstrateError::IdentityStakeAuthorityMismatch
    );
    Ok(())
}

fn validate_token_stake_authority(account: &AccountInfo<'_>, identity: Pubkey) -> Result<()> {
    let data = account.try_borrow_data()?;
    let mut data_slice: &[u8] = &data;
    let stake = TokenStakeAccountView::try_deserialize(&mut data_slice)
        .map_err(|_| error!(TrustSubstrateError::IdentityStakeAuthorityMismatch))?;
    require_keys_eq!(
        stake.identity,
        identity,
        TrustSubstrateError::IdentityStakeAuthorityMismatch
    );
    let expected = Pubkey::find_program_address(
        &[
            TOKEN_STAKE_SEED,
            identity.as_ref(),
            stake.scope.as_ref(),
            stake.mint.as_ref(),
        ],
        &AGENT_STAKE_PROGRAM_ID,
    )
    .0;
    require_keys_eq!(
        account.key(),
        expected,
        TrustSubstrateError::IdentityStakeAuthorityMismatch
    );
    Ok(())
}
