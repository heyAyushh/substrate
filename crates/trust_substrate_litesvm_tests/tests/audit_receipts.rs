use anchor_lang::prelude::Pubkey;
use trust_substrate_litesvm_tests::*;

#[test]
fn tracks_audit_receipts_without_advancing_the_task_chain() -> TestResult {
    let mut h = Harness::new()?;
    let domain = bytes32(DOMAIN_BYTE);
    h.register_domain(domain)?;

    let builder = h.create_identity(131)?;
    let reviewer = h.create_reviewer_identity(132)?;
    let task = h.create_task(&builder, 133)?;
    let target_receipt = h.emit_receipt(
        &builder,
        &task,
        134,
        COMPLETION_KIND,
        FIRST_SEQUENCE,
        domain,
        Pubkey::default().to_bytes(),
    )?;
    let challenge = h.emit_audit_receipt(
        &reviewer,
        builder.address,
        target_receipt,
        CHALLENGE_KIND,
        domain,
        FIRST_AUDIT_ROUND,
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
