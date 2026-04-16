use trust_substrate_core::{hash_leaf, EMPTY_MERKLE_ROOT};
use trust_substrate_litesvm_tests::*;

#[test]
fn verifies_receipt_driven_checkpoint_rotation_and_inclusion_failures() -> TestResult {
    let mut h = Harness::new()?;
    h.register_domain(bytes32(DOMAIN_BYTE))?;
    let identity = h.create_identity(91)?;
    let task = h.create_task(&identity, 92)?;
    let first_receipt = h.emit_receipt(
        &identity,
        &task,
        93,
        ASSIGNMENT_KIND,
        FIRST_SEQUENCE,
        bytes32(DOMAIN_BYTE),
        bytes32(0),
    )?;
    let second_receipt = h.emit_receipt(
        &identity,
        &task,
        94,
        COMPLETION_KIND,
        SECOND_SEQUENCE,
        bytes32(DOMAIN_BYTE),
        first_receipt.to_bytes(),
    )?;
    let checkpoint = h.initialize_checkpoint(&identity, FIRST_EPOCH)?;

    h.append_receipt_to_checkpoint(&identity, checkpoint, first_receipt)?;
    h.append_receipt_to_checkpoint(&identity, checkpoint, second_receipt)?;

    h.verify_receipt_inclusion(
        &identity,
        checkpoint,
        hash_leaf(second_receipt.as_ref()),
        1,
        vec![hash_leaf(first_receipt.as_ref())],
    )?;

    let ix = h.ix_rotate_checkpoint(&identity, checkpoint, SKIPPED_EPOCH);
    h.expect_err_as_payer(ix, "CheckpointEpochNotSequential");

    let next_checkpoint = h.rotate_checkpoint(&identity, checkpoint, NEXT_EPOCH)?;
    let ix = h.ix_verify_receipt_inclusion(
        &identity,
        checkpoint,
        hash_leaf(second_receipt.as_ref()),
        1,
        vec![hash_leaf(first_receipt.as_ref())],
    );
    h.expect_err_as_payer(ix, "StaleCheckpoint");
    let ix = h.ix_verify_receipt_inclusion(
        &identity,
        next_checkpoint,
        hash_leaf(first_receipt.as_ref()),
        0,
        vec![],
    );
    h.expect_err_as_payer(ix, "ProofIndexOutOfRange");

    let checkpoint_account: proof_verifier::state::HistoryCheckpoint = h.account(next_checkpoint);
    assert_eq!(checkpoint_account.root, EMPTY_MERKLE_ROOT);
    assert_eq!(checkpoint_account.leaf_count, 0);
    assert_eq!(checkpoint_account.previous_root, h.checkpoint_root(checkpoint));

    Ok(())
}

#[test]
fn rejects_out_of_order_or_wrong_identity_checkpoint_appends() -> TestResult {
    let mut h = Harness::new()?;
    h.register_domain(bytes32(DOMAIN_BYTE))?;
    let identity = h.create_identity(95)?;
    let other_identity = h.create_identity(96)?;
    let task = h.create_task(&identity, 97)?;
    let other_task = h.create_task(&other_identity, 98)?;
    let first_receipt = h.emit_receipt(
        &identity,
        &task,
        99,
        ASSIGNMENT_KIND,
        FIRST_SEQUENCE,
        bytes32(DOMAIN_BYTE),
        bytes32(0),
    )?;
    let second_receipt = h.emit_receipt(
        &identity,
        &task,
        100,
        COMPLETION_KIND,
        SECOND_SEQUENCE,
        bytes32(DOMAIN_BYTE),
        first_receipt.to_bytes(),
    )?;
    let foreign_receipt = h.emit_receipt(
        &other_identity,
        &other_task,
        101,
        ASSIGNMENT_KIND,
        FIRST_SEQUENCE,
        bytes32(DOMAIN_BYTE),
        bytes32(0),
    )?;
    let checkpoint = h.initialize_checkpoint(&identity, FIRST_EPOCH)?;

    let ix = h.ix_append_receipt_to_checkpoint(&identity, checkpoint, second_receipt);
    h.expect_err_as_payer(ix, "CheckpointOrderingViolation");

    h.append_receipt_to_checkpoint(&identity, checkpoint, first_receipt)?;

    let ix = h.ix_append_receipt_to_checkpoint(&identity, checkpoint, first_receipt);
    h.expect_err_as_payer(ix, "CheckpointReceiptAlreadyAppended");

    let ix = h.ix_append_receipt_to_checkpoint(&identity, checkpoint, foreign_receipt);
    h.expect_err_as_payer(ix, "CheckpointReceiptIdentityMismatch");

    Ok(())
}
