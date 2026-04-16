use anchor_lang::prelude::Pubkey;
use solana_signer::Signer;
use trust_substrate_litesvm_tests::*;

#[test]
fn handoff_grant_creates_delegation_and_allows_delegate_completion() -> TestResult {
    let mut h = Harness::new()?;
    let domain = bytes32(DOMAIN_BYTE);
    h.register_domain(domain)?;

    let identity = h.create_identity(211)?;
    let task = h.create_task_with_domain(&identity, 212, domain)?;
    let delegate = h.funded_keypair()?;

    let (handoff_receipt, delegation) = h.emit_handoff_grant(
        &identity,
        task,
        delegate.pubkey(),
        213,
        FIRST_SEQUENCE,
        domain,
        Pubkey::default().to_bytes(),
        HANDOFF_SCOPE_BIT | COMPLETION_SCOPE_BIT,
        0,
    )?;

    let delegation_record: delegation_engine::state::DelegationRecord = h.account(delegation);
    assert_eq!(delegation_record.identity, identity.address);
    assert_eq!(delegation_record.delegate, delegate.pubkey());
    assert_eq!(
        delegation_record.allowed_actions,
        HANDOFF_SCOPE_BIT | COMPLETION_SCOPE_BIT
    );

    let completion = h.emit_delegated_receipt(
        &identity,
        &task,
        &delegate,
        delegation,
        214,
        COMPLETION_KIND,
        SECOND_SEQUENCE,
        domain,
        handoff_receipt.to_bytes(),
    )?;

    let task_record: task_registry::state::TaskRecord = h.account(task);
    assert_eq!(task_record.last_receipt, completion);
    assert_eq!(task_record.last_sequence, SECOND_SEQUENCE);

    Ok(())
}
