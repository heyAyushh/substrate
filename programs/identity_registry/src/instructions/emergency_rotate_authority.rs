use anchor_lang::prelude::*;
use trust_substrate_core::{
    TrustSubstrateError, AUTHORITY_ROTATION_MODE_EMERGENCY, GUARDIAN_SET_SEED,
    PENDING_ROTATION_SEED,
};

use crate::{
    events::AuthorityRotated,
    state::{AgentIdentity, GuardianSet, PendingAuthorityRotation},
};

pub fn handler(ctx: Context<EmergencyRotateAuthority>, new_authority: Pubkey) -> Result<()> {
    let guardian_set = ctx
        .accounts
        .guardian_set
        .as_ref()
        .ok_or(error!(TrustSubstrateError::GuardianSetNotConfigured))?;
    let expected_guardian_set = Pubkey::find_program_address(
        &[GUARDIAN_SET_SEED, ctx.accounts.identity.key().as_ref()],
        &crate::ID,
    )
    .0;
    require_keys_eq!(
        guardian_set.key(),
        expected_guardian_set,
        TrustSubstrateError::GuardianSetNotConfigured
    );

    validate_guardian_signatures(
        ctx.remaining_accounts,
        &guardian_set.guardians,
        guardian_set.threshold,
    )?;

    let previous_authority = ctx.accounts.identity.authority;
    ctx.accounts.identity.authority = new_authority;

    if let Some(pending_rotation) = ctx.accounts.pending_rotation.as_mut() {
        let expected_pending_rotation = Pubkey::find_program_address(
            &[PENDING_ROTATION_SEED, ctx.accounts.identity.key().as_ref()],
            &crate::ID,
        )
        .0;
        require_keys_eq!(
            pending_rotation.key(),
            expected_pending_rotation,
            TrustSubstrateError::AuthorityRotationIdentityMismatch
        );
        require_keys_eq!(
            pending_rotation.identity,
            ctx.accounts.identity.key(),
            TrustSubstrateError::AuthorityRotationIdentityMismatch
        );
        pending_rotation.close(ctx.accounts.refund_recipient.to_account_info())?;
    }

    emit!(AuthorityRotated {
        identity: ctx.accounts.identity.key(),
        previous_authority,
        new_authority,
        slot: Clock::get()?.slot,
        mode: AUTHORITY_ROTATION_MODE_EMERGENCY,
    });

    Ok(())
}

fn validate_guardian_signatures(
    remaining_accounts: &[AccountInfo<'_>],
    configured_guardians: &[Pubkey],
    threshold: u8,
) -> Result<()> {
    let mut approved_guardians = Vec::with_capacity(remaining_accounts.len());

    for account in remaining_accounts {
        require!(account.is_signer, TrustSubstrateError::GuardianSignatureMissing);
        require!(
            configured_guardians.contains(account.key),
            TrustSubstrateError::GuardianSignerNotAuthorized
        );
        require!(
            !approved_guardians.contains(account.key),
            TrustSubstrateError::GuardianSignerDuplicated
        );
        approved_guardians.push(*account.key);
    }

    require!(
        approved_guardians.len() >= usize::from(threshold),
        TrustSubstrateError::GuardianSignatureThresholdNotMet
    );

    Ok(())
}

#[derive(Accounts)]
pub struct EmergencyRotateAuthority<'info> {
    #[account(mut)]
    pub identity: Account<'info, AgentIdentity>,
    pub guardian_set: Option<Account<'info, GuardianSet>>,
    #[account(mut)]
    pub refund_recipient: SystemAccount<'info>,
    #[account(mut)]
    pub pending_rotation: Option<Account<'info, PendingAuthorityRotation>>,
}
