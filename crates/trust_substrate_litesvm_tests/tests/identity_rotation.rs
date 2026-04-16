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
