use anchor_lang::prelude::Pubkey;
use delegation_engine::state::DelegationRecord;
use solana_signer::Signer;
use trust_substrate_litesvm_tests::*;

const FUTURE_REVOKE_GRACE_SLOTS: u64 = 10_000;

#[test]
fn enforces_delegation_scope_expiry_and_revocation() -> TestResult {
    let mut h = Harness::new()?;
    let domain = bytes32(DOMAIN_BYTE);
    h.register_domain(domain)?;

    let identity = h.create_identity(71)?;
    let task = h.create_task_with_domain(&identity, 72, domain)?;
    let delegate = h.funded_keypair()?;
    let delegation = h.create_delegation(&identity, delegate.pubkey(), HANDOFF_SCOPE_BIT, 0)?;

    let ix = h.ix_emit_delegated_receipt(
        &identity,
        task,
        delegation,
        delegate.pubkey(),
        receipt_pda(identity.address, task, bytes32(73)),
        bytes32(73),
        COMPLETION_KIND,
        FIRST_SEQUENCE,
        domain,
        Pubkey::default().to_bytes(),
    );
    h.expect_err_contains(ix, &[delegate.as_ref()], "DelegationScopeMismatch");

    h.revoke_delegation(&identity, delegation, 0)?;
    let ix = h.ix_emit_delegated_receipt(
        &identity,
        task,
        delegation,
        delegate.pubkey(),
        receipt_pda(identity.address, task, bytes32(74)),
        bytes32(74),
        HANDOFF_KIND,
        FIRST_SEQUENCE,
        domain,
        Pubkey::default().to_bytes(),
    );
    h.expect_err_contains(ix, &[delegate.as_ref()], "DelegationRevoked");

    let expiring_delegate = h.funded_keypair()?;
    let expiring_delegation =
        h.create_delegation(&identity, expiring_delegate.pubkey(), HANDOFF_SCOPE_BIT, 1)?;
    h.warp_to_slot(2);
    let ix = h.ix_emit_delegated_receipt(
        &identity,
        task,
        expiring_delegation,
        expiring_delegate.pubkey(),
        receipt_pda(identity.address, task, bytes32(75)),
        bytes32(75),
        HANDOFF_KIND,
        FIRST_SEQUENCE,
        domain,
        Pubkey::default().to_bytes(),
    );
    h.expect_err_contains(ix, &[expiring_delegate.as_ref()], "DelegationExpired");

    Ok(())
}

#[test]
fn honors_future_revocation_grace_windows() -> TestResult {
    let mut h = Harness::new()?;
    let domain = bytes32(SECOND_DOMAIN_BYTE);
    h.register_domain(domain)?;

    let identity = h.create_identity(81)?;
    let delegate = h.funded_keypair()?;
    let delegation = h.create_delegation(&identity, delegate.pubkey(), HANDOFF_SCOPE_BIT, 0)?;
    let task_before_revocation = h.create_task_with_domain(&identity, 82, domain)?;
    let revoke_at_slot = h.current_slot() + FUTURE_REVOKE_GRACE_SLOTS;
    h.revoke_delegation(&identity, delegation, revoke_at_slot)?;
    let delegation_record: DelegationRecord = h.account(delegation);
    assert!(delegation_record.revoked);
    assert_eq!(delegation_record.revoke_at_slot, revoke_at_slot);

    h.emit_delegated_receipt(
        &identity,
        &task_before_revocation,
        delegate.as_ref(),
        delegation,
        83,
        HANDOFF_KIND,
        FIRST_SEQUENCE,
        domain,
        Pubkey::default().to_bytes(),
    )?;

    h.warp_to_slot(revoke_at_slot);

    let task_after_revocation = h.create_task_with_domain(&identity, 84, domain)?;
    let ix = h.ix_emit_delegated_receipt(
        &identity,
        task_after_revocation,
        delegation,
        delegate.pubkey(),
        receipt_pda(identity.address, task_after_revocation, bytes32(85)),
        bytes32(85),
        HANDOFF_KIND,
        FIRST_SEQUENCE,
        domain,
        Pubkey::default().to_bytes(),
    );
    h.expect_err_contains(ix, &[delegate.as_ref()], "DelegationRevoked");

    Ok(())
}
