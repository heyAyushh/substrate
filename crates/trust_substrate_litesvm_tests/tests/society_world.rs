use anchor_lang::prelude::Pubkey;
use trust_substrate_litesvm_tests::{
    bytes32, society_world_pda, Harness, TestResult, THIRD_DOMAIN_BYTE,
    SOCIETY_WORLD_STATUS_ACTIVE, SOCIETY_WORLD_STATUS_COMPLETE,
};

#[test]
fn society_world_snapshot_persists_and_advances() -> TestResult {
    let mut h = Harness::new()?;
    let identity = h.create_identity(41)?;
    let task = h.create_task(&identity, 42, bytes32(THIRD_DOMAIN_BYTE))?;
    let world = society_world_pda(task);
    let initial_state = b"{\"tick\":0,\"agents\":5}".to_vec();

    h.create_society_world(
        &identity,
        task,
        0,
        0,
        Pubkey::default(),
        SOCIETY_WORLD_STATUS_ACTIVE,
        initial_state.clone(),
    )?;

    let created: task_registry::state::SocietyWorld = h.account(world);
    assert_eq!(created.identity, identity.address);
    assert_eq!(created.task, task);
    assert_eq!(created.current_tick, 0);
    assert_eq!(created.last_sequence, 0);
    assert_eq!(created.status, SOCIETY_WORLD_STATUS_ACTIVE);
    assert_eq!(created.state, initial_state);

    let updated_state = b"{\"tick\":3,\"agents\":7}".to_vec();
    let last_receipt = Pubkey::new_from_array(bytes32(99));
    h.update_society_world(
        &identity,
        task,
        3,
        8,
        last_receipt,
        SOCIETY_WORLD_STATUS_COMPLETE,
        updated_state.clone(),
    )?;

    let updated: task_registry::state::SocietyWorld = h.account(world);
    assert_eq!(updated.current_tick, 3);
    assert_eq!(updated.last_sequence, 8);
    assert_eq!(updated.last_receipt, last_receipt);
    assert_eq!(updated.status, SOCIETY_WORLD_STATUS_COMPLETE);
    assert_eq!(updated.state, updated_state);
    Ok(())
}

#[test]
fn society_world_rejects_tick_regression() -> TestResult {
    let mut h = Harness::new()?;
    let identity = h.create_identity(51)?;
    let task = h.create_task(&identity, 52, bytes32(THIRD_DOMAIN_BYTE))?;

    h.create_society_world(
        &identity,
        task,
        4,
        4,
        Pubkey::new_from_array(bytes32(70)),
        SOCIETY_WORLD_STATUS_ACTIVE,
        b"{\"tick\":4}".to_vec(),
    )?;

    let ix = h.ix_update_society_world(
        identity.address,
        task,
        3,
        5,
        Pubkey::new_from_array(bytes32(71)),
        SOCIETY_WORLD_STATUS_ACTIVE,
        b"{\"tick\":3}".to_vec(),
    );
    h.expect_err_as_payer(ix, "SocietyWorldTickRegression");
    Ok(())
}
