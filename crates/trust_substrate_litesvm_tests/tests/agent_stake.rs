use anchor_lang::prelude::Pubkey;
use solana_signer::Signer;
use trust_substrate_litesvm_tests::*;

#[test]
fn tracks_stake_unstake_slash_and_stake_failures() -> TestResult {
    let mut h = Harness::new()?;
    let domain = bytes32(DOMAIN_BYTE);
    h.register_domain(domain)?;

    let slash_authority = h.funded_keypair()?;
    let treasury = h.funded_keypair()?;
    let identity = h.create_identity(151)?;
    let stake = h.initialize_stake(&identity, slash_authority.pubkey())?;

    let ix = h.ix_stake(stake, 0);
    h.expect_err_as_payer(ix, "StakeAmountMustBePositive");
    h.stake(stake, 1_000_000_000)?;
    h.request_unstake(stake, 250_000_000)?;
    let ix = h.ix_finalize_unstake(stake);
    h.expect_err_as_payer(ix, "StakeCooldownNotElapsed");
    h.advance_slots(STAKE_COOLDOWN_SLOTS);
    h.finalize_unstake(stake)?;

    let task = h.create_task(&identity, 152)?;
    let dispute = h.emit_receipt(
        &identity,
        &task,
        153,
        DISPUTE_KIND,
        FIRST_SEQUENCE,
        domain,
        Pubkey::default().to_bytes(),
    )?;
    let resolution = h.emit_receipt(
        &identity,
        &task,
        154,
        DISPUTE_RESOLVED_KIND,
        SECOND_SEQUENCE,
        domain,
        dispute.to_bytes(),
    )?;

    let ix = h.ix_slash(
        stake,
        dispute,
        slash_marker_pda(stake, dispute),
        treasury.pubkey(),
        slash_authority.pubkey(),
        1,
    );
    h.expect_err_contains(ix, &[slash_authority.as_ref()], "StakeReceiptKindMismatch");

    let marker = slash_marker_pda(stake, resolution);
    h.slash(
        &slash_authority,
        stake,
        resolution,
        marker,
        treasury.pubkey(),
        100_000_000,
    )?;
    let ix = h.ix_slash(
        stake,
        resolution,
        marker,
        treasury.pubkey(),
        slash_authority.pubkey(),
        100_000_000,
    );
    h.expect_err_contains(ix, &[slash_authority.as_ref()], "already in use");

    let stake_record: agent_stake::state::StakeAccount = h.account(stake);
    assert_eq!(stake_record.amount, 650_000_000);
    assert_eq!(stake_record.slashed_total, 100_000_000);

    Ok(())
}
