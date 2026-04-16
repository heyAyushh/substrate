use solana_signer::Signer;
use trust_substrate_core::{hash_leaf, EMPTY_MERKLE_ROOT};
use trust_substrate_litesvm_tests::*;

#[test]
fn verifies_receipt_driven_checkpoint_rotation_and_inclusion_failures() -> TestResult {
    let mut h = Harness::new()?;
    h.register_domain(bytes32(DOMAIN_BYTE))?;
    let identity = h.create_identity(91)?;
    let task = h.create_task_with_domain(&identity, 92, bytes32(DOMAIN_BYTE))?;
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
    assert_eq!(
        checkpoint_account.previous_root,
        h.checkpoint_root(checkpoint)
    );

    Ok(())
}

#[test]
fn rejects_out_of_order_or_wrong_identity_checkpoint_appends() -> TestResult {
    let mut h = Harness::new()?;
    h.register_domain(bytes32(DOMAIN_BYTE))?;
    let identity = h.create_identity(95)?;
    let other_identity = h.create_identity(96)?;
    let task = h.create_task_with_domain(&identity, 97, bytes32(DOMAIN_BYTE))?;
    let other_task = h.create_task_with_domain(&other_identity, 98, bytes32(DOMAIN_BYTE))?;
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

#[test]
fn imports_trusted_checkpoint_roots_only_for_configured_governance() -> TestResult {
    let mut h = Harness::new()?;
    let identity = h.create_identity(102)?;
    let governance = h.funded_keypair()?;
    let imported_root = bytes32(103);
    let imported_leaf_count = 7;
    let checkpoint = checkpoint_pda(identity.address, FIRST_EPOCH);

    h.initialize_checkpoint_importer(governance.pubkey())?;

    let ix = h.ix_checkpoint_import(
        &identity,
        checkpoint,
        FIRST_EPOCH,
        imported_root,
        imported_leaf_count,
    );
    h.expect_err_as_payer(ix, "CheckpointImportAuthorityMismatch");

    h.checkpoint_import(
        &identity,
        governance.as_ref(),
        checkpoint,
        FIRST_EPOCH,
        imported_root,
        imported_leaf_count,
    )?;

    let checkpoint_account: proof_verifier::state::HistoryCheckpoint = h.account(checkpoint);
    let latest_checkpoint: proof_verifier::state::LatestCheckpoint =
        h.account(latest_checkpoint_pda(identity.address));
    assert!(checkpoint_account.imported);
    assert_eq!(checkpoint_account.root, imported_root);
    assert_eq!(checkpoint_account.leaf_count, imported_leaf_count);
    assert_eq!(checkpoint_account.previous_root, EMPTY_MERKLE_ROOT);
    assert_eq!(latest_checkpoint.checkpoint, checkpoint);
    assert_eq!(latest_checkpoint.root, imported_root);
    assert_eq!(latest_checkpoint.epoch, FIRST_EPOCH);

    h.register_domain(bytes32(DOMAIN_BYTE))?;
    let task = h.create_task_with_domain(&identity, 104, bytes32(DOMAIN_BYTE))?;
    let receipt = h.emit_receipt(
        &identity,
        &task,
        105,
        ASSIGNMENT_KIND,
        FIRST_SEQUENCE,
        bytes32(DOMAIN_BYTE),
        bytes32(0),
    )?;
    let ix = h.ix_append_receipt_to_checkpoint(&identity, checkpoint, receipt);
    h.expect_err_as_payer(ix, "CheckpointImportedIsReadOnly");

    Ok(())
}
