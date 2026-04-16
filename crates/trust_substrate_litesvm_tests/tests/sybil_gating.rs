use anchor_lang::prelude::Pubkey;
use trust_substrate_litesvm_tests::*;

#[test]
fn tier0_identities_cannot_emit_audit_receipts_until_bonded() -> TestResult {
    let mut h = Harness::new()?;
    let domain = bytes32(DOMAIN_BYTE);
    h.register_domain(domain)?;

    let builder = h.create_identity(221)?;
    let reviewer = h.create_reviewer_identity(222)?;
    let task = h.create_task_with_domain(&builder, 223, domain)?;
    let target_receipt = h.emit_receipt(
        &builder,
        &task,
        224,
        COMPLETION_KIND,
        FIRST_SEQUENCE,
        domain,
        Pubkey::default().to_bytes(),
    )?;

    let unbonded_ix = h.ix_emit_audit_receipt(
        &reviewer,
        builder.address,
        target_receipt,
        audit_receipt_pda(
            reviewer.address,
            target_receipt,
            CHALLENGE_KIND,
            FIRST_AUDIT_ROUND,
        ),
        CHALLENGE_KIND,
        domain,
        FIRST_AUDIT_ROUND,
        30,
    );
    h.expect_err_as_reviewer(unbonded_ix, "IdentityBondRequired");

    h.deposit_identity_bond(&reviewer)?;

    let challenge = h.emit_challenge_receipt(
        &reviewer,
        builder.address,
        target_receipt,
        domain,
        FIRST_AUDIT_ROUND,
        30,
    )?;
    let challenge_record: receipt_emitter::state::ReceiptRecord = h.account(challenge);
    assert_eq!(challenge_record.auditor_identity, reviewer.address);

    Ok(())
}

#[test]
fn identity_bond_withdraw_requires_settled_identity_state() -> TestResult {
    let mut h = Harness::new()?;
    let domain = bytes32(DOMAIN_BYTE);
    h.register_domain(domain)?;

    let builder = h.create_identity(231)?;
    h.deposit_identity_bond(&builder)?;

    let task = h.create_task_with_domain(&builder, 232, domain)?;
    let withdraw_ix = h.ix_withdraw_identity_bond(builder.address, h.payer_pubkey());
    h.expect_err_as_payer(withdraw_ix, "IdentityHasOpenTasks");

    let completion = h.emit_receipt(
        &builder,
        &task,
        233,
        COMPLETION_KIND,
        FIRST_SEQUENCE,
        domain,
        Pubkey::default().to_bytes(),
    )?;
    h.sync_task_status(&builder, task, completion)?;

    let reviewer = h.create_reviewer_identity(234)?;
    h.deposit_identity_bond(&reviewer)?;
    let challenge = h.emit_challenge_receipt(
        &reviewer,
        builder.address,
        completion,
        domain,
        FIRST_AUDIT_ROUND,
        40,
    )?;
    let withdraw_ix = h.ix_withdraw_identity_bond(builder.address, h.payer_pubkey());
    h.expect_err_as_payer(withdraw_ix, "IdentityHasOpenChallenges");

    h.emit_challenge_response(&builder, challenge)?;
    h.withdraw_identity_bond(&builder)?;

    Ok(())
}
