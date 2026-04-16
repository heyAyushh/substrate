use anchor_lang::prelude::Pubkey;
use solana_signer::Signer;
use trust_substrate_litesvm_tests::*;

#[test]
fn slashes_verdict_mode_stake_only_with_matching_verdict_and_treasury() -> TestResult {
    let mut h = Harness::new()?;
    let domain = bytes32(DOMAIN_BYTE);
    h.register_domain(domain)?;

    let builder = h.create_identity(151)?;
    let reviewer = h.create_reviewer_identity(152)?;
    let governance = h.funded_keypair()?;
    let adjudicator = h.funded_keypair()?;
    let slash_authority = h.funded_keypair()?;

    let stake = h.initialize_stake(&builder, slash_authority.pubkey(), TRUST_MODE_VERDICT)?;
    h.stake(stake, 1_000_000_000)?;

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
    let dispute = h.emit_audit_receipt(
        &reviewer,
        builder.address,
        target_receipt,
        DISPUTE_KIND,
        domain,
        FIRST_AUDIT_ROUND,
    )?;

    h.register_adjudicator(governance.as_ref(), adjudicator.pubkey())?;

    let ix = h.ix_slash_with_verdict(
        stake,
        dispute,
        verdict_pda(dispute),
        slash_marker_pda(stake, dispute),
        treasury_vault_pda(),
        adjudicator.pubkey(),
    );
    h.expect_err_contains(ix, &[adjudicator.as_ref()], "AccountNotInitialized");

    h.record_verdict(
        adjudicator.as_ref(),
        dispute,
        verdict_pda(dispute),
        AGENT_LOST_OUTCOME,
        100_000_000,
    )?;

    let ix = h.ix_slash_with_authority(
        stake,
        dispute,
        slash_marker_pda(stake, dispute),
        treasury_vault_pda(),
        slash_authority.pubkey(),
        100_000_000,
    );
    h.expect_err_contains(ix, &[slash_authority.as_ref()], "StakeTrustModeMismatch");

    let treasury_before = h.lamports(treasury_vault_pda())?;
    h.slash_with_verdict(
        adjudicator.as_ref(),
        stake,
        dispute,
        verdict_pda(dispute),
        slash_marker_pda(stake, dispute),
        treasury_vault_pda(),
    )?;

    let stake_record: agent_stake::state::StakeAccount = h.account(stake);
    assert_eq!(stake_record.amount, 900_000_000);
    assert_eq!(stake_record.slashed_total, 100_000_000);
    assert_eq!(stake_record.trust_mode, TRUST_MODE_VERDICT);
    assert_eq!(
        h.lamports(treasury_vault_pda())?,
        treasury_before + 100_000_000
    );

    let ix = h.ix_slash_with_verdict(
        stake,
        dispute,
        verdict_pda(dispute),
        slash_marker_pda(stake, dispute),
        treasury_vault_pda(),
        adjudicator.pubkey(),
    );
    h.expect_err_contains(ix, &[adjudicator.as_ref()], "already in use");

    Ok(())
}

#[test]
fn keeps_authority_slashing_as_opt_in_trust_mode() -> TestResult {
    let mut h = Harness::new()?;
    let domain = bytes32(DOMAIN_BYTE);
    h.register_domain(domain)?;

    let identity = h.create_identity(161)?;
    let governance = h.funded_keypair()?;
    let adjudicator = h.funded_keypair()?;
    let slash_authority = h.funded_keypair()?;

    let stake = h.initialize_stake(&identity, slash_authority.pubkey(), TRUST_MODE_AUTHORITY)?;
    h.stake(stake, 1_000_000_000)?;

    let task = h.create_task_with_domain(&identity, 162, domain)?;
    let dispute = h.emit_receipt(
        &identity,
        &task,
        163,
        DISPUTE_KIND,
        FIRST_SEQUENCE,
        domain,
        Pubkey::default().to_bytes(),
    )?;
    let resolution = h.emit_receipt(
        &identity,
        &task,
        164,
        DISPUTE_RESOLVED_KIND,
        SECOND_SEQUENCE,
        domain,
        dispute.to_bytes(),
    )?;

    h.register_adjudicator(governance.as_ref(), adjudicator.pubkey())?;
    h.record_verdict(
        adjudicator.as_ref(),
        dispute,
        verdict_pda(dispute),
        AGENT_LOST_OUTCOME,
        50_000_000,
    )?;

    let ix = h.ix_slash_with_verdict(
        stake,
        dispute,
        verdict_pda(dispute),
        slash_marker_pda(stake, dispute),
        treasury_vault_pda(),
        adjudicator.pubkey(),
    );
    h.expect_err_contains(ix, &[adjudicator.as_ref()], "StakeTrustModeMismatch");

    h.slash_with_authority(
        slash_authority.as_ref(),
        stake,
        resolution,
        slash_marker_pda(stake, resolution),
        treasury_vault_pda(),
        75_000_000,
    )?;

    let stake_record: agent_stake::state::StakeAccount = h.account(stake);
    assert_eq!(stake_record.amount, 925_000_000);
    assert_eq!(stake_record.slashed_total, 75_000_000);
    assert_eq!(stake_record.trust_mode, TRUST_MODE_AUTHORITY);

    Ok(())
}

#[test]
fn rejects_time_boxed_verdicts_without_stale_window() -> TestResult {
    let mut h = Harness::new()?;
    let domain = bytes32(DOMAIN_BYTE);
    h.register_domain(domain)?;

    let builder = h.create_identity(171)?;
    let reviewer = h.create_reviewer_identity(172)?;
    let governance = h.funded_keypair()?;
    let adjudicator = h.funded_keypair()?;

    let task = h.create_task_with_domain(&builder, 173, domain)?;
    let target_receipt = h.emit_receipt(
        &builder,
        &task,
        174,
        COMPLETION_KIND,
        FIRST_SEQUENCE,
        domain,
        Pubkey::default().to_bytes(),
    )?;
    let dispute = h.emit_audit_receipt(
        &reviewer,
        builder.address,
        target_receipt,
        DISPUTE_KIND,
        domain,
        FIRST_AUDIT_ROUND,
    )?;

    h.register_adjudicator(governance.as_ref(), adjudicator.pubkey())?;

    let verdict = verdict_pda(dispute);
    let ix = h.ix_record_verdict_with_class(
        adjudicator.pubkey(),
        dispute,
        verdict,
        AGENT_LOST_OUTCOME,
        25_000_000,
        VERDICT_CLASS_POLICY,
        0,
    );
    match h.send_raw(ix, &[adjudicator.as_ref()]) {
        Err(err) => {
            let logs = err.meta.pretty_logs();
            assert!(
                logs.contains("VerdictStaleWindowMissing")
                    || format!("{:?}", err.err).contains("VerdictStaleWindowMissing"),
                "expected VerdictStaleWindowMissing, got `{}` with logs:\n{}",
                format!("{:?}", err.err),
                logs
            );
        }
        Ok(_) => {
            let verdict_record: dispute_resolver::state::DisputeVerdict = h.account(verdict);
            panic!(
                "record_verdict unexpectedly succeeded with class={} stale_after_slot={}",
                verdict_record.class, verdict_record.stale_after_slot
            );
        }
    }

    Ok(())
}

#[test]
fn rejects_expired_performance_verdicts_for_slashing() -> TestResult {
    let mut h = Harness::new()?;
    let domain = bytes32(DOMAIN_BYTE);
    h.register_domain(domain)?;

    let builder = h.create_identity(181)?;
    let reviewer = h.create_reviewer_identity(182)?;
    let governance = h.funded_keypair()?;
    let adjudicator = h.funded_keypair()?;
    let slash_authority = h.funded_keypair()?;

    let stake = h.initialize_stake(&builder, slash_authority.pubkey(), TRUST_MODE_VERDICT)?;
    h.stake(stake, 1_000_000_000)?;

    let task = h.create_task_with_domain(&builder, 183, domain)?;
    let target_receipt = h.emit_receipt(
        &builder,
        &task,
        184,
        COMPLETION_KIND,
        FIRST_SEQUENCE,
        domain,
        Pubkey::default().to_bytes(),
    )?;
    let dispute = h.emit_audit_receipt(
        &reviewer,
        builder.address,
        target_receipt,
        DISPUTE_KIND,
        domain,
        FIRST_AUDIT_ROUND,
    )?;

    h.register_adjudicator(governance.as_ref(), adjudicator.pubkey())?;

    let stale_after_slot = h.current_slot() + 1;
    h.record_verdict_with_class(
        adjudicator.as_ref(),
        dispute,
        verdict_pda(dispute),
        AGENT_LOST_OUTCOME,
        100_000_000,
        VERDICT_CLASS_PERFORMANCE,
        stale_after_slot,
    )?;

    h.warp_to_slot(stale_after_slot + 1);

    let ix = h.ix_slash_with_verdict(
        stake,
        dispute,
        verdict_pda(dispute),
        slash_marker_pda(stake, dispute),
        treasury_vault_pda(),
        adjudicator.pubkey(),
    );
    match h.send_raw(ix, &[adjudicator.as_ref()]) {
        Err(err) => {
            let logs = err.meta.pretty_logs();
            assert!(
                logs.contains("VerdictStale") || format!("{:?}", err.err).contains("VerdictStale"),
                "expected VerdictStale, got `{}` with logs:\n{}",
                format!("{:?}", err.err),
                logs
            );
        }
        Ok(_) => {
            let stake_record: agent_stake::state::StakeAccount = h.account(stake);
            panic!(
                "slash_with_verdict unexpectedly succeeded with amount={} slashed_total={}",
                stake_record.amount, stake_record.slashed_total
            );
        }
    }

    Ok(())
}

#[test]
fn keeps_safety_verdicts_slashable_after_time_passes() -> TestResult {
    let mut h = Harness::new()?;
    let domain = bytes32(DOMAIN_BYTE);
    h.register_domain(domain)?;

    let builder = h.create_identity(191)?;
    let reviewer = h.create_reviewer_identity(192)?;
    let governance = h.funded_keypair()?;
    let adjudicator = h.funded_keypair()?;
    let slash_authority = h.funded_keypair()?;

    let stake = h.initialize_stake(&builder, slash_authority.pubkey(), TRUST_MODE_VERDICT)?;
    h.stake(stake, 1_000_000_000)?;

    let task = h.create_task_with_domain(&builder, 193, domain)?;
    let target_receipt = h.emit_receipt(
        &builder,
        &task,
        194,
        COMPLETION_KIND,
        FIRST_SEQUENCE,
        domain,
        Pubkey::default().to_bytes(),
    )?;
    let dispute = h.emit_audit_receipt(
        &reviewer,
        builder.address,
        target_receipt,
        DISPUTE_KIND,
        domain,
        FIRST_AUDIT_ROUND,
    )?;

    h.register_adjudicator(governance.as_ref(), adjudicator.pubkey())?;
    h.record_verdict_with_class(
        adjudicator.as_ref(),
        dispute,
        verdict_pda(dispute),
        AGENT_LOST_OUTCOME,
        100_000_000,
        VERDICT_CLASS_SAFETY,
        0,
    )?;

    h.advance_slots(100);

    h.slash_with_verdict(
        adjudicator.as_ref(),
        stake,
        dispute,
        verdict_pda(dispute),
        slash_marker_pda(stake, dispute),
        treasury_vault_pda(),
    )?;

    let stake_record: agent_stake::state::StakeAccount = h.account(stake);
    assert_eq!(stake_record.amount, 900_000_000);
    assert_eq!(stake_record.slashed_total, 100_000_000);

    Ok(())
}

#[test]
fn records_verdict_class_metadata() -> TestResult {
    let mut h = Harness::new()?;
    let domain = bytes32(DOMAIN_BYTE);
    h.register_domain(domain)?;

    let builder = h.create_identity(201)?;
    let reviewer = h.create_reviewer_identity(202)?;
    let governance = h.funded_keypair()?;
    let adjudicator = h.funded_keypair()?;

    let task = h.create_task_with_domain(&builder, 203, domain)?;
    let target_receipt = h.emit_receipt(
        &builder,
        &task,
        204,
        COMPLETION_KIND,
        FIRST_SEQUENCE,
        domain,
        Pubkey::default().to_bytes(),
    )?;
    let dispute = h.emit_audit_receipt(
        &reviewer,
        builder.address,
        target_receipt,
        DISPUTE_KIND,
        domain,
        FIRST_AUDIT_ROUND,
    )?;

    h.register_adjudicator(governance.as_ref(), adjudicator.pubkey())?;
    h.record_verdict_with_class(
        adjudicator.as_ref(),
        dispute,
        verdict_pda(dispute),
        AGENT_LOST_OUTCOME,
        25_000_000,
        VERDICT_CLASS_POLICY,
        42,
    )?;

    let verdict_record: dispute_resolver::state::DisputeVerdict = h.account(verdict_pda(dispute));
    assert_eq!(verdict_record.class, VERDICT_CLASS_POLICY);
    assert_eq!(verdict_record.stale_after_slot, 42);

    Ok(())
}
