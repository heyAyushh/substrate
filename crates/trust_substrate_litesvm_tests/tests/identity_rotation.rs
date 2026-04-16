use solana_signer::Signer;
use trust_substrate_litesvm_tests::*;

#[test]
fn rejects_early_rotation_request_and_finalize_before_unlock() -> TestResult {
    let mut h = Harness::new()?;
    let identity = h.create_identity(171)?;
    let new_authority = h.funded_keypair()?;

    let too_soon_unlock_slot = h.current_slot() + ROTATION_COOLDOWN_SLOTS - 1;
    let too_soon_ix = h.ix_rotate_authority(
        identity.address,
        pending_rotation_pda(identity.address),
        new_authority.pubkey(),
        too_soon_unlock_slot,
    );
    h.expect_err_as_payer(too_soon_ix, "AuthorityRotationUnlockTooSoon");

    let unlock_slot = h.current_slot() + ROTATION_COOLDOWN_SLOTS;
    let pending_rotation =
        h.request_authority_rotation(&identity, new_authority.pubkey(), unlock_slot)?;

    let finalize_caller = h.funded_keypair()?;
    let finalize_ix = h.ix_finalize_authority_rotation(
        identity.address,
        pending_rotation,
        finalize_caller.pubkey(),
    );
    h.expect_err_contains(
        finalize_ix,
        &[finalize_caller.as_ref()],
        "AuthorityRotationCooldownNotElapsed",
    );

    Ok(())
}

#[test]
fn finalizes_rotation_and_reassigns_identity_authority() -> TestResult {
    let mut h = Harness::new()?;
    let identity = h.create_identity(181)?;
    let new_authority = h.funded_keypair()?;
    let unlock_slot = h.current_slot() + ROTATION_COOLDOWN_SLOTS;
    let pending_rotation =
        h.request_authority_rotation(&identity, new_authority.pubkey(), unlock_slot)?;

    h.warp_to_slot(unlock_slot);
    let finalize_caller = h.funded_keypair()?;
    h.finalize_authority_rotation(&identity, finalize_caller.as_ref())?;

    let identity_record: identity_registry::state::AgentIdentity = h.account(identity.address);
    assert_eq!(identity_record.authority, new_authority.pubkey());
    assert!(!h.account_exists(pending_rotation));

    let stale_authority_ix =
        h.ix_update_policy_root(identity.address, h.payer_pubkey(), bytes32(182));
    h.expect_err_as_payer(stale_authority_ix, "IdentityAuthorityMismatch");

    h.update_policy_root(identity.address, new_authority.as_ref(), bytes32(183))?;

    Ok(())
}

#[test]
fn emergency_rotation_requires_guardian_threshold() -> TestResult {
    let mut h = Harness::new()?;
    let identity = h.create_identity(191)?;
    let guardian_a = h.funded_keypair()?;
    let guardian_b = h.funded_keypair()?;
    let guardian_c = h.funded_keypair()?;
    let unauthorized_guardian = h.funded_keypair()?;
    let new_authority = h.funded_keypair()?;
    let refund_recipient = h.funded_keypair()?;

    let missing_guardians_ix = h.ix_emergency_rotate_authority(
        identity.address,
        None,
        new_authority.pubkey(),
        refund_recipient.pubkey(),
        None,
        &[guardian_a.pubkey(), guardian_b.pubkey()],
    );
    h.expect_err_contains(
        missing_guardians_ix,
        &[guardian_a.as_ref(), guardian_b.as_ref()],
        "GuardianSetNotConfigured",
    );

    h.initialize_guardian_set(
        &identity,
        &[guardian_a.pubkey(), guardian_b.pubkey(), guardian_c.pubkey()],
        2,
    )?;

    let insufficient_guardians_ix = h.ix_emergency_rotate_authority(
        identity.address,
        Some(guardian_set_pda(identity.address)),
        new_authority.pubkey(),
        refund_recipient.pubkey(),
        None,
        &[guardian_a.pubkey()],
    );
    h.expect_err_contains(
        insufficient_guardians_ix,
        &[guardian_a.as_ref()],
        "GuardianSignatureThresholdNotMet",
    );

    let unauthorized_guardian_ix = h.ix_emergency_rotate_authority(
        identity.address,
        Some(guardian_set_pda(identity.address)),
        new_authority.pubkey(),
        refund_recipient.pubkey(),
        None,
        &[guardian_a.pubkey(), unauthorized_guardian.pubkey()],
    );
    h.expect_err_contains(
        unauthorized_guardian_ix,
        &[guardian_a.as_ref(), unauthorized_guardian.as_ref()],
        "GuardianSignerNotAuthorized",
    );

    Ok(())
}

#[test]
fn emergency_rotation_swaps_authority_and_clears_pending_rotation() -> TestResult {
    let mut h = Harness::new()?;
    let identity = h.create_identity(192)?;
    let guardian_a = h.funded_keypair()?;
    let guardian_b = h.funded_keypair()?;
    let guardian_c = h.funded_keypair()?;
    let new_authority = h.funded_keypair()?;
    let refund_recipient = h.funded_keypair()?;

    h.initialize_guardian_set(
        &identity,
        &[guardian_a.pubkey(), guardian_b.pubkey(), guardian_c.pubkey()],
        2,
    )?;

    let unlock_slot = h.current_slot() + ROTATION_COOLDOWN_SLOTS;
    let staged_authority = h.funded_keypair()?;
    let pending_rotation =
        h.request_authority_rotation(&identity, staged_authority.pubkey(), unlock_slot)?;
    assert!(h.account_exists(pending_rotation));

    h.emergency_rotate_authority(
        &identity,
        new_authority.pubkey(),
        refund_recipient.pubkey(),
        &[guardian_a.as_ref(), guardian_b.as_ref()],
    )?;

    let identity_record: identity_registry::state::AgentIdentity = h.account(identity.address);
    assert_eq!(identity_record.authority, new_authority.pubkey());
    assert!(!h.account_exists(pending_rotation));

    let stale_authority_ix =
        h.ix_update_policy_root(identity.address, h.payer_pubkey(), bytes32(193));
    h.expect_err_as_payer(stale_authority_ix, "IdentityAuthorityMismatch");

    h.update_policy_root(identity.address, new_authority.as_ref(), bytes32(194))?;

    Ok(())
}
