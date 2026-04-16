use reputation_accumulator::state::DomainStatsSnapshot;
use solana_signer::Signer;
use trust_substrate_litesvm_tests::*;

#[test]
fn writes_domain_stats_snapshots_for_registered_domains() -> TestResult {
    let mut h = Harness::new()?;
    let domain = bytes32(DOMAIN_BYTE);
    h.register_domain(domain)?;

    let operator = h.funded_keypair()?;
    let snapshot =
        h.write_domain_stats_snapshot(operator.as_ref(), domain, 12, 4, 3, 88, bytes32(200))?;

    let snapshot_record: DomainStatsSnapshot = h.account(snapshot);
    assert_eq!(snapshot_record.domain, domain);
    assert_eq!(snapshot_record.operator, operator.pubkey());
    assert_eq!(snapshot_record.receipt_count, 12);
    assert_eq!(snapshot_record.task_count, 4);
    assert_eq!(snapshot_record.agent_count, 3);
    assert_eq!(snapshot_record.snapshot_slot, 88);
    assert_eq!(snapshot_record.payload_hash, bytes32(200));

    Ok(())
}

#[test]
fn rejects_domain_stats_snapshots_for_unregistered_domains() -> TestResult {
    let mut h = Harness::new()?;
    let operator = h.funded_keypair()?;
    let domain = bytes32(SECOND_DOMAIN_BYTE);

    let ix = h.ix_write_domain_stats_snapshot(operator.pubkey(), domain, 1, 1, 1, 9, bytes32(201));
    h.expect_err_contains(ix, &[operator.as_ref()], "DomainNotRegistered");

    Ok(())
}
