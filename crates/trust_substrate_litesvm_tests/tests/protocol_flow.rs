use anchor_lang::prelude::Pubkey;
use solana_signer::Signer;
use trust_substrate_core::EMPTY_MERKLE_ROOT;
use trust_substrate_litesvm_tests::*;

#[test]
fn records_identity_task_receipt_delegation_checkpoint_and_reputation() -> TestResult {
    let mut h = Harness::new()?;
    let domain = bytes32(DOMAIN_BYTE);
    h.register_domain(domain)?;

    let identity = h.create_identity(11)?;
    let task = h.create_task_with_domain(&identity, 22, domain)?;
    let delegate = h.funded_keypair()?;
    let delegation = h.create_delegation(
        &identity,
        delegate.pubkey(),
        ASSIGNMENT_SCOPE_BIT | HANDOFF_SCOPE_BIT | COMPLETION_SCOPE_BIT,
        0,
    )?;

    let handoff = h.emit_delegated_receipt(
        &identity,
        &task,
        &delegate,
        delegation,
        33,
        HANDOFF_KIND,
        FIRST_SEQUENCE,
        domain,
        Pubkey::default().to_bytes(),
    )?;
    let completion = h.emit_receipt(
        &identity,
        &task,
        34,
        COMPLETION_KIND,
        SECOND_SEQUENCE,
        domain,
        handoff.to_bytes(),
    )?;

    let checkpoint = h.initialize_checkpoint(&identity, FIRST_EPOCH)?;
    h.append_receipt_to_checkpoint(&identity, checkpoint, handoff)?;
    h.append_receipt_to_checkpoint(&identity, checkpoint, completion)?;
    h.rotate_checkpoint(&identity, checkpoint, NEXT_EPOCH)?;

    let reputation = h.create_reputation_domain(&identity, domain)?;
    h.apply_reputation_receipt(&identity, completion, reputation)?;
    h.sync_task_status(&identity, task, completion)?;

    let identity_record: identity_registry::state::AgentIdentity = h.account(identity.address);
    let task_record: task_registry::state::TaskRecord = h.account(task);
    let reputation_record: reputation_accumulator::state::ReputationAccumulator =
        h.account(reputation);

    assert_eq!(identity_record.history_root, EMPTY_MERKLE_ROOT);
    assert_eq!(task_record.status, TASK_STATUS_COMPLETED);
    assert_eq!(task_record.last_sequence, SECOND_SEQUENCE);
    assert_eq!(task_record.last_receipt, completion);
    assert_eq!(reputation_record.completed, 1);

    Ok(())
}
