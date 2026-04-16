use anchor_lang::prelude::Pubkey;
use solana_signer::Signer;
use trust_substrate_litesvm_tests::*;

#[test]
fn enforces_domain_registration_and_reputation_rules() -> TestResult {
    let mut h = Harness::new()?;
    let domain = bytes32(SECOND_DOMAIN_BYTE);
    let deprecated_domain = bytes32(THIRD_DOMAIN_BYTE);
    h.register_domain(domain)?;
    h.register_domain(deprecated_domain)?;

    let identity = h.create_identity(111)?;
    let ix = h.ix_create_reputation_domain(&identity, bytes32(222));
    h.expect_err_as_payer(ix, "DomainNotRegistered");

    h.deprecate_domain(deprecated_domain)?;
    let ix = h.ix_create_reputation_domain(&identity, deprecated_domain);
    h.expect_err_as_payer(ix, "DomainNotRegistered");

    let task = h.create_task_with_domain(&identity, 112, domain)?;
    let receipt = h.emit_receipt(
        &identity,
        &task,
        113,
        ASSIGNMENT_KIND,
        FIRST_SEQUENCE,
        domain,
        Pubkey::default().to_bytes(),
    )?;
    let reputation = h.create_reputation_domain(&identity, domain)?;

    let ix = h.ix_apply_reputation_receipt(&identity, receipt, reputation);
    h.expect_err_as_payer(ix, "ReceiptKindNotAppliedToReputation");

    Ok(())
}

#[test]
fn allows_third_party_reputation_application() -> TestResult {
    let mut h = Harness::new()?;
    let domain = bytes32(SECOND_DOMAIN_BYTE);
    h.register_domain(domain)?;

    let identity = h.create_identity(121)?;
    let task = h.create_task_with_domain(&identity, 122, domain)?;
    let receipt = h.emit_receipt(
        &identity,
        &task,
        123,
        COMPLETION_KIND,
        FIRST_SEQUENCE,
        domain,
        Pubkey::default().to_bytes(),
    )?;
    let reputation = h.create_reputation_domain(&identity, domain)?;

    h.apply_reputation_receipt_as_reviewer(&identity, receipt, reputation)?;

    let reputation_record: reputation_accumulator::state::ReputationAccumulator =
        h.account(reputation);
    assert_eq!(reputation_record.completed, 1);
    assert_eq!(reputation_record.disputed, 0);

    Ok(())
}

#[test]
fn requires_a_verdict_before_a_dispute_can_degrade_reputation() -> TestResult {
    let mut h = Harness::new()?;
    let domain = bytes32(THIRD_DOMAIN_BYTE);
    h.register_domain(domain)?;

    let builder = h.create_identity(131)?;
    let reviewer = h.create_reviewer_identity(132)?;
    let governance = h.funded_keypair()?;
    let adjudicator = h.funded_keypair()?;
    h.deposit_identity_bond(&reviewer)?;

    let task = h.create_task_with_domain(&builder, 133, domain)?;
    let completion = h.emit_receipt(
        &builder,
        &task,
        134,
        COMPLETION_KIND,
        FIRST_SEQUENCE,
        domain,
        Pubkey::default().to_bytes(),
    )?;
    let dispute = h.emit_audit_receipt(
        &reviewer,
        builder.address,
        completion,
        DISPUTE_KIND,
        domain,
        FIRST_AUDIT_ROUND,
    )?;
    let reputation = h.create_reputation_domain(&builder, domain)?;

    let ix = h.ix_apply_reputation_receipt_with_authority_and_verdict(
        &builder,
        dispute,
        reputation,
        h.reviewer_pubkey(),
        None,
    );
    h.expect_err_as_reviewer(ix, "ReputationVerdictMissing");

    h.register_adjudicator(governance.as_ref(), adjudicator.pubkey())?;
    let verdict = verdict_pda(dispute);
    h.record_verdict(
        adjudicator.as_ref(),
        dispute,
        verdict,
        AGENT_LOST_OUTCOME,
        1,
    )?;

    let ix = h.ix_apply_reputation_receipt_with_authority_and_verdict(
        &builder,
        dispute,
        reputation,
        h.reviewer_pubkey(),
        Some(verdict),
    );
    h.send_as_reviewer(ix)?;

    let reputation_record: reputation_accumulator::state::ReputationAccumulator =
        h.account(reputation);
    assert_eq!(reputation_record.disputed, 1);

    Ok(())
}
