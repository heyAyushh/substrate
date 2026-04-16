use anchor_lang::{
    prelude::{AccountMeta, Pubkey},
    system_program, AccountDeserialize, InstructionData, ToAccountMetas,
};
use anyhow::{anyhow, Result};
use litesvm::{
    types::{FailedTransactionMetadata, TransactionMetadata},
    LiteSVM,
};
use solana_clock::Clock;
use solana_keypair::Keypair;
use solana_message::{Message, VersionedMessage};
use solana_signer::Signer;
use solana_transaction::versioned::VersionedTransaction;
use std::rc::Rc;

pub use trust_substrate_core::{
    ADJUDICATOR_CONFIG_SEED, AGENT_LOST_OUTCOME, AGENT_WON_OUTCOME, ASSIGNMENT_KIND,
    ASSIGNMENT_SCOPE_BIT, ATTESTATION_KIND, ATTESTER_CONFIG_SEED, ATTESTER_RECORD_SEED,
    AUDIT_RECEIPT_SEED, CHALLENGE_KIND, CHALLENGE_RESPONSE_KIND, CHALLENGE_RESPONSE_SEED,
    CHECKPOINT_IMPORTER_SEED, CHECKPOINT_SEED, COMPLETION_KIND, COMPLETION_SCOPE_BIT,
    DELEGATION_SEED, DISPUTE_KIND, DISPUTE_RESOLVED_KIND, DOMAIN_CATALOG_SEED, DOMAIN_STATS_SEED,
    GUARDIAN_SET_SEED, HANDOFF_KIND, HANDOFF_SCOPE_BIT, IDENTITY_BOND_SEED, IDENTITY_SEED,
    LATEST_CHECKPOINT_SEED, NO_FAULT_OUTCOME, RUNTIME_ATTESTATION_SEED,
    PENDING_ROTATION_SEED, RECEIPT_SEED, REPUTATION_RECEIPT_APPLICATION_SEED, REPUTATION_SEED,
    ROTATION_COOLDOWN_SLOTS, SLASH_MARKER_SEED, STAKE_COOLDOWN_SLOTS, STAKE_SEED,
    TASK_RECEIPT_APPLICATION_SEED, TASK_SEED, TASK_STATUS_COMPLETED, TASK_STATUS_PENDING,
    TREASURY_VAULT_SEED, TRUST_MODE_AUTHORITY, TRUST_MODE_VERDICT, VERDICT_CLASS_PERFORMANCE,
    VERDICT_CLASS_POLICY, VERDICT_CLASS_SAFETY, VERDICT_SEED,
};

pub const DOMAIN_BYTE: u8 = 77;
pub const SECOND_DOMAIN_BYTE: u8 = 105;
pub const THIRD_DOMAIN_BYTE: u8 = 125;
pub const FIRST_EPOCH: u64 = 1;
pub const NEXT_EPOCH: u64 = 2;
pub const SKIPPED_EPOCH: u64 = 3;
pub const FIRST_SEQUENCE: u64 = 1;
pub const SECOND_SEQUENCE: u64 = 2;
pub const FIRST_AUDIT_ROUND: u16 = 0;

const LAMPORTS_PER_TEST_ACCOUNT: u64 = 10_000_000_000;
const COMPLETION_WEIGHT: u64 = 0;
const DISPUTE_WEIGHT: u64 = 0;
const DISPUTE_RESOLVED_WEIGHT: u64 = 0;
const SUBTASK_COUNT: u16 = 2;

pub type TestResult<T = ()> = Result<T>;

#[derive(Clone)]
pub struct IdentityFixture {
    pub address: Pubkey,
    pub agent_id: [u8; 32],
}

pub struct Harness {
    svm: LiteSVM,
    payer: Rc<Keypair>,
    reviewer: Rc<Keypair>,
    cpi_authority: Pubkey,
    history_updater: Pubkey,
    domain_catalog: Pubkey,
    attester_registry_config: Pubkey,
    treasury_vault: Pubkey,
}

impl Harness {
    pub fn new() -> TestResult<Self> {
        let mut svm = LiteSVM::new();
        load_programs(&mut svm)?;

        let payer = Rc::new(Keypair::new());
        let reviewer = Rc::new(Keypair::new());
        svm.airdrop(&payer.pubkey(), LAMPORTS_PER_TEST_ACCOUNT)
            .map_err(|err| anyhow!(format_failed_transaction(err)))?;
        svm.airdrop(&reviewer.pubkey(), LAMPORTS_PER_TEST_ACCOUNT)
            .map_err(|err| anyhow!(format_failed_transaction(err)))?;

        let cpi_authority = pda(&[b"cpi_authority"], &receipt_emitter::ID);
        let history_updater = pda(&[b"history_updater"], &proof_verifier::ID);
        let domain_catalog = pda(&[DOMAIN_CATALOG_SEED], &reputation_accumulator::ID);
        let attester_registry_config = pda(&[ATTESTER_CONFIG_SEED], &attester_registry::ID);
        let treasury_vault = pda(&[TREASURY_VAULT_SEED], &dispute_resolver::ID);

        let mut harness = Self {
            svm,
            payer,
            reviewer,
            cpi_authority,
            history_updater,
            domain_catalog,
            attester_registry_config,
            treasury_vault,
        };
        let ix = harness.ix_initialize_cpi_authority();
        harness.send_as_payer(ix)?;
        let ix = harness.ix_initialize_history_updater();
        harness.send_as_payer(ix)?;
        let ix = harness.ix_initialize_domain_catalog();
        harness.send_as_payer(ix)?;
        let ix = harness.ix_initialize_attester_registry();
        harness.send_as_payer(ix)?;
        Ok(harness)
    }

    pub fn funded_keypair(&mut self) -> TestResult<Rc<Keypair>> {
        let keypair = Rc::new(Keypair::new());
        self.svm
            .airdrop(&keypair.pubkey(), LAMPORTS_PER_TEST_ACCOUNT)
            .map_err(|err| anyhow!(format_failed_transaction(err)))?;
        Ok(keypair)
    }

    pub fn reviewer_pubkey(&self) -> Pubkey {
        self.reviewer.pubkey()
    }

    pub fn send_raw(
        &mut self,
        instruction: anchor_lang::solana_program::instruction::Instruction,
        signers: &[&Keypair],
    ) -> std::result::Result<TransactionMetadata, litesvm::types::FailedTransactionMetadata> {
        let payer = signers
            .first()
            .expect("at least one signer must pay for the transaction");
        let message = Message::new_with_blockhash(
            &[instruction],
            Some(&payer.pubkey()),
            &self.svm.latest_blockhash(),
        );
        let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(message), signers)
            .expect("valid transaction");
        let result = self.svm.send_transaction(tx);
        self.svm.expire_blockhash();
        result
    }

    pub fn send(
        &mut self,
        instruction: anchor_lang::solana_program::instruction::Instruction,
        signers: &[&Keypair],
    ) -> TestResult<TransactionMetadata> {
        self.send_raw(instruction, signers)
            .map_err(|err| anyhow!(format_failed_transaction(err)))
    }

    pub fn send_as_payer(
        &mut self,
        instruction: anchor_lang::solana_program::instruction::Instruction,
    ) -> TestResult<TransactionMetadata> {
        let payer = self.payer.clone();
        self.send(instruction, &[payer.as_ref()])
    }

    pub fn send_as_reviewer(
        &mut self,
        instruction: anchor_lang::solana_program::instruction::Instruction,
    ) -> TestResult<TransactionMetadata> {
        let reviewer = self.reviewer.clone();
        self.send(instruction, &[reviewer.as_ref()])
    }

    pub fn expect_err_contains(
        &mut self,
        instruction: anchor_lang::solana_program::instruction::Instruction,
        signers: &[&Keypair],
        expected: &str,
    ) {
        let err = self
            .send_raw(instruction, signers)
            .expect_err("transaction should fail");
        let logs = err.meta.pretty_logs();
        assert!(
            logs.contains(expected) || format!("{:?}", err.err).contains(expected),
            "expected error containing `{expected}`, got `{}` with logs:\n{}",
            format!("{:?}", err.err),
            logs
        );
    }

    pub fn expect_err_as_payer(
        &mut self,
        instruction: anchor_lang::solana_program::instruction::Instruction,
        expected: &str,
    ) {
        let payer = self.payer.clone();
        self.expect_err_contains(instruction, &[payer.as_ref()], expected);
    }

    pub fn expect_err_as_reviewer(
        &mut self,
        instruction: anchor_lang::solana_program::instruction::Instruction,
        expected: &str,
    ) {
        let reviewer = self.reviewer.clone();
        self.expect_err_contains(instruction, &[reviewer.as_ref()], expected);
    }

    pub fn account<T: AccountDeserialize>(&self, address: Pubkey) -> T {
        let account = self
            .svm
            .get_account(&address)
            .unwrap_or_else(|| panic!("missing account {address}"));
        let mut data: &[u8] = &account.data;
        T::try_deserialize(&mut data).expect("account should deserialize")
    }

    pub fn lamports(&self, address: Pubkey) -> TestResult<u64> {
        let account = self
            .svm
            .get_account(&address)
            .ok_or_else(|| anyhow!("missing account {address}"))?;
        Ok(account.lamports)
    }

    pub fn account_exists(&self, address: Pubkey) -> bool {
        self.svm.get_account(&address).is_some()
    }

    pub fn current_slot(&self) -> u64 {
        self.svm.get_sysvar::<Clock>().slot
    }

    pub fn payer_pubkey(&self) -> Pubkey {
        self.payer.pubkey()
    }

    pub fn warp_to_slot(&mut self, slot: u64) {
        self.svm.warp_to_slot(slot);
    }

    pub fn advance_slots(&mut self, slots: u64) {
        let current_slot = self.svm.get_sysvar::<Clock>().slot;
        self.svm.warp_to_slot(current_slot + slots);
    }

    pub fn create_identity(&mut self, byte: u8) -> TestResult<IdentityFixture> {
        let agent_id = bytes32(byte);
        let identity = identity_pda(self.payer.pubkey(), agent_id);
        let ix = self.ix_create_identity(self.payer.pubkey(), identity, agent_id);
        self.send_as_payer(ix)?;
        Ok(IdentityFixture {
            address: identity,
            agent_id,
        })
    }

    pub fn create_reviewer_identity(&mut self, byte: u8) -> TestResult<IdentityFixture> {
        let agent_id = bytes32(byte);
        let identity = identity_pda(self.reviewer.pubkey(), agent_id);
        let ix = self.ix_create_identity(self.reviewer.pubkey(), identity, agent_id);
        self.send_as_reviewer(ix)?;
        Ok(IdentityFixture {
            address: identity,
            agent_id,
        })
    }

    pub fn create_task(
        &mut self,
        identity: &IdentityFixture,
        byte: u8,
        domain: [u8; 32],
    ) -> TestResult<Pubkey> {
        let task = task_pda(identity.address, bytes32(byte));
        let ix = self.ix_create_task(identity.address, task, bytes32(byte), domain);
        self.send_as_payer(ix)?;
        let task_record: task_registry::state::TaskRecord = self.account(task);
        assert_eq!(task_record.status, TASK_STATUS_PENDING);
        assert_eq!(task_record.domain, domain);
        Ok(task)
    }

    pub fn create_task_with_domain(
        &mut self,
        identity: &IdentityFixture,
        byte: u8,
        domain: [u8; 32],
    ) -> TestResult<Pubkey> {
        self.create_task(identity, byte, domain)
    }

    pub fn deposit_identity_bond(&mut self, identity: &IdentityFixture) -> TestResult {
        let use_reviewer =
            identity.address == identity_pda(self.reviewer.pubkey(), identity.agent_id);
        let authority = if use_reviewer {
            self.reviewer.clone()
        } else {
            self.payer.clone()
        };
        let ix = self.ix_deposit_identity_bond(identity.address, authority.pubkey());
        self.send(ix, &[authority.as_ref()])?;
        Ok(())
    }

    pub fn withdraw_identity_bond(&mut self, identity: &IdentityFixture) -> TestResult {
        let use_reviewer =
            identity.address == identity_pda(self.reviewer.pubkey(), identity.agent_id);
        let authority = if use_reviewer {
            self.reviewer.clone()
        } else {
            self.payer.clone()
        };
        let ix = self.ix_withdraw_identity_bond(identity.address, authority.pubkey());
        self.send(ix, &[authority.as_ref()])?;
        Ok(())
    }

    pub fn create_delegation(
        &mut self,
        identity: &IdentityFixture,
        delegate: Pubkey,
        allowed_actions: u8,
        expires_at_slot: u64,
    ) -> TestResult<Pubkey> {
        let delegation = delegation_pda(identity.address, delegate);
        let ix = self.ix_create_delegation(
            identity.address,
            delegate,
            delegation,
            allowed_actions,
            expires_at_slot,
        );
        self.send_as_payer(ix)?;
        Ok(delegation)
    }

    pub fn request_authority_rotation(
        &mut self,
        identity: &IdentityFixture,
        new_authority: Pubkey,
        unlock_slot: u64,
    ) -> TestResult<Pubkey> {
        let pending_rotation = pending_rotation_pda(identity.address);
        let ix = self.ix_rotate_authority(
            identity.address,
            pending_rotation,
            new_authority,
            unlock_slot,
        );
        self.send_as_payer(ix)?;
        Ok(pending_rotation)
    }

    pub fn finalize_authority_rotation(
        &mut self,
        identity: &IdentityFixture,
        caller: &Keypair,
    ) -> TestResult<()> {
        let pending_rotation = pending_rotation_pda(identity.address);
        let ix = self.ix_finalize_authority_rotation(
            identity.address,
            pending_rotation,
            caller.pubkey(),
        );
        self.send(ix, &[caller])?;
        Ok(())
    }

    pub fn initialize_guardian_set(
        &mut self,
        identity: &IdentityFixture,
        guardians: &[Pubkey],
        threshold: u8,
    ) -> TestResult<Pubkey> {
        let guardian_set = guardian_set_pda(identity.address);
        let ix =
            self.ix_initialize_guardian_set(identity.address, guardian_set, guardians, threshold);
        self.send_as_payer(ix)?;
        Ok(guardian_set)
    }

    pub fn emergency_rotate_authority(
        &mut self,
        identity: &IdentityFixture,
        new_authority: Pubkey,
        refund_recipient: Pubkey,
        guardians: &[&Keypair],
    ) -> TestResult<()> {
        let guardian_set = guardian_set_pda(identity.address);
        let pending_rotation = pending_rotation_pda(identity.address);
        let ix = self.ix_emergency_rotate_authority(
            identity.address,
            Some(guardian_set),
            new_authority,
            refund_recipient,
            Some(pending_rotation),
            &guardians
                .iter()
                .map(|guardian| guardian.pubkey())
                .collect::<Vec<_>>(),
        );
        self.send(ix, guardians)?;
        Ok(())
    }

    pub fn update_policy_root(
        &mut self,
        identity: Pubkey,
        authority: &Keypair,
        new_root: [u8; 32],
    ) -> TestResult<()> {
        let ix = self.ix_update_policy_root(identity, authority.pubkey(), new_root);
        self.send(ix, &[authority])?;
        Ok(())
    }

    pub fn revoke_delegation(
        &mut self,
        identity: &IdentityFixture,
        delegation: Pubkey,
        revoke_at_slot: u64,
    ) -> TestResult {
        let ix = self.ix_revoke_delegation(identity.address, delegation, revoke_at_slot);
        self.send_as_payer(ix)?;
        Ok(())
    }

    pub fn emit_receipt(
        &mut self,
        identity: &IdentityFixture,
        task: &Pubkey,
        receipt_byte: u8,
        kind: u8,
        sequence: u64,
        domain: [u8; 32],
        previous_receipt: [u8; 32],
    ) -> TestResult<Pubkey> {
        let receipt_id = bytes32(receipt_byte);
        let receipt = receipt_pda(identity.address, *task, receipt_id);
        let ix = self.ix_emit_receipt(
            identity,
            *task,
            receipt,
            receipt_id,
            kind,
            sequence,
            domain,
            previous_receipt,
        );
        self.send_as_payer(ix)?;
        Ok(receipt)
    }

    pub fn emit_delegated_receipt(
        &mut self,
        identity: &IdentityFixture,
        task: &Pubkey,
        delegate: &Keypair,
        delegation: Pubkey,
        receipt_byte: u8,
        kind: u8,
        sequence: u64,
        domain: [u8; 32],
        previous_receipt: [u8; 32],
    ) -> TestResult<Pubkey> {
        let receipt_id = bytes32(receipt_byte);
        let receipt = receipt_pda(identity.address, *task, receipt_id);
        let ix = self.ix_emit_delegated_receipt(
            identity,
            *task,
            delegation,
            delegate.pubkey(),
            receipt,
            receipt_id,
            kind,
            sequence,
            domain,
            previous_receipt,
        );
        self.send(ix, &[delegate])?;
        Ok(receipt)
    }

    pub fn emit_handoff_grant(
        &mut self,
        identity: &IdentityFixture,
        task: Pubkey,
        delegate: Pubkey,
        receipt_byte: u8,
        sequence: u64,
        domain: [u8; 32],
        previous_receipt: [u8; 32],
        allowed_actions: u8,
        expires_at_slot: u64,
    ) -> TestResult<(Pubkey, Pubkey)> {
        let receipt_id = bytes32(receipt_byte);
        let receipt = receipt_pda(identity.address, task, receipt_id);
        let delegation = delegation_pda(identity.address, delegate);
        let ix = self.ix_emit_handoff_grant(
            identity,
            task,
            delegate,
            receipt,
            delegation,
            receipt_id,
            sequence,
            domain,
            previous_receipt,
            allowed_actions,
            expires_at_slot,
        );
        self.send_as_payer(ix)?;
        Ok((receipt, delegation))
    }

    pub fn emit_audit_receipt(
        &mut self,
        auditor: &IdentityFixture,
        target_identity: Pubkey,
        target_receipt: Pubkey,
        kind: u8,
        domain: [u8; 32],
        round: u16,
    ) -> TestResult<Pubkey> {
        self.emit_audit_receipt_with_deadline(
            auditor,
            target_identity,
            target_receipt,
            kind,
            domain,
            round,
            0,
        )
    }

    pub fn emit_audit_receipt_with_deadline(
        &mut self,
        auditor: &IdentityFixture,
        target_identity: Pubkey,
        target_receipt: Pubkey,
        kind: u8,
        domain: [u8; 32],
        round: u16,
        deadline_slot: u64,
    ) -> TestResult<Pubkey> {
        let audit_receipt = audit_receipt_pda(auditor.address, target_receipt, kind, round);
        let ix = self.ix_emit_audit_receipt(
            auditor,
            target_identity,
            target_receipt,
            audit_receipt,
            kind,
            domain,
            round,
            deadline_slot,
        );
        if auditor.address == identity_pda(self.reviewer.pubkey(), auditor.agent_id) {
            self.send_as_reviewer(ix)?;
        } else {
            self.send_as_payer(ix)?;
        }
        Ok(audit_receipt)
    }

    pub fn emit_challenge_receipt(
        &mut self,
        auditor: &IdentityFixture,
        target_identity: Pubkey,
        target_receipt: Pubkey,
        domain: [u8; 32],
        round: u16,
        deadline_slot: u64,
    ) -> TestResult<Pubkey> {
        self.emit_audit_receipt_with_deadline(
            auditor,
            target_identity,
            target_receipt,
            CHALLENGE_KIND,
            domain,
            round,
            deadline_slot,
        )
    }

    pub fn emit_challenge_response(
        &mut self,
        identity: &IdentityFixture,
        challenge: Pubkey,
    ) -> TestResult<Pubkey> {
        let response = challenge_response_pda(challenge);
        let ix = self.ix_emit_challenge_response(identity, challenge, response);
        self.send_as_payer(ix)?;
        Ok(response)
    }

    pub fn finalize_unanswered_challenge(
        &mut self,
        challenge: Pubkey,
        target_receipt: Pubkey,
        audit_receipt: Pubkey,
    ) -> TestResult {
        let ix = self.ix_finalize_unanswered_challenge(challenge, target_receipt, audit_receipt);
        self.send_as_payer(ix)?;
        Ok(())
    }

    pub fn initialize_checkpoint(
        &mut self,
        identity: &IdentityFixture,
        epoch: u64,
    ) -> TestResult<Pubkey> {
        let checkpoint = checkpoint_pda(identity.address, epoch);
        let ix = self.ix_initialize_checkpoint(identity, checkpoint, epoch);
        self.send_as_payer(ix)?;
        Ok(checkpoint)
    }

    pub fn initialize_checkpoint_importer(&mut self, authority: Pubkey) -> TestResult {
        let ix = self.ix_initialize_checkpoint_importer(authority);
        self.send_as_payer(ix)?;
        Ok(())
    }

    pub fn checkpoint_import(
        &mut self,
        identity: &IdentityFixture,
        authority: &Keypair,
        checkpoint: Pubkey,
        epoch: u64,
        root: [u8; 32],
        leaf_count: u64,
    ) -> TestResult {
        let ix = self.ix_checkpoint_import_with_authority(
            identity,
            authority.pubkey(),
            checkpoint,
            epoch,
            root,
            leaf_count,
        );
        self.send(ix, &[authority])?;
        Ok(())
    }

    pub fn append_receipt_to_checkpoint(
        &mut self,
        identity: &IdentityFixture,
        checkpoint: Pubkey,
        receipt: Pubkey,
    ) -> TestResult {
        let ix = self.ix_append_receipt_to_checkpoint(identity, checkpoint, receipt);
        self.send_as_payer(ix)?;
        Ok(())
    }

    pub fn rotate_checkpoint(
        &mut self,
        identity: &IdentityFixture,
        previous_checkpoint: Pubkey,
        epoch: u64,
    ) -> TestResult<Pubkey> {
        let checkpoint = checkpoint_pda(identity.address, epoch);
        let ix = self.ix_rotate_checkpoint(identity, previous_checkpoint, epoch);
        self.send_as_payer(ix)?;
        Ok(checkpoint)
    }

    pub fn verify_receipt_inclusion(
        &mut self,
        identity: &IdentityFixture,
        checkpoint: Pubkey,
        leaf: [u8; 32],
        leaf_index: u64,
        siblings: Vec<[u8; 32]>,
    ) -> TestResult {
        let ix = self.ix_verify_receipt_inclusion(identity, checkpoint, leaf, leaf_index, siblings);
        self.send_as_payer(ix)?;
        Ok(())
    }

    pub fn checkpoint_root(&self, checkpoint: Pubkey) -> [u8; 32] {
        let account: proof_verifier::state::HistoryCheckpoint = self.account(checkpoint);
        account.root
    }

    pub fn create_reputation_domain(
        &mut self,
        identity: &IdentityFixture,
        domain: [u8; 32],
    ) -> TestResult<Pubkey> {
        let reputation = reputation_pda(identity.address, domain);
        let ix = self.ix_create_reputation_domain(identity, domain);
        self.send_as_payer(ix)?;
        Ok(reputation)
    }

    pub fn apply_reputation_receipt(
        &mut self,
        identity: &IdentityFixture,
        receipt: Pubkey,
        reputation: Pubkey,
    ) -> TestResult {
        let ix = self.ix_apply_reputation_receipt(identity, receipt, reputation);
        self.send_as_payer(ix)?;
        Ok(())
    }

    pub fn apply_reputation_receipt_as_reviewer(
        &mut self,
        identity: &IdentityFixture,
        receipt: Pubkey,
        reputation: Pubkey,
    ) -> TestResult {
        let ix = self.ix_apply_reputation_receipt_with_authority(
            identity,
            receipt,
            reputation,
            self.reviewer.pubkey(),
        );
        self.send_as_reviewer(ix)?;
        Ok(())
    }

    pub fn sync_task_status(
        &mut self,
        identity: &IdentityFixture,
        task: Pubkey,
        receipt: Pubkey,
    ) -> TestResult {
        let ix = self.ix_sync_task_status(identity, task, receipt);
        self.send_as_payer(ix)?;
        Ok(())
    }

    pub fn register_domain(&mut self, domain: [u8; 32]) -> TestResult {
        let ix = self.ix_register_domain(domain);
        self.send_as_payer(ix)?;
        Ok(())
    }

    pub fn deprecate_domain(&mut self, domain: [u8; 32]) -> TestResult {
        let ix = self.ix_deprecate_domain(domain);
        self.send_as_payer(ix)?;
        Ok(())
    }

    pub fn register_attester(
        &mut self,
        identity: &IdentityFixture,
        category: String,
        self_declared_tier: u8,
    ) -> TestResult<Pubkey> {
        let attester = attester_record_pda(identity.address);
        let authority = if identity.address == identity_pda(self.reviewer.pubkey(), identity.agent_id)
        {
            self.reviewer.clone()
        } else {
            self.payer.clone()
        };
        let ix = self.ix_register_attester(
            identity.address,
            authority.pubkey(),
            category,
            self_declared_tier,
        );
        self.send(ix, &[authority.as_ref()])?;
        Ok(attester)
    }

    pub fn set_attester_tier(&mut self, attester: Pubkey, effective_tier: u8) -> TestResult {
        let ix = self.ix_set_attester_tier(attester, effective_tier);
        self.send_as_payer(ix)?;
        Ok(())
    }

    pub fn append_runtime_attestation(
        &mut self,
        identity: &IdentityFixture,
        runtime_commit: [u8; 32],
        runtime_authority: Pubkey,
    ) -> TestResult<Pubkey> {
        let runtime_attestation = runtime_attestation_pda(identity.address, runtime_commit);
        let authority = if identity.address == identity_pda(self.reviewer.pubkey(), identity.agent_id)
        {
            self.reviewer.clone()
        } else {
            self.payer.clone()
        };
        let ix = self.ix_append_runtime_attestation(
            identity.address,
            authority.pubkey(),
            runtime_commit,
            runtime_authority,
        );
        self.send(ix, &[authority.as_ref()])?;
        Ok(runtime_attestation)
    }

    pub fn write_domain_stats_snapshot(
        &mut self,
        operator: &Keypair,
        domain: [u8; 32],
        receipt_count: u64,
        task_count: u64,
        agent_count: u64,
        snapshot_slot: u64,
        payload_hash: [u8; 32],
    ) -> TestResult<Pubkey> {
        let domain_stats_snapshot =
            domain_stats_snapshot_pda(domain, operator.pubkey(), snapshot_slot);
        let ix = self.ix_write_domain_stats_snapshot(
            operator.pubkey(),
            domain,
            receipt_count,
            task_count,
            agent_count,
            snapshot_slot,
            payload_hash,
        );
        self.send(ix, &[operator])?;
        Ok(domain_stats_snapshot)
    }

    pub fn initialize_stake(
        &mut self,
        identity: &IdentityFixture,
        slash_authority: Pubkey,
        trust_mode: u8,
    ) -> TestResult<Pubkey> {
        let stake = stake_pda(identity.address);
        let ix = self.ix_initialize_stake(identity.address, stake, slash_authority, trust_mode);
        self.send_as_payer(ix)?;
        Ok(stake)
    }

    pub fn register_adjudicator(
        &mut self,
        governance: &Keypair,
        adjudicator: Pubkey,
    ) -> TestResult<Pubkey> {
        let ix = self.ix_register_adjudicator(governance.pubkey(), adjudicator);
        self.send(ix, &[governance])?;
        Ok(self.treasury_vault)
    }

    pub fn stake(&mut self, stake: Pubkey, amount: u64) -> TestResult {
        let ix = self.ix_stake(stake, amount);
        self.send_as_payer(ix)?;
        Ok(())
    }

    pub fn request_unstake(&mut self, stake: Pubkey, amount: u64) -> TestResult {
        let ix = self.ix_request_unstake(stake, amount);
        self.send_as_payer(ix)?;
        Ok(())
    }

    pub fn finalize_unstake(&mut self, stake: Pubkey) -> TestResult {
        let ix = self.ix_finalize_unstake(stake);
        self.send_as_payer(ix)?;
        Ok(())
    }

    pub fn slash_with_authority(
        &mut self,
        slash_authority: &Keypair,
        stake: Pubkey,
        dispute_receipt: Pubkey,
        slash_marker: Pubkey,
        treasury_vault: Pubkey,
        amount: u64,
    ) -> TestResult {
        self.send(
            self.ix_slash_with_authority(
                stake,
                dispute_receipt,
                slash_marker,
                treasury_vault,
                slash_authority.pubkey(),
                amount,
            ),
            &[slash_authority],
        )?;
        Ok(())
    }

    pub fn slash(
        &mut self,
        slash_authority: &Keypair,
        stake: Pubkey,
        dispute_receipt: Pubkey,
        slash_marker: Pubkey,
        treasury_vault: Pubkey,
        amount: u64,
    ) -> TestResult {
        self.slash_with_authority(
            slash_authority,
            stake,
            dispute_receipt,
            slash_marker,
            treasury_vault,
            amount,
        )
    }

    pub fn record_verdict(
        &mut self,
        adjudicator: &Keypair,
        dispute_receipt: Pubkey,
        verdict: Pubkey,
        outcome: u8,
        slash_amount: u64,
    ) -> TestResult {
        self.record_verdict_with_class(
            adjudicator,
            dispute_receipt,
            verdict,
            outcome,
            slash_amount,
            VERDICT_CLASS_SAFETY,
            0,
        )
    }

    pub fn record_verdict_with_class(
        &mut self,
        adjudicator: &Keypair,
        dispute_receipt: Pubkey,
        verdict: Pubkey,
        outcome: u8,
        slash_amount: u64,
        class: u8,
        stale_after_slot: u64,
    ) -> TestResult {
        let ix = self.ix_record_verdict_with_class(
            adjudicator.pubkey(),
            dispute_receipt,
            verdict,
            outcome,
            slash_amount,
            class,
            stale_after_slot,
        );
        self.send(ix, &[adjudicator])?;
        Ok(())
    }

    pub fn slash_with_verdict(
        &mut self,
        adjudicator: &Keypair,
        stake: Pubkey,
        dispute_receipt: Pubkey,
        verdict: Pubkey,
        slash_marker: Pubkey,
        treasury_vault: Pubkey,
    ) -> TestResult {
        let ix = self.ix_slash_with_verdict(
            stake,
            dispute_receipt,
            verdict,
            slash_marker,
            treasury_vault,
            adjudicator.pubkey(),
        );
        self.send(ix, &[adjudicator])?;
        Ok(())
    }

    pub fn ix_emit_receipt(
        &self,
        identity: &IdentityFixture,
        task: Pubkey,
        receipt: Pubkey,
        receipt_id: [u8; 32],
        kind: u8,
        sequence: u64,
        domain: [u8; 32],
        previous_receipt: [u8; 32],
    ) -> anchor_lang::solana_program::instruction::Instruction {
        instruction(
            receipt_emitter::ID,
            receipt_emitter::instruction::EmitReceipt {
                receipt_id,
                kind,
                sequence,
                domain,
                previous_receipt,
                payload_hash: bytes32(204),
            }
            .data(),
            receipt_emitter::accounts::EmitReceipt {
                authority: self.payer.pubkey(),
                identity: identity.address,
                task,
                receipt,
                domain_catalog: self.domain_catalog,
                cpi_authority: self.cpi_authority,
                task_registry_program: task_registry::ID,
                system_program: system_program::ID,
            },
        )
    }

    pub fn ix_emit_delegated_receipt(
        &self,
        identity: &IdentityFixture,
        task: Pubkey,
        delegation: Pubkey,
        delegate: Pubkey,
        receipt: Pubkey,
        receipt_id: [u8; 32],
        kind: u8,
        sequence: u64,
        domain: [u8; 32],
        previous_receipt: [u8; 32],
    ) -> anchor_lang::solana_program::instruction::Instruction {
        instruction(
            receipt_emitter::ID,
            receipt_emitter::instruction::EmitDelegatedReceipt {
                receipt_id,
                kind,
                sequence,
                domain,
                previous_receipt,
                payload_hash: bytes32(205),
            }
            .data(),
            receipt_emitter::accounts::EmitDelegatedReceipt {
                delegate,
                identity: identity.address,
                delegation,
                task,
                receipt,
                domain_catalog: self.domain_catalog,
                cpi_authority: self.cpi_authority,
                task_registry_program: task_registry::ID,
                system_program: system_program::ID,
            },
        )
    }

    pub fn ix_emit_handoff_grant(
        &self,
        identity: &IdentityFixture,
        task: Pubkey,
        delegate: Pubkey,
        receipt: Pubkey,
        delegation: Pubkey,
        receipt_id: [u8; 32],
        sequence: u64,
        domain: [u8; 32],
        previous_receipt: [u8; 32],
        allowed_actions: u8,
        expires_at_slot: u64,
    ) -> anchor_lang::solana_program::instruction::Instruction {
        instruction(
            receipt_emitter::ID,
            receipt_emitter::instruction::EmitHandoffGrant {
                receipt_id,
                sequence,
                domain,
                previous_receipt,
                payload_hash: bytes32(208),
                allowed_actions,
                expires_at_slot,
            }
            .data(),
            receipt_emitter::accounts::EmitHandoffGrant {
                authority: self.payer.pubkey(),
                identity: identity.address,
                delegate,
                task,
                receipt,
                delegation,
                domain_catalog: self.domain_catalog,
                cpi_authority: self.cpi_authority,
                task_registry_program: task_registry::ID,
                delegation_engine_program: delegation_engine::ID,
                system_program: system_program::ID,
            },
        )
    }

    pub fn ix_emit_audit_receipt(
        &self,
        auditor: &IdentityFixture,
        target_identity: Pubkey,
        target_receipt: Pubkey,
        audit_receipt: Pubkey,
        kind: u8,
        domain: [u8; 32],
        round: u16,
        deadline_slot: u64,
    ) -> anchor_lang::solana_program::instruction::Instruction {
        let authority = if auditor.address == identity_pda(self.reviewer.pubkey(), auditor.agent_id)
        {
            self.reviewer.pubkey()
        } else {
            self.payer.pubkey()
        };
        instruction(
            receipt_emitter::ID,
            receipt_emitter::instruction::EmitAuditReceipt {
                kind,
                domain,
                payload_hash: bytes32(206),
                sequence: 0,
                round,
                deadline_slot,
            }
            .data(),
            receipt_emitter::accounts::EmitAuditReceipt {
                authority,
                auditor_identity: auditor.address,
                identity_bond: identity_bond_pda(auditor.address),
                target_identity,
                target_receipt,
                audit_receipt,
                domain_catalog: self.domain_catalog,
                cpi_authority: self.cpi_authority,
                identity_registry_program: identity_registry::ID,
                system_program: system_program::ID,
            },
        )
    }

    pub fn ix_emit_challenge_response(
        &self,
        identity: &IdentityFixture,
        challenge: Pubkey,
        challenge_response: Pubkey,
    ) -> anchor_lang::solana_program::instruction::Instruction {
        instruction(
            receipt_emitter::ID,
            receipt_emitter::instruction::EmitChallengeResponse {
                payload_hash: bytes32(207),
            }
            .data(),
            receipt_emitter::accounts::EmitChallengeResponse {
                authority: self.payer.pubkey(),
                identity: identity.address,
                target_identity: challenge_identity(challenge, &self.svm),
                challenge,
                challenge_response,
                cpi_authority: self.cpi_authority,
                identity_registry_program: identity_registry::ID,
                system_program: system_program::ID,
            },
        )
    }

    pub fn ix_finalize_unanswered_challenge(
        &self,
        challenge: Pubkey,
        target_receipt: Pubkey,
        audit_receipt: Pubkey,
    ) -> anchor_lang::solana_program::instruction::Instruction {
        instruction(
            receipt_emitter::ID,
            receipt_emitter::instruction::FinalizeUnansweredChallenge {}.data(),
            receipt_emitter::accounts::FinalizeUnansweredChallenge {
                authority: self.payer.pubkey(),
                target_identity: challenge_identity(challenge, &self.svm),
                challenge,
                target_receipt,
                challenge_response: challenge_response_pda(challenge),
                audit_receipt,
                cpi_authority: self.cpi_authority,
                identity_registry_program: identity_registry::ID,
                system_program: system_program::ID,
            },
        )
    }

    pub fn ix_rotate_checkpoint(
        &self,
        identity: &IdentityFixture,
        previous_checkpoint: Pubkey,
        new_epoch: u64,
    ) -> anchor_lang::solana_program::instruction::Instruction {
        instruction(
            proof_verifier::ID,
            proof_verifier::instruction::RotateCheckpoint { new_epoch }.data(),
            proof_verifier::accounts::RotateCheckpoint {
                identity: identity.address,
                authority: self.payer.pubkey(),
                previous_checkpoint,
                checkpoint: checkpoint_pda(identity.address, new_epoch),
                latest_checkpoint: latest_checkpoint_pda(identity.address),
                history_updater: self.history_updater,
                identity_registry_program: identity_registry::ID,
                system_program: system_program::ID,
            },
        )
    }

    pub fn ix_append_receipt_to_checkpoint(
        &self,
        identity: &IdentityFixture,
        checkpoint: Pubkey,
        receipt: Pubkey,
    ) -> anchor_lang::solana_program::instruction::Instruction {
        instruction(
            proof_verifier::ID,
            proof_verifier::instruction::AppendReceiptToCheckpoint {}.data(),
            proof_verifier::accounts::AppendReceiptToCheckpoint {
                identity: identity.address,
                checkpoint,
                latest_checkpoint: latest_checkpoint_pda(identity.address),
                receipt,
                history_updater: self.history_updater,
                identity_registry_program: identity_registry::ID,
            },
        )
    }

    pub fn ix_verify_receipt_inclusion(
        &self,
        identity: &IdentityFixture,
        checkpoint: Pubkey,
        leaf: [u8; 32],
        leaf_index: u64,
        siblings: Vec<[u8; 32]>,
    ) -> anchor_lang::solana_program::instruction::Instruction {
        instruction(
            proof_verifier::ID,
            proof_verifier::instruction::VerifyReceiptInclusion {
                leaf,
                leaf_index,
                siblings,
            }
            .data(),
            proof_verifier::accounts::VerifyReceiptInclusion {
                checkpoint,
                latest_checkpoint: latest_checkpoint_pda(identity.address),
            },
        )
    }

    pub fn ix_create_reputation_domain(
        &self,
        identity: &IdentityFixture,
        domain: [u8; 32],
    ) -> anchor_lang::solana_program::instruction::Instruction {
        instruction(
            reputation_accumulator::ID,
            reputation_accumulator::instruction::CreateReputationDomain {
                domain,
                completion_weight: COMPLETION_WEIGHT,
                dispute_weight: DISPUTE_WEIGHT,
                dispute_resolved_weight: DISPUTE_RESOLVED_WEIGHT,
            }
            .data(),
            reputation_accumulator::accounts::CreateReputationDomain {
                identity: identity.address,
                authority: self.payer.pubkey(),
                reputation: reputation_pda(identity.address, domain),
                domain_catalog: self.domain_catalog,
                system_program: system_program::ID,
            },
        )
    }

    pub fn ix_apply_reputation_receipt(
        &self,
        identity: &IdentityFixture,
        receipt: Pubkey,
        reputation: Pubkey,
    ) -> anchor_lang::solana_program::instruction::Instruction {
        self.ix_apply_reputation_receipt_with_authority(
            identity,
            receipt,
            reputation,
            self.payer.pubkey(),
        )
    }

    pub fn ix_apply_reputation_receipt_with_authority(
        &self,
        identity: &IdentityFixture,
        receipt: Pubkey,
        reputation: Pubkey,
        authority: Pubkey,
    ) -> anchor_lang::solana_program::instruction::Instruction {
        instruction(
            reputation_accumulator::ID,
            reputation_accumulator::instruction::ApplyReputationReceipt {}.data(),
            reputation_accumulator::accounts::ApplyReputationReceipt {
                identity: identity.address,
                authority,
                receipt,
                reputation,
                receipt_application: reputation_receipt_application_pda(reputation, receipt),
                system_program: system_program::ID,
            },
        )
    }

    pub fn ix_apply_reputation_receipt_with_authority_and_verdict(
        &self,
        identity: &IdentityFixture,
        receipt: Pubkey,
        reputation: Pubkey,
        authority: Pubkey,
        verdict: Option<Pubkey>,
    ) -> anchor_lang::solana_program::instruction::Instruction {
        let mut instruction = self
            .ix_apply_reputation_receipt_with_authority(identity, receipt, reputation, authority);

        if let Some(verdict) = verdict {
            instruction
                .accounts
                .push(AccountMeta::new_readonly(verdict, false));
        }

        instruction
    }

    pub fn ix_sync_task_status(
        &self,
        identity: &IdentityFixture,
        task: Pubkey,
        receipt: Pubkey,
    ) -> anchor_lang::solana_program::instruction::Instruction {
        instruction(
            task_registry::ID,
            task_registry::instruction::SyncTaskStatus {}.data(),
            task_registry::accounts::SyncTaskStatus {
                authority: self.payer.pubkey(),
                identity: identity.address,
                task,
                receipt,
                receipt_application: task_receipt_application_pda(task, receipt),
                identity_registry_program: identity_registry::ID,
                system_program: system_program::ID,
            },
        )
    }

    pub fn ix_stake(
        &self,
        stake: Pubkey,
        amount: u64,
    ) -> anchor_lang::solana_program::instruction::Instruction {
        instruction(
            agent_stake::ID,
            agent_stake::instruction::Stake { amount }.data(),
            agent_stake::accounts::Stake {
                owner: self.payer.pubkey(),
                identity: stake_identity(stake, &self.svm),
                stake,
                identity_registry_program: identity_registry::ID,
                system_program: system_program::ID,
            },
        )
    }

    pub fn ix_finalize_unstake(
        &self,
        stake: Pubkey,
    ) -> anchor_lang::solana_program::instruction::Instruction {
        instruction(
            agent_stake::ID,
            agent_stake::instruction::FinalizeUnstake {}.data(),
            agent_stake::accounts::FinalizeUnstake {
                owner: self.payer.pubkey(),
                identity: stake_identity(stake, &self.svm),
                stake,
                identity_registry_program: identity_registry::ID,
            },
        )
    }

    pub fn ix_deposit_identity_bond(
        &self,
        identity: Pubkey,
        authority: Pubkey,
    ) -> anchor_lang::solana_program::instruction::Instruction {
        instruction(
            identity_registry::ID,
            identity_registry::instruction::DepositIdentityBond {}.data(),
            identity_registry::accounts::DepositIdentityBond {
                authority,
                identity,
                identity_bond: identity_bond_pda(identity),
                system_program: system_program::ID,
            },
        )
    }

    pub fn ix_withdraw_identity_bond(
        &self,
        identity: Pubkey,
        authority: Pubkey,
    ) -> anchor_lang::solana_program::instruction::Instruction {
        instruction(
            identity_registry::ID,
            identity_registry::instruction::WithdrawIdentityBond {}.data(),
            identity_registry::accounts::WithdrawIdentityBond {
                authority,
                identity,
                identity_bond: identity_bond_pda(identity),
            },
        )
    }

    pub fn ix_slash_with_authority(
        &self,
        stake: Pubkey,
        dispute_receipt: Pubkey,
        slash_marker: Pubkey,
        treasury_vault: Pubkey,
        slash_authority: Pubkey,
        amount: u64,
    ) -> anchor_lang::solana_program::instruction::Instruction {
        instruction(
            agent_stake::ID,
            agent_stake::instruction::SlashWithAuthority { amount }.data(),
            agent_stake::accounts::SlashWithAuthority {
                slash_authority,
                stake,
                dispute_receipt,
                slash_marker,
                treasury_vault,
                system_program: system_program::ID,
            },
        )
    }

    pub fn ix_slash(
        &self,
        stake: Pubkey,
        dispute_receipt: Pubkey,
        slash_marker: Pubkey,
        treasury_vault: Pubkey,
        slash_authority: Pubkey,
        amount: u64,
    ) -> anchor_lang::solana_program::instruction::Instruction {
        self.ix_slash_with_authority(
            stake,
            dispute_receipt,
            slash_marker,
            treasury_vault,
            slash_authority,
            amount,
        )
    }

    pub fn ix_slash_with_verdict(
        &self,
        stake: Pubkey,
        dispute_receipt: Pubkey,
        verdict: Pubkey,
        slash_marker: Pubkey,
        treasury_vault: Pubkey,
        adjudicator: Pubkey,
    ) -> anchor_lang::solana_program::instruction::Instruction {
        instruction(
            agent_stake::ID,
            agent_stake::instruction::SlashWithVerdict {}.data(),
            agent_stake::accounts::SlashWithVerdict {
                adjudicator,
                stake,
                dispute_receipt,
                verdict,
                treasury_vault,
                slash_marker,
                system_program: system_program::ID,
            },
        )
    }

    fn ix_initialize_cpi_authority(&self) -> anchor_lang::solana_program::instruction::Instruction {
        instruction(
            receipt_emitter::ID,
            receipt_emitter::instruction::InitializeCpiAuthority {}.data(),
            receipt_emitter::accounts::InitializeCpiAuthority {
                payer: self.payer.pubkey(),
                cpi_authority: self.cpi_authority,
                system_program: system_program::ID,
            },
        )
    }

    fn ix_initialize_history_updater(
        &self,
    ) -> anchor_lang::solana_program::instruction::Instruction {
        instruction(
            proof_verifier::ID,
            proof_verifier::instruction::InitializeHistoryUpdater {}.data(),
            proof_verifier::accounts::InitializeHistoryUpdater {
                payer: self.payer.pubkey(),
                history_updater: self.history_updater,
                system_program: system_program::ID,
            },
        )
    }

    fn ix_register_adjudicator(
        &self,
        governance: Pubkey,
        adjudicator: Pubkey,
    ) -> anchor_lang::solana_program::instruction::Instruction {
        instruction(
            dispute_resolver::ID,
            dispute_resolver::instruction::RegisterAdjudicator { adjudicator }.data(),
            dispute_resolver::accounts::RegisterAdjudicator {
                governance,
                adjudicator_config: adjudicator_config_pda(),
                treasury_vault: self.treasury_vault,
                system_program: system_program::ID,
            },
        )
    }

    pub fn ix_record_verdict(
        &self,
        adjudicator: Pubkey,
        dispute_receipt: Pubkey,
        verdict: Pubkey,
        outcome: u8,
        slash_amount: u64,
    ) -> anchor_lang::solana_program::instruction::Instruction {
        self.ix_record_verdict_with_class(
            adjudicator,
            dispute_receipt,
            verdict,
            outcome,
            slash_amount,
            VERDICT_CLASS_SAFETY,
            0,
        )
    }

    pub fn ix_record_verdict_with_class(
        &self,
        adjudicator: Pubkey,
        dispute_receipt: Pubkey,
        verdict: Pubkey,
        outcome: u8,
        slash_amount: u64,
        class: u8,
        stale_after_slot: u64,
    ) -> anchor_lang::solana_program::instruction::Instruction {
        instruction(
            dispute_resolver::ID,
            dispute_resolver::instruction::RecordVerdict {
                outcome,
                slash_amount,
                class,
                stale_after_slot,
            }
            .data(),
            dispute_resolver::accounts::RecordVerdict {
                adjudicator,
                adjudicator_config: adjudicator_config_pda(),
                dispute_receipt,
                verdict,
                system_program: system_program::ID,
            },
        )
    }

    fn ix_initialize_checkpoint_importer(
        &self,
        authority: Pubkey,
    ) -> anchor_lang::solana_program::instruction::Instruction {
        instruction(
            proof_verifier::ID,
            proof_verifier::instruction::InitializeCheckpointImporter { authority }.data(),
            proof_verifier::accounts::InitializeCheckpointImporter {
                payer: self.payer.pubkey(),
                checkpoint_importer: checkpoint_importer_pda(),
                system_program: system_program::ID,
            },
        )
    }

    fn ix_initialize_domain_catalog(
        &self,
    ) -> anchor_lang::solana_program::instruction::Instruction {
        instruction(
            reputation_accumulator::ID,
            reputation_accumulator::instruction::InitializeDomainCatalog {}.data(),
            reputation_accumulator::accounts::InitializeDomainCatalog {
                curator: self.payer.pubkey(),
                domain_catalog: self.domain_catalog,
                system_program: system_program::ID,
            },
        )
    }

    fn ix_initialize_attester_registry(
        &self,
    ) -> anchor_lang::solana_program::instruction::Instruction {
        instruction(
            attester_registry::ID,
            attester_registry::instruction::InitializeRegistry {}.data(),
            attester_registry::accounts::InitializeRegistry {
                curator: self.payer.pubkey(),
                config: self.attester_registry_config,
                system_program: system_program::ID,
            },
        )
    }

    fn ix_register_domain(
        &self,
        domain: [u8; 32],
    ) -> anchor_lang::solana_program::instruction::Instruction {
        instruction(
            reputation_accumulator::ID,
            reputation_accumulator::instruction::RegisterDomain { domain }.data(),
            reputation_accumulator::accounts::RegisterDomain {
                curator: self.payer.pubkey(),
                domain_catalog: self.domain_catalog,
            },
        )
    }

    fn ix_register_attester(
        &self,
        identity: Pubkey,
        authority: Pubkey,
        category: String,
        self_declared_tier: u8,
    ) -> anchor_lang::solana_program::instruction::Instruction {
        instruction(
            attester_registry::ID,
            attester_registry::instruction::RegisterAttester {
                category,
                self_declared_tier,
            }
            .data(),
            attester_registry::accounts::RegisterAttester {
                authority,
                identity,
                identity_bond: identity_bond_pda(identity),
                config: self.attester_registry_config,
                attester: attester_record_pda(identity),
                system_program: system_program::ID,
            },
        )
    }

    fn ix_set_attester_tier(
        &self,
        attester: Pubkey,
        effective_tier: u8,
    ) -> anchor_lang::solana_program::instruction::Instruction {
        instruction(
            attester_registry::ID,
            attester_registry::instruction::SetAttesterTier { effective_tier }.data(),
            attester_registry::accounts::SetAttesterTier {
                curator: self.payer.pubkey(),
                config: self.attester_registry_config,
                attester,
            },
        )
    }

    fn ix_deprecate_domain(
        &self,
        domain: [u8; 32],
    ) -> anchor_lang::solana_program::instruction::Instruction {
        instruction(
            reputation_accumulator::ID,
            reputation_accumulator::instruction::DeprecateDomain { domain }.data(),
            reputation_accumulator::accounts::DeprecateDomain {
                curator: self.payer.pubkey(),
                domain_catalog: self.domain_catalog,
            },
        )
    }

    pub fn ix_write_domain_stats_snapshot(
        &self,
        operator: Pubkey,
        domain: [u8; 32],
        receipt_count: u64,
        task_count: u64,
        agent_count: u64,
        snapshot_slot: u64,
        payload_hash: [u8; 32],
    ) -> anchor_lang::solana_program::instruction::Instruction {
        instruction(
            reputation_accumulator::ID,
            reputation_accumulator::instruction::WriteDomainStatsSnapshot {
                domain,
                receipt_count,
                task_count,
                agent_count,
                snapshot_slot,
                payload_hash,
            }
            .data(),
            reputation_accumulator::accounts::WriteDomainStatsSnapshot {
                operator,
                domain_catalog: self.domain_catalog,
                domain_stats_snapshot: domain_stats_snapshot_pda(domain, operator, snapshot_slot),
                system_program: system_program::ID,
            },
        )
    }

    fn ix_create_identity(
        &self,
        authority: Pubkey,
        identity: Pubkey,
        agent_id: [u8; 32],
    ) -> anchor_lang::solana_program::instruction::Instruction {
        instruction(
            identity_registry::ID,
            identity_registry::instruction::CreateIdentity {
                agent_id,
                policy_root: bytes32(201),
                history_root: bytes32(202),
            }
            .data(),
            identity_registry::accounts::CreateIdentity {
                identity,
                authority,
                system_program: system_program::ID,
            },
        )
    }

    pub fn ix_rotate_authority(
        &self,
        identity: Pubkey,
        pending_rotation: Pubkey,
        new_authority: Pubkey,
        unlock_slot: u64,
    ) -> anchor_lang::solana_program::instruction::Instruction {
        instruction(
            identity_registry::ID,
            identity_registry::instruction::RotateAuthority {
                new_authority,
                unlock_slot,
            }
            .data(),
            identity_registry::accounts::RotateAuthority {
                authority: self.payer.pubkey(),
                identity,
                pending_rotation,
                system_program: system_program::ID,
            },
        )
    }

    pub fn ix_finalize_authority_rotation(
        &self,
        identity: Pubkey,
        pending_rotation: Pubkey,
        caller: Pubkey,
    ) -> anchor_lang::solana_program::instruction::Instruction {
        instruction(
            identity_registry::ID,
            identity_registry::instruction::FinalizeAuthorityRotation {}.data(),
            identity_registry::accounts::FinalizeAuthorityRotation {
                caller,
                identity,
                pending_rotation,
            },
        )
    }

    pub fn ix_initialize_guardian_set(
        &self,
        identity: Pubkey,
        guardian_set: Pubkey,
        guardians: &[Pubkey],
        threshold: u8,
    ) -> anchor_lang::solana_program::instruction::Instruction {
        instruction(
            identity_registry::ID,
            identity_registry::instruction::InitializeGuardianSet {
                guardians: guardians.to_vec(),
                threshold,
            }
            .data(),
            identity_registry::accounts::InitializeGuardianSet {
                authority: self.payer.pubkey(),
                identity,
                guardian_set,
                system_program: system_program::ID,
            },
        )
    }

    pub fn ix_emergency_rotate_authority(
        &self,
        identity: Pubkey,
        guardian_set: Option<Pubkey>,
        new_authority: Pubkey,
        refund_recipient: Pubkey,
        pending_rotation: Option<Pubkey>,
        guardian_signers: &[Pubkey],
    ) -> anchor_lang::solana_program::instruction::Instruction {
        let guardian_signers = guardian_signers
            .iter()
            .map(|guardian| AccountMeta {
                pubkey: *guardian,
                is_signer: true,
                is_writable: false,
            })
            .collect();
        instruction_with_remaining_accounts(
            identity_registry::ID,
            identity_registry::instruction::EmergencyRotateAuthority { new_authority }.data(),
            identity_registry::accounts::EmergencyRotateAuthority {
                identity,
                guardian_set,
                refund_recipient,
                pending_rotation,
            },
            guardian_signers,
        )
    }

    pub fn ix_update_policy_root(
        &self,
        identity: Pubkey,
        authority: Pubkey,
        new_root: [u8; 32],
    ) -> anchor_lang::solana_program::instruction::Instruction {
        instruction(
            identity_registry::ID,
            identity_registry::instruction::UpdatePolicyRoot { new_root }.data(),
            identity_registry::accounts::UpdatePolicyRoot {
                identity,
                authority,
            },
        )
    }

    fn ix_append_runtime_attestation(
        &self,
        identity: Pubkey,
        authority: Pubkey,
        runtime_commit: [u8; 32],
        runtime_authority: Pubkey,
    ) -> anchor_lang::solana_program::instruction::Instruction {
        instruction(
            identity_registry::ID,
            identity_registry::instruction::AppendRuntimeAttestation {
                runtime_commit,
                runtime_authority,
            }
            .data(),
            identity_registry::accounts::AppendRuntimeAttestation {
                authority,
                identity,
                runtime_attestation: runtime_attestation_pda(identity, runtime_commit),
                system_program: system_program::ID,
            },
        )
    }

    fn ix_create_task(
        &self,
        identity: Pubkey,
        task: Pubkey,
        task_id: [u8; 32],
        domain: [u8; 32],
    ) -> anchor_lang::solana_program::instruction::Instruction {
        instruction(
            task_registry::ID,
            task_registry::instruction::CreateTask {
                task_id,
                subtask_root: bytes32(203),
                subtask_count: SUBTASK_COUNT,
                domain,
            }
            .data(),
            task_registry::accounts::CreateTask {
                authority: self.payer.pubkey(),
                identity,
                task,
                identity_registry_program: identity_registry::ID,
                system_program: system_program::ID,
            },
        )
    }

    fn ix_create_delegation(
        &self,
        identity: Pubkey,
        delegate: Pubkey,
        delegation: Pubkey,
        allowed_actions: u8,
        expires_at_slot: u64,
    ) -> anchor_lang::solana_program::instruction::Instruction {
        instruction(
            delegation_engine::ID,
            delegation_engine::instruction::CreateDelegation {
                allowed_actions,
                expires_at_slot,
            }
            .data(),
            delegation_engine::accounts::CreateDelegation {
                authority: self.payer.pubkey(),
                identity,
                delegate,
                delegation,
                system_program: system_program::ID,
            },
        )
    }

    fn ix_revoke_delegation(
        &self,
        identity: Pubkey,
        delegation: Pubkey,
        revoke_at_slot: u64,
    ) -> anchor_lang::solana_program::instruction::Instruction {
        instruction(
            delegation_engine::ID,
            delegation_engine::instruction::RevokeDelegation { revoke_at_slot }.data(),
            delegation_engine::accounts::RevokeDelegation {
                authority: self.payer.pubkey(),
                identity,
                delegation,
            },
        )
    }

    fn ix_initialize_checkpoint(
        &self,
        identity: &IdentityFixture,
        checkpoint: Pubkey,
        epoch: u64,
    ) -> anchor_lang::solana_program::instruction::Instruction {
        instruction(
            proof_verifier::ID,
            proof_verifier::instruction::InitializeCheckpoint { epoch }.data(),
            proof_verifier::accounts::InitializeCheckpoint {
                identity: identity.address,
                authority: self.payer.pubkey(),
                checkpoint,
                latest_checkpoint: latest_checkpoint_pda(identity.address),
                history_updater: self.history_updater,
                identity_registry_program: identity_registry::ID,
                system_program: system_program::ID,
            },
        )
    }

    pub fn ix_checkpoint_import(
        &self,
        identity: &IdentityFixture,
        checkpoint: Pubkey,
        epoch: u64,
        root: [u8; 32],
        leaf_count: u64,
    ) -> anchor_lang::solana_program::instruction::Instruction {
        self.ix_checkpoint_import_with_authority(
            identity,
            self.payer.pubkey(),
            checkpoint,
            epoch,
            root,
            leaf_count,
        )
    }

    fn ix_checkpoint_import_with_authority(
        &self,
        identity: &IdentityFixture,
        authority: Pubkey,
        checkpoint: Pubkey,
        epoch: u64,
        root: [u8; 32],
        leaf_count: u64,
    ) -> anchor_lang::solana_program::instruction::Instruction {
        instruction(
            proof_verifier::ID,
            proof_verifier::instruction::CheckpointImport {
                epoch,
                root,
                leaf_count,
            }
            .data(),
            proof_verifier::accounts::CheckpointImport {
                identity: identity.address,
                authority,
                checkpoint_importer: checkpoint_importer_pda(),
                checkpoint,
                latest_checkpoint: latest_checkpoint_pda(identity.address),
                history_updater: self.history_updater,
                identity_registry_program: identity_registry::ID,
                system_program: system_program::ID,
            },
        )
    }

    fn ix_initialize_stake(
        &self,
        identity: Pubkey,
        stake: Pubkey,
        slash_authority: Pubkey,
        trust_mode: u8,
    ) -> anchor_lang::solana_program::instruction::Instruction {
        instruction(
            agent_stake::ID,
            agent_stake::instruction::InitializeStake {
                slash_authority,
                trust_mode,
            }
            .data(),
            agent_stake::accounts::InitializeStake {
                owner: self.payer.pubkey(),
                identity,
                stake,
                system_program: system_program::ID,
            },
        )
    }

    fn ix_request_unstake(
        &self,
        stake: Pubkey,
        amount: u64,
    ) -> anchor_lang::solana_program::instruction::Instruction {
        instruction(
            agent_stake::ID,
            agent_stake::instruction::RequestUnstake { amount }.data(),
            agent_stake::accounts::RequestUnstake {
                owner: self.payer.pubkey(),
                stake,
            },
        )
    }
}

fn instruction<A: ToAccountMetas>(
    program_id: Pubkey,
    data: Vec<u8>,
    accounts: A,
) -> anchor_lang::solana_program::instruction::Instruction {
    instruction_with_remaining_accounts(program_id, data, accounts, Vec::new())
}

fn instruction_with_remaining_accounts<A: ToAccountMetas>(
    program_id: Pubkey,
    data: Vec<u8>,
    accounts: A,
    remaining_accounts: Vec<AccountMeta>,
) -> anchor_lang::solana_program::instruction::Instruction {
    let mut account_metas = accounts
        .to_account_metas(None)
        .into_iter()
        .map(|meta| AccountMeta {
            pubkey: meta.pubkey,
            is_signer: meta.is_signer,
            is_writable: meta.is_writable,
        })
        .collect::<Vec<_>>();
    account_metas.extend(remaining_accounts);

    anchor_lang::solana_program::instruction::Instruction {
        program_id,
        accounts: account_metas,
        data,
    }
}

fn load_programs(svm: &mut LiteSVM) -> TestResult {
    add_program(svm, identity_registry::ID, "identity_registry")?;
    add_program(svm, task_registry::ID, "task_registry")?;
    add_program(svm, receipt_emitter::ID, "receipt_emitter")?;
    add_program(svm, delegation_engine::ID, "delegation_engine")?;
    add_program(svm, reputation_accumulator::ID, "reputation_accumulator")?;
    add_program(svm, proof_verifier::ID, "proof_verifier")?;
    add_program(svm, dispute_resolver::ID, "dispute_resolver")?;
    add_program(svm, agent_stake::ID, "agent_stake")?;
    add_program(svm, attester_registry::ID, "attester_registry")?;
    Ok(())
}

fn add_program(svm: &mut LiteSVM, program_id: Pubkey, name: &str) -> TestResult {
    let manifest_dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
    let path = manifest_dir
        .join("../..")
        .join("target")
        .join("deploy")
        .join(format!("{name}.so"));
    svm.add_program_from_file(program_id, path)?;
    Ok(())
}

fn format_failed_transaction(err: FailedTransactionMetadata) -> String {
    format!("{:?}\n{}", err.err, err.meta.pretty_logs())
}

fn pda(seeds: &[&[u8]], program_id: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(seeds, program_id).0
}

fn identity_pda(authority: Pubkey, agent_id: [u8; 32]) -> Pubkey {
    pda(
        &[IDENTITY_SEED, authority.as_ref(), agent_id.as_ref()],
        &identity_registry::ID,
    )
}

pub fn identity_bond_pda(identity: Pubkey) -> Pubkey {
    pda(&[IDENTITY_BOND_SEED, identity.as_ref()], &identity_registry::ID)
}

pub fn runtime_attestation_pda(identity: Pubkey, runtime_commit: [u8; 32]) -> Pubkey {
    pda(
        &[RUNTIME_ATTESTATION_SEED, identity.as_ref(), runtime_commit.as_ref()],
        &identity_registry::ID,
    )
}

pub fn attester_registry_config_pda() -> Pubkey {
    pda(&[ATTESTER_CONFIG_SEED], &attester_registry::ID)
}

pub fn attester_record_pda(identity: Pubkey) -> Pubkey {
    pda(&[ATTESTER_RECORD_SEED, identity.as_ref()], &attester_registry::ID)
}

pub fn task_pda(identity: Pubkey, task_id: [u8; 32]) -> Pubkey {
    pda(
        &[TASK_SEED, identity.as_ref(), task_id.as_ref()],
        &task_registry::ID,
    )
}

pub fn receipt_pda(identity: Pubkey, task: Pubkey, receipt_id: [u8; 32]) -> Pubkey {
    pda(
        &[
            RECEIPT_SEED,
            identity.as_ref(),
            task.as_ref(),
            receipt_id.as_ref(),
        ],
        &receipt_emitter::ID,
    )
}

pub fn audit_receipt_pda(
    auditor_identity: Pubkey,
    target_receipt: Pubkey,
    kind: u8,
    round: u16,
) -> Pubkey {
    pda(
        &[
            AUDIT_RECEIPT_SEED,
            auditor_identity.as_ref(),
            target_receipt.as_ref(),
            kind.to_le_bytes().as_ref(),
            round.to_le_bytes().as_ref(),
        ],
        &receipt_emitter::ID,
    )
}

pub fn pending_rotation_pda(identity: Pubkey) -> Pubkey {
    pda(
        &[PENDING_ROTATION_SEED, identity.as_ref()],
        &identity_registry::ID,
    )
}

pub fn guardian_set_pda(identity: Pubkey) -> Pubkey {
    pda(
        &[GUARDIAN_SET_SEED, identity.as_ref()],
        &identity_registry::ID,
    )
}

pub fn challenge_response_pda(challenge: Pubkey) -> Pubkey {
    pda(
        &[CHALLENGE_RESPONSE_SEED, challenge.as_ref()],
        &receipt_emitter::ID,
    )
}

fn delegation_pda(identity: Pubkey, delegate: Pubkey) -> Pubkey {
    pda(
        &[DELEGATION_SEED, identity.as_ref(), delegate.as_ref()],
        &delegation_engine::ID,
    )
}

fn checkpoint_importer_pda() -> Pubkey {
    pda(&[CHECKPOINT_IMPORTER_SEED], &proof_verifier::ID)
}

fn adjudicator_config_pda() -> Pubkey {
    pda(&[ADJUDICATOR_CONFIG_SEED], &dispute_resolver::ID)
}

pub fn treasury_vault_pda() -> Pubkey {
    pda(&[TREASURY_VAULT_SEED], &dispute_resolver::ID)
}

pub fn verdict_pda(dispute_receipt: Pubkey) -> Pubkey {
    pda(
        &[VERDICT_SEED, dispute_receipt.as_ref()],
        &dispute_resolver::ID,
    )
}

pub fn checkpoint_pda(identity: Pubkey, epoch: u64) -> Pubkey {
    pda(
        &[
            CHECKPOINT_SEED,
            identity.as_ref(),
            epoch.to_le_bytes().as_ref(),
        ],
        &proof_verifier::ID,
    )
}

pub fn latest_checkpoint_pda(identity: Pubkey) -> Pubkey {
    pda(
        &[LATEST_CHECKPOINT_SEED, identity.as_ref()],
        &proof_verifier::ID,
    )
}

pub fn reputation_pda(identity: Pubkey, domain: [u8; 32]) -> Pubkey {
    pda(
        &[REPUTATION_SEED, identity.as_ref(), domain.as_ref()],
        &reputation_accumulator::ID,
    )
}

pub fn domain_stats_snapshot_pda(domain: [u8; 32], operator: Pubkey, snapshot_slot: u64) -> Pubkey {
    pda(
        &[
            DOMAIN_STATS_SEED,
            domain.as_ref(),
            operator.as_ref(),
            &snapshot_slot.to_le_bytes(),
        ],
        &reputation_accumulator::ID,
    )
}

fn task_receipt_application_pda(task: Pubkey, receipt: Pubkey) -> Pubkey {
    pda(
        &[
            TASK_RECEIPT_APPLICATION_SEED,
            task.as_ref(),
            receipt.as_ref(),
        ],
        &task_registry::ID,
    )
}

fn reputation_receipt_application_pda(reputation: Pubkey, receipt: Pubkey) -> Pubkey {
    pda(
        &[
            REPUTATION_RECEIPT_APPLICATION_SEED,
            reputation.as_ref(),
            receipt.as_ref(),
        ],
        &reputation_accumulator::ID,
    )
}

pub fn stake_pda(identity: Pubkey) -> Pubkey {
    pda(&[STAKE_SEED, identity.as_ref()], &agent_stake::ID)
}

fn challenge_identity(challenge: Pubkey, svm: &LiteSVM) -> Pubkey {
    let account = svm
        .get_account(&challenge)
        .unwrap_or_else(|| panic!("missing challenge account {challenge}"));
    let mut data: &[u8] = &account.data;
    let receipt =
        receipt_emitter::state::ReceiptRecord::try_deserialize(&mut data).expect("receipt");
    receipt.identity
}

fn stake_identity(stake: Pubkey, svm: &LiteSVM) -> Pubkey {
    let account = svm
        .get_account(&stake)
        .unwrap_or_else(|| panic!("missing stake account {stake}"));
    let mut data: &[u8] = &account.data;
    let stake_account =
        agent_stake::state::StakeAccount::try_deserialize(&mut data).expect("stake");
    stake_account.identity
}

pub fn slash_marker_pda(stake: Pubkey, dispute_receipt: Pubkey) -> Pubkey {
    pda(
        &[SLASH_MARKER_SEED, stake.as_ref(), dispute_receipt.as_ref()],
        &agent_stake::ID,
    )
}

pub fn bytes32(byte: u8) -> [u8; 32] {
    [byte; 32]
}
