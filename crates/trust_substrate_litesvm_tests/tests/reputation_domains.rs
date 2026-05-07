use anchor_lang::prelude::Pubkey;
use solana_signer::Signer;
use trust_substrate_litesvm_tests::*;

const REVIEWER_TIER: u8 = 2;
const BONDED_TIER_WEIGHT: u64 = 4;
const FIVE_SOL: u64 = 5_000_000_000;
const THREE_SOL: u64 = 3_000_000_000;
const ONE_SOL: u64 = 1_000_000_000;
const STAKE_RUNTIME_SLASHED_WEIGHT: u64 = 7;
const OVER_MAX_REPUTATION_WEIGHT: u64 = 11;

fn reviewer_evidence(reviewer: &IdentityFixture, attester: Pubkey) -> Vec<Pubkey> {
    vec![
        reviewer.address,
        identity_bond_pda(reviewer.address),
        attester,
    ]
}

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
fn rejects_reputation_domain_weights_above_protocol_cap() -> TestResult {
    let mut h = Harness::new()?;
    let domain = bytes32(SECOND_DOMAIN_BYTE);
    h.register_domain(domain)?;
    let identity = h.create_identity(116)?;

    let ix = h.ix_create_reputation_domain_with_weights(
        &identity,
        domain,
        OVER_MAX_REPUTATION_WEIGHT,
        0,
        0,
    );
    h.expect_err_as_payer(ix, "ReputationWeightTooLarge");

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
    assert_eq!(reputation_record.weighted_completed, 1);
    assert_eq!(reputation_record.reviewer_weight_sum, 1);
    assert_eq!(reputation_record.disputed, 0);

    Ok(())
}

#[test]
fn rejects_dispute_resolution_reputation_without_dispute_evidence() -> TestResult {
    let mut h = Harness::new()?;
    let domain = bytes32(SECOND_DOMAIN_BYTE);
    h.register_domain(domain)?;

    let identity = h.create_identity(161)?;
    let task = h.create_task_with_domain(&identity, 162, domain)?;
    let resolution = h.emit_receipt(
        &identity,
        &task,
        163,
        DISPUTE_RESOLVED_KIND,
        FIRST_SEQUENCE,
        domain,
        Pubkey::default().to_bytes(),
    )?;
    let reputation = h.create_reputation_domain(&identity, domain)?;

    let ix = h.ix_apply_reputation_receipt(&identity, resolution, reputation);
    h.expect_err_as_payer(ix, "ReputationDisputeRequiredForResolution");

    Ok(())
}

#[test]
fn dispute_resolution_does_not_clear_negative_verdict_reputation() -> TestResult {
    let mut h = Harness::new()?;
    let domain = bytes32(THIRD_DOMAIN_BYTE);
    h.register_domain(domain)?;

    let identity = h.create_identity(171)?;
    let governance = h.funded_keypair()?;
    let adjudicator = h.funded_keypair()?;
    let task = h.create_task_with_domain(&identity, 172, domain)?;
    let dispute = h.emit_receipt(
        &identity,
        &task,
        173,
        DISPUTE_KIND,
        FIRST_SEQUENCE,
        domain,
        Pubkey::default().to_bytes(),
    )?;
    let resolution = h.emit_receipt(
        &identity,
        &task,
        174,
        DISPUTE_RESOLVED_KIND,
        SECOND_SEQUENCE,
        domain,
        dispute.to_bytes(),
    )?;
    let reputation = h.create_reputation_domain(&identity, domain)?;

    h.register_adjudicator(governance.as_ref(), adjudicator.pubkey())?;
    let verdict = verdict_pda(dispute);
    h.record_verdict(
        adjudicator.as_ref(),
        dispute,
        verdict,
        AGENT_LOST_OUTCOME,
        ONE_SOL,
    )?;
    h.apply_reputation_receipt_with_evidence(
        &identity,
        dispute,
        reputation,
        h.payer_pubkey(),
        &[verdict],
    )?;
    h.apply_reputation_receipt_with_evidence(
        &identity,
        resolution,
        reputation,
        h.payer_pubkey(),
        &[dispute, verdict],
    )?;

    let reputation_record: reputation_accumulator::state::ReputationAccumulator =
        h.account(reputation);
    assert_eq!(reputation_record.disputed, 1);
    assert_eq!(reputation_record.weighted_disputed, 1);
    assert_eq!(reputation_record.resolved, 0);
    assert_eq!(reputation_record.weighted_resolved, 0);
    assert_eq!(reputation_record.reviewer_weight_sum, 1);

    Ok(())
}

#[test]
fn rejects_stale_non_safety_verdicts_for_reputation_disputes() -> TestResult {
    let mut h = Harness::new()?;
    let domain = bytes32(DOMAIN_BYTE);
    h.register_domain(domain)?;

    let identity = h.create_identity(181)?;
    let governance = h.funded_keypair()?;
    let adjudicator = h.funded_keypair()?;
    let task = h.create_task_with_domain(&identity, 182, domain)?;
    let dispute = h.emit_receipt(
        &identity,
        &task,
        183,
        DISPUTE_KIND,
        FIRST_SEQUENCE,
        domain,
        Pubkey::default().to_bytes(),
    )?;
    let reputation = h.create_reputation_domain(&identity, domain)?;

    h.register_adjudicator(governance.as_ref(), adjudicator.pubkey())?;
    let verdict = verdict_pda(dispute);
    let stale_after_slot = h.current_slot() + 5;
    h.record_verdict_with_class(
        adjudicator.as_ref(),
        dispute,
        verdict,
        AGENT_LOST_OUTCOME,
        ONE_SOL,
        VERDICT_CLASS_PERFORMANCE,
        stale_after_slot,
    )?;
    h.warp_to_slot(stale_after_slot + 1);

    let ix = h.ix_apply_reputation_receipt_with_evidence(
        &identity,
        dispute,
        reputation,
        h.payer_pubkey(),
        &[verdict],
    );
    h.expect_err_as_payer(ix, "VerdictStale");

    Ok(())
}

#[test]
fn rejects_zero_weight_reputation_applications() -> TestResult {
    let mut h = Harness::new()?;
    let domain = bytes32(DOMAIN_BYTE);
    h.register_domain(domain)?;

    let identity = h.create_identity(191)?;
    let slash_authority = h.funded_keypair()?;
    let governance = h.funded_keypair()?;
    let adjudicator = h.funded_keypair()?;
    let stake =
        h.initialize_stake_for_identity(&identity, slash_authority.pubkey(), TRUST_MODE_AUTHORITY)?;
    h.stake_for_identity(&identity, stake, THREE_SOL)?;

    let task = h.create_task_with_domain(&identity, 192, domain)?;
    let dispute = h.emit_receipt(
        &identity,
        &task,
        193,
        DISPUTE_KIND,
        FIRST_SEQUENCE,
        domain,
        Pubkey::default().to_bytes(),
    )?;
    let resolution = h.emit_receipt(
        &identity,
        &task,
        194,
        DISPUTE_RESOLVED_KIND,
        SECOND_SEQUENCE,
        domain,
        dispute.to_bytes(),
    )?;
    h.register_adjudicator(governance.as_ref(), adjudicator.pubkey())?;
    h.slash_with_authority(
        slash_authority.as_ref(),
        stake,
        resolution,
        slash_marker_pda(stake, resolution),
        treasury_vault_pda(),
        THREE_SOL,
    )?;
    let completion = h.emit_receipt(
        &identity,
        &task,
        195,
        COMPLETION_KIND,
        3,
        domain,
        resolution.to_bytes(),
    )?;
    let reputation = h.create_reputation_domain(&identity, domain)?;

    let ix = h.ix_apply_reputation_receipt_with_evidence(
        &identity,
        completion,
        reputation,
        h.payer_pubkey(),
        &[stake],
    );
    h.expect_err_as_payer(ix, "ReputationReviewerWeightZero");

    Ok(())
}

#[test]
fn weights_bonded_attester_audit_reputation_on_chain() -> TestResult {
    let mut h = Harness::new()?;
    let domain = bytes32(THIRD_DOMAIN_BYTE);
    h.register_domain(domain)?;

    let builder = h.create_identity(126)?;
    let reviewer = h.create_reviewer_identity(127)?;
    let attester = h.register_bonded_attester(&reviewer, REVIEWER_TIER)?;

    let task = h.create_task_with_domain(&builder, 128, domain)?;
    let completion = h.emit_receipt(
        &builder,
        &task,
        129,
        COMPLETION_KIND,
        FIRST_SEQUENCE,
        domain,
        Pubkey::default().to_bytes(),
    )?;
    let attestation = h.emit_audit_receipt(
        &reviewer,
        builder.address,
        completion,
        ATTESTATION_KIND,
        domain,
        FIRST_AUDIT_ROUND,
    )?;
    let reputation = h.create_reputation_domain(&builder, domain)?;
    let evidence = reviewer_evidence(&reviewer, attester);

    h.apply_reputation_receipt_with_evidence(
        &builder,
        attestation,
        reputation,
        h.reviewer_pubkey(),
        &evidence,
    )?;

    let reputation_record: reputation_accumulator::state::ReputationAccumulator =
        h.account(reputation);
    assert_eq!(reputation_record.attested, 1);
    assert_eq!(reputation_record.weighted_attested, BONDED_TIER_WEIGHT);
    assert_eq!(reputation_record.reviewer_weight_sum, BONDED_TIER_WEIGHT);

    Ok(())
}

#[test]
fn rejects_missing_or_fake_reviewer_attester_evidence() -> TestResult {
    let mut h = Harness::new()?;
    let domain = bytes32(SECOND_DOMAIN_BYTE);
    h.register_domain(domain)?;

    let builder = h.create_identity(141)?;
    let reviewer = h.create_reviewer_identity(142)?;
    h.deposit_identity_bond(&reviewer)?;

    let fake_attester_identity = h.create_identity(143)?;
    h.deposit_identity_bond(&fake_attester_identity)?;
    let fake_attester =
        h.register_attester(&fake_attester_identity, "review".to_string(), REVIEWER_TIER)?;

    let task = h.create_task_with_domain(&builder, 144, domain)?;
    let completion = h.emit_receipt(
        &builder,
        &task,
        145,
        COMPLETION_KIND,
        FIRST_SEQUENCE,
        domain,
        Pubkey::default().to_bytes(),
    )?;
    let attestation = h.emit_audit_receipt(
        &reviewer,
        builder.address,
        completion,
        ATTESTATION_KIND,
        domain,
        FIRST_AUDIT_ROUND,
    )?;
    let reputation = h.create_reputation_domain(&builder, domain)?;

    let missing_attester_ix = h.ix_apply_reputation_receipt_with_evidence(
        &builder,
        attestation,
        reputation,
        h.reviewer_pubkey(),
        &[reviewer.address, identity_bond_pda(reviewer.address)],
    );
    h.expect_err_as_reviewer(missing_attester_ix, "ReputationReviewerEvidenceMissing");

    let fake_attester_ix = h.ix_apply_reputation_receipt_with_evidence(
        &builder,
        attestation,
        reputation,
        h.reviewer_pubkey(),
        &[
            reviewer.address,
            identity_bond_pda(reviewer.address),
            fake_attester,
        ],
    );
    h.expect_err_as_reviewer(fake_attester_ix, "ReputationEvidenceMismatch");

    Ok(())
}

#[test]
fn stake_runtime_and_slash_history_adjust_reviewer_weight() -> TestResult {
    let mut h = Harness::new()?;
    let domain = bytes32(DOMAIN_BYTE);
    h.register_domain(domain)?;

    let builder = h.create_identity(151)?;
    let reviewer = h.create_identity(152)?;
    let attester = h.register_bonded_attester(&reviewer, REVIEWER_TIER)?;
    let slash_authority = h.funded_keypair()?;
    let governance = h.funded_keypair()?;
    let adjudicator = h.funded_keypair()?;

    let stake =
        h.initialize_stake_for_identity(&reviewer, slash_authority.pubkey(), TRUST_MODE_AUTHORITY)?;
    h.stake_for_identity(&reviewer, stake, FIVE_SOL)?;

    let reviewer_task = h.create_task_with_domain(&reviewer, 153, domain)?;
    let dispute = h.emit_receipt(
        &reviewer,
        &reviewer_task,
        154,
        DISPUTE_KIND,
        FIRST_SEQUENCE,
        domain,
        Pubkey::default().to_bytes(),
    )?;
    let resolution = h.emit_receipt(
        &reviewer,
        &reviewer_task,
        155,
        DISPUTE_RESOLVED_KIND,
        SECOND_SEQUENCE,
        domain,
        dispute.to_bytes(),
    )?;
    h.register_adjudicator(governance.as_ref(), adjudicator.pubkey())?;
    h.slash_with_authority(
        slash_authority.as_ref(),
        stake,
        resolution,
        slash_marker_pda(stake, resolution),
        treasury_vault_pda(),
        ONE_SOL,
    )?;

    let task = h.create_task_with_domain(&builder, 156, domain)?;
    let completion = h.emit_receipt(
        &builder,
        &task,
        157,
        COMPLETION_KIND,
        FIRST_SEQUENCE,
        domain,
        Pubkey::default().to_bytes(),
    )?;
    let attestation = h.emit_audit_receipt(
        &reviewer,
        builder.address,
        completion,
        ATTESTATION_KIND,
        domain,
        FIRST_AUDIT_ROUND,
    )?;
    let reputation = h.create_reputation_domain(&builder, domain)?;
    let runtime_commit = bytes32(158);
    let wrong_runtime = h.append_runtime_attestation(&builder, bytes32(159), h.payer_pubkey())?;

    let wrong_runtime_ix = h.ix_apply_reputation_receipt_with_evidence(
        &builder,
        attestation,
        reputation,
        h.payer_pubkey(),
        &[
            reviewer.address,
            identity_bond_pda(reviewer.address),
            attester,
            stake,
            wrong_runtime,
        ],
    );
    h.expect_err_as_payer(wrong_runtime_ix, "ReputationRuntimeAttestationMismatch");

    let runtime = h.append_runtime_attestation(&reviewer, runtime_commit, h.payer_pubkey())?;
    h.apply_reputation_receipt_with_evidence(
        &builder,
        attestation,
        reputation,
        h.payer_pubkey(),
        &[
            reviewer.address,
            identity_bond_pda(reviewer.address),
            attester,
            stake,
            runtime,
        ],
    )?;

    let reputation_record: reputation_accumulator::state::ReputationAccumulator =
        h.account(reputation);
    assert_eq!(
        reputation_record.weighted_attested,
        STAKE_RUNTIME_SLASHED_WEIGHT
    );
    assert_eq!(
        reputation_record.reviewer_weight_sum,
        STAKE_RUNTIME_SLASHED_WEIGHT
    );
    assert_eq!(reputation_record.slash_penalty_sum, 1);

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
    let attester = h.register_bonded_attester(&reviewer, REVIEWER_TIER)?;

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

    let mut evidence = reviewer_evidence(&reviewer, attester);
    evidence.insert(0, verdict);
    let ix = h.ix_apply_reputation_receipt_with_evidence(
        &builder,
        dispute,
        reputation,
        h.reviewer_pubkey(),
        &evidence,
    );
    h.send_as_reviewer(ix)?;

    let reputation_record: reputation_accumulator::state::ReputationAccumulator =
        h.account(reputation);
    assert_eq!(reputation_record.disputed, 1);
    assert_eq!(reputation_record.weighted_disputed, BONDED_TIER_WEIGHT);
    assert_eq!(reputation_record.reviewer_weight_sum, BONDED_TIER_WEIGHT);

    Ok(())
}
