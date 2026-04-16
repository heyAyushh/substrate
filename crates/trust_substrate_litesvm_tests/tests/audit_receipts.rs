use anchor_lang::prelude::Pubkey;
use trust_substrate_litesvm_tests::*;

#[test]
fn tracks_audit_receipts_without_advancing_the_task_chain() -> TestResult {
    let mut h = Harness::new()?;
    let domain = bytes32(DOMAIN_BYTE);
    h.register_domain(domain)?;

    let builder = h.create_identity(131)?;
    let reviewer = h.create_reviewer_identity(132)?;
    let task = h.create_task_with_domain(&builder, 133, domain)?;
    let target_receipt = h.emit_receipt(
        &builder,
        &task,
        134,
        COMPLETION_KIND,
        FIRST_SEQUENCE,
        domain,
        Pubkey::default().to_bytes(),
    )?;
    let challenge = h.emit_challenge_receipt(
        &reviewer,
        builder.address,
        target_receipt,
        domain,
        FIRST_AUDIT_ROUND,
        20,
    )?;

    let task_record: task_registry::state::TaskRecord = h.account(task);
    let challenge_record: receipt_emitter::state::ReceiptRecord = h.account(challenge);
    assert_eq!(task_record.last_receipt, target_receipt);
    assert_eq!(challenge_record.identity, builder.address);
    assert_eq!(challenge_record.auditor_identity, reviewer.address);
    assert_eq!(challenge_record.target_receipt, target_receipt);

    let ix = h.ix_emit_audit_receipt(
        &reviewer,
        builder.address,
        target_receipt,
        challenge,
        CHALLENGE_KIND,
        domain,
        FIRST_AUDIT_ROUND,
        20,
    );
    h.expect_err_as_reviewer(ix, "already in use");
    let ix = h.ix_emit_audit_receipt(
        &reviewer,
        builder.address,
        target_receipt,
        audit_receipt_pda(
            reviewer.address,
            target_receipt,
            COMPLETION_KIND,
            FIRST_AUDIT_ROUND,
        ),
        COMPLETION_KIND,
        domain,
        FIRST_AUDIT_ROUND,
        0,
    );
    h.expect_err_as_reviewer(ix, "ReceiptKindNotAuditable");
    let ix = h.ix_emit_audit_receipt(
        &builder,
        builder.address,
        target_receipt,
        audit_receipt_pda(
            builder.address,
            target_receipt,
            CHALLENGE_KIND,
            FIRST_AUDIT_ROUND,
        ),
        CHALLENGE_KIND,
        domain,
        FIRST_AUDIT_ROUND,
        20,
    );
    h.expect_err_as_payer(ix, "ReceiptAuditorCannotTargetOwnReceipt");

    let attestation = h.emit_audit_receipt(
        &reviewer,
        builder.address,
        target_receipt,
        ATTESTATION_KIND,
        domain,
        1,
    )?;
    let attestation_record: receipt_emitter::state::ReceiptRecord = h.account(attestation);
    assert_eq!(attestation_record.kind, ATTESTATION_KIND);

    Ok(())
}

#[test]
fn finalize_unanswered_challenge_requires_elapsed_deadline() -> TestResult {
    let mut h = Harness::new()?;
    let domain = bytes32(DOMAIN_BYTE);
    h.register_domain(domain)?;

    let builder = h.create_identity(141)?;
    let reviewer = h.create_reviewer_identity(142)?;
    let task = h.create_task_with_domain(&builder, 143, domain)?;
    let target_receipt = h.emit_receipt(
        &builder,
        &task,
        144,
        COMPLETION_KIND,
        FIRST_SEQUENCE,
        domain,
        Pubkey::default().to_bytes(),
    )?;
    let challenge = h.emit_challenge_receipt(
        &reviewer,
        builder.address,
        target_receipt,
        domain,
        FIRST_AUDIT_ROUND,
        20,
    )?;
    let dispute = audit_receipt_pda(reviewer.address, target_receipt, DISPUTE_KIND, FIRST_AUDIT_ROUND);

    let ix = h.ix_finalize_unanswered_challenge(challenge, target_receipt, dispute);
    h.expect_err_as_payer(ix, "ChallengeDeadlineNotElapsed");

    h.warp_to_slot(21);
    h.finalize_unanswered_challenge(challenge, target_receipt, dispute)?;

    let dispute_record: receipt_emitter::state::ReceiptRecord = h.account(dispute);
    assert_eq!(dispute_record.kind, DISPUTE_KIND);
    assert_eq!(dispute_record.identity, builder.address);
    assert_eq!(dispute_record.target_receipt, target_receipt);
    assert_eq!(dispute_record.previous_receipt, challenge.to_bytes());

    let ix = h.ix_finalize_unanswered_challenge(challenge, target_receipt, dispute);
    h.expect_err_as_payer(ix, "already in use");

    Ok(())
}

#[test]
fn finalize_unanswered_challenge_rejects_matching_response() -> TestResult {
    let mut h = Harness::new()?;
    let domain = bytes32(DOMAIN_BYTE);
    h.register_domain(domain)?;

    let builder = h.create_identity(151)?;
    let reviewer = h.create_reviewer_identity(152)?;
    let task = h.create_task_with_domain(&builder, 153, domain)?;
    let target_receipt = h.emit_receipt(
        &builder,
        &task,
        154,
        COMPLETION_KIND,
        FIRST_SEQUENCE,
        domain,
        Pubkey::default().to_bytes(),
    )?;
    let challenge = h.emit_challenge_receipt(
        &reviewer,
        builder.address,
        target_receipt,
        domain,
        FIRST_AUDIT_ROUND,
        30,
    )?;
    let response = h.emit_challenge_response(&builder, challenge)?;
    let dispute = audit_receipt_pda(reviewer.address, target_receipt, DISPUTE_KIND, FIRST_AUDIT_ROUND);

    h.warp_to_slot(31);
    let ix = h.ix_finalize_unanswered_challenge(challenge, target_receipt, dispute);
    h.expect_err_as_payer(ix, "ChallengeAlreadyResponded");

    let response_record: receipt_emitter::state::ReceiptRecord = h.account(response);
    assert_eq!(response_record.kind, CHALLENGE_RESPONSE_KIND);
    assert_eq!(response_record.challenge_receipt, challenge);

    Ok(())
}
