use anchor_lang::prelude::Pubkey;
use trust_substrate_litesvm_tests::*;

#[test]
fn rejects_receipt_chain_breaks_and_duplicate_applications() -> TestResult {
    let mut h = Harness::new()?;
    let domain = bytes32(DOMAIN_BYTE);
    h.register_domain(domain)?;

    let identity = h.create_identity(51)?;
    let task = h.create_task(&identity, 52, domain)?;
    let receipt = h.emit_receipt(
        &identity,
        &task,
        53,
        COMPLETION_KIND,
        FIRST_SEQUENCE,
        domain,
        Pubkey::default().to_bytes(),
    )?;

    let ix = h.ix_emit_receipt(
        &identity,
        task,
        receipt_pda(identity.address, task, bytes32(54)),
        bytes32(54),
        COMPLETION_KIND,
        FIRST_SEQUENCE,
        domain,
        receipt.to_bytes(),
    );
    h.expect_err_as_payer(ix, "ReceiptSequenceNotMonotonic");

    let ix = h.ix_emit_receipt(
        &identity,
        task,
        receipt_pda(identity.address, task, bytes32(55)),
        bytes32(55),
        COMPLETION_KIND,
        SECOND_SEQUENCE,
        domain,
        bytes32(99),
    );
    h.expect_err_as_payer(ix, "ReceiptChainBroken");

    h.sync_task_status(&identity, task, receipt)?;
    let ix = h.ix_sync_task_status(&identity, task, receipt);
    h.expect_err_as_payer(ix, "already in use");

    let reputation = h.create_reputation_domain(&identity, domain)?;
    h.apply_reputation_receipt(&identity, receipt, reputation)?;
    let ix = h.ix_apply_reputation_receipt(&identity, receipt, reputation);
    h.expect_err_as_payer(ix, "already in use");

    Ok(())
}

#[test]
fn rejects_receipts_whose_domain_does_not_match_the_task() -> TestResult {
    let mut h = Harness::new()?;
    let task_domain = bytes32(DOMAIN_BYTE);
    let receipt_domain = bytes32(SECOND_DOMAIN_BYTE);
    h.register_domain(task_domain)?;
    h.register_domain(receipt_domain)?;

    let identity = h.create_identity(61)?;
    let task = h.create_task(&identity, 62, task_domain)?;
    let ix = h.ix_emit_receipt(
        &identity,
        task,
        receipt_pda(identity.address, task, bytes32(63)),
        bytes32(63),
        COMPLETION_KIND,
        FIRST_SEQUENCE,
        receipt_domain,
        Pubkey::default().to_bytes(),
    );
    h.expect_err_as_payer(ix, "TaskDomainMismatch");

    Ok(())
}
