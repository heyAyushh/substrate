use anchor_lang::prelude::Pubkey;
use solana_signer::Signer;
use trust_substrate_litesvm_tests::*;

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

    h.revoke_delegation(&identity, delegation)?;
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
