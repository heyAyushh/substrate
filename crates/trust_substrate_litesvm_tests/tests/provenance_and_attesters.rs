use trust_substrate_litesvm_tests::*;

#[test]
fn attester_registry_requires_identity_bond_and_supports_tier_updates() -> TestResult {
    let mut h = Harness::new()?;
    let identity = h.create_identity(241)?;

    let err = h
        .register_attester(&identity, "review".to_string(), 1)
        .expect_err("unbonded identity should not register as attester");
    assert!(err.to_string().contains("IdentityBondRequired"));

    h.deposit_identity_bond(&identity)?;
    let attester = h.register_attester(&identity, "review".to_string(), 1)?;
    let attester_record: attester_registry::state::AttesterRecord = h.account(attester);
    assert_eq!(attester_record.identity, identity.address);
    assert_eq!(attester_record.self_declared_tier, 1);
    assert_eq!(attester_record.effective_tier, 1);

    h.set_attester_tier(attester, 2)?;
    let updated_record: attester_registry::state::AttesterRecord = h.account(attester);
    assert_eq!(updated_record.effective_tier, 2);

    Ok(())
}

#[test]
fn runtime_attestations_append_versioned_history() -> TestResult {
    let mut h = Harness::new()?;
    let identity = h.create_identity(251)?;

    let first_runtime = h.append_runtime_attestation(
        &identity,
        bytes32(252),
        h.payer_pubkey(),
    )?;
    let first_record: identity_registry::state::RuntimeAttestation = h.account(first_runtime);
    assert_eq!(first_record.identity, identity.address);
    assert_eq!(first_record.runtime_commit, bytes32(252));

    h.advance_slots(1);

    let second_runtime = h.append_runtime_attestation(
        &identity,
        bytes32(253),
        h.reviewer_pubkey(),
    )?;
    let second_record: identity_registry::state::RuntimeAttestation = h.account(second_runtime);
    assert_eq!(second_record.runtime_authority, h.reviewer_pubkey());
    assert!(second_record.valid_from_slot > first_record.valid_from_slot);

    Ok(())
}
