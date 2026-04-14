use trust_substrate_litesvm_tests::*;

#[test]
fn verifies_checkpoint_rotation_and_inclusion_failures() -> TestResult {
    let mut h = Harness::new()?;
    let identity = h.create_identity(91)?;
    let checkpoint = h.checkpoint_history(&identity, FIRST_EPOCH, bytes32(92), 1)?;

    h.verify_receipt_inclusion(&identity, checkpoint, bytes32(92), 0, vec![])?;

    let ix = h.ix_rotate_checkpoint(&identity, checkpoint, SKIPPED_EPOCH, bytes32(93), 2);
    h.expect_err_as_payer(ix, "CheckpointEpochNotSequential");

    let next_checkpoint = h.rotate_checkpoint(&identity, checkpoint, NEXT_EPOCH, bytes32(94), 2)?;
    let ix = h.ix_verify_receipt_inclusion(&identity, checkpoint, bytes32(92), 0, vec![]);
    h.expect_err_as_payer(ix, "StaleCheckpoint");
    let ix = h.ix_verify_receipt_inclusion(&identity, next_checkpoint, bytes32(95), 0, vec![]);
    h.expect_err_as_payer(ix, "InvalidMerkleProof");

    Ok(())
}
