# Trust Substrate Program Interface

## Program Overview

The workspace exposes deployable Anchor programs in `programs/*`:

| Program | Local Program Id |
| --- | --- |
| `identity_registry` | `7eJnW2rVFi7e64YyUXviTeuYDJtEMMgRnQsZbV3r3FDv` |
| `task_registry` | `5CjbVQQgjKeCqCsyxcb4HqPpAVgB8eNXZiZovaChQ7R4` |
| `receipt_emitter` | `FV5Nsn3jHH8xxBP6m1N43NawgswmMkhZo72HGYJaJLHp` |
| `delegation_engine` | `HoRjTc9J44oSqBC4DeHfDTavkR15Le8FY3qyPFy4pg49` |
| `proof_verifier` | `4arfpB8XKheZp41Ee8L9fZkHntw4td7Uy5L34PMzYnNi` |
| `reputation_accumulator` | `8tTBEKBqvk51C21spCmzJFNYpBkcWZSkiW2uVwHnHLdv` |
| `dispute_resolver` | `9cYSvQHM78shtFPnpxSfHwyB26CArahmHuJt7byyUrHa` |
| `agent_stake` | `GQrptAYan3qAvYf3qjr6LSyr3Hs622fygj2MDL2goANQ` |

Shared seeds, constants, errors, and Merkle helpers are defined in `crates/trust_substrate_core`.

## Accounts

### `AgentIdentity`

Program: `identity_registry`

Fields:

- `authority: Pubkey`
- `agent_id: [u8; 32]`
- `policy_root: [u8; 32]`
- `history_root: [u8; 32]`
- `bump: u8`

PDA seed:

- `identity`
- authority pubkey
- `agent_id`

### `TaskRecord`

Program: `task_registry`

Fields:

- `identity: Pubkey`
- `task_id: [u8; 32]`
- `subtask_root: [u8; 32]`
- `subtask_count: u16`
- `status: u8`
- `completed_count: u32`
- `disputed_count: u32`
- `resolved_count: u32`
- `bump: u8`

PDA seed:

- `task`
- identity pubkey
- `task_id`

### `ReceiptRecord`

Program: `receipt_emitter`

Fields:

- `identity: Pubkey`
- `task: Pubkey`
- `receipt_id: [u8; 32]`
- `actor: Pubkey`
- `kind: u8`
- `sequence: u64`
- `domain: [u8; 32]`
- `previous_receipt: [u8; 32]`
- `payload_hash: [u8; 32]`
- `via_delegation: Pubkey`
- `bump: u8`

PDA seed:

- `receipt`
- identity pubkey
- task pubkey
- `receipt_id`

### `DelegationRecord`

Program: `delegation_engine`

Fields:

- `identity: Pubkey`
- `delegate: Pubkey`
- `allowed_actions: u8`
- `expires_at_slot: u64`
- `revoked: bool`
- `bump: u8`

PDA seed:

- `delegation`
- identity pubkey
- delegate pubkey

### `HistoryCheckpoint`

Program: `proof_verifier`

Fields:

- `identity: Pubkey`
- `epoch: u64`
- `imported: bool`
- `root: [u8; 32]`
- `previous_root: [u8; 32]`
- `leaf_count: u64`
- `latest_committed_receipt: Pubkey`
- `latest_task: Pubkey`
- `latest_sequence: u64`
- `frontier: [[u8; 32]; MERKLE_FRONTIER_HEIGHT]`
- `bump: u8`

PDA seed:

- `checkpoint`
- identity pubkey
- epoch as little-endian bytes

### `LatestCheckpoint`

Program: `proof_verifier`

Fields:

- `identity: Pubkey`
- `checkpoint: Pubkey`
- `epoch: u64`
- `root: [u8; 32]`
- `bump: u8`

PDA seed:

- `latest_checkpoint`
- identity pubkey

### `CheckpointImporter`

Program: `proof_verifier`

Fields:

- `authority: Pubkey`
- `bump: u8`

PDA seed:

- `checkpoint_importer`

### `ReputationAccumulator`

Program: `reputation_accumulator`

Fields:

- `identity: Pubkey`
- `domain: [u8; 32]`
- `completed: u64`
- `disputed: u64`
- `resolved: u64`
- `completion_weight: u64`
- `dispute_weight: u64`
- `dispute_resolved_weight: u64`
- `bump: u8`

PDA seed:

- `reputation`
- identity pubkey
- `domain`

### `AppliedTaskReceipt`

Program: `task_registry`

Fields:

- `task: Pubkey`
- `receipt: Pubkey`
- `bump: u8`

PDA seed:

- `task_receipt_application`
- task pubkey
- receipt pubkey

### `AppliedReputationReceipt`

Program: `reputation_accumulator`

Fields:

- `reputation: Pubkey`
- `receipt: Pubkey`
- `bump: u8`

PDA seed:

- `reputation_receipt_application`
- reputation pubkey
- receipt pubkey

### `AdjudicatorConfig`

Program: `dispute_resolver`

Fields:

- `governance: Pubkey`
- `adjudicator: Pubkey`
- `bump: u8`

PDA seed:

- `adjudicator_config`

### `TreasuryVault`

Program: `dispute_resolver`

Fields:

- `bump: u8`

PDA seed:

- `treasury`

### `DisputeVerdict`

Program: `dispute_resolver`

Fields:

- `dispute_receipt: Pubkey`
- `target_identity: Pubkey`
- `outcome: u8`
- `slash_amount: u64`
- `adjudicator: Pubkey`
- `created_at_slot: u64`
- `bump: u8`

PDA seed:

- `verdict`
- dispute receipt pubkey

### `StakeAccount`

Program: `agent_stake`

Fields:

- `identity: Pubkey`
- `owner: Pubkey`
- `slash_authority: Pubkey`
- `trust_mode: u8`
- `amount: u64`
- `pending_unstake_amount: u64`
- `unstake_unlocks_at: u64`
- `slashed_total: u64`
- `bump: u8`

PDA seed:

- `stake`
- identity pubkey

### `SlashMarker`

Program: `agent_stake`

Fields:

- `stake: Pubkey`
- `dispute_receipt: Pubkey`
- `verdict: Pubkey`
- `amount: u64`
- `bump: u8`

PDA seed:

- `slash_marker`
- stake pubkey
- dispute receipt pubkey

## Instructions

### `identity_registry.create_identity`

Signature:

- `create_identity(ctx, agent_id, policy_root, history_root)`

Behavior:

- initializes the identity PDA
- stores authority, agent id, policy root, history root, and bump

### `task_registry.create_task`

Signature:

- `create_task(ctx, task_id, subtask_root, subtask_count)`

Behavior:

- requires the signer to match `identity.authority`
- initializes a task PDA under the identity
- stores pending status and zeroed receipt-derived counters

### `task_registry.sync_task_status`

Signature:

- `sync_task_status(ctx)`

Behavior:

- requires the signer to match `identity.authority`
- requires the receipt identity and task to match the supplied accounts
- initializes a task receipt application marker to reject duplicate application
- updates task status and counters from assignment, handoff, completion, dispute, and dispute-resolved receipts

### `receipt_emitter.emit_receipt`

Signature:

- `emit_receipt(ctx, receipt_id, kind, sequence, domain, previous_receipt, payload_hash)`

Behavior:

- validates `kind`
- requires the signer to match `identity.authority`
- requires the task to belong to the identity
- stores the authority as `actor`
- stores the default pubkey in `via_delegation`
- emits `ReceiptCommitted`

### `receipt_emitter.emit_delegated_receipt`

Signature:

- `emit_delegated_receipt(ctx, receipt_id, kind, sequence, domain, previous_receipt, payload_hash)`

Behavior:

- validates `kind`
- requires the delegate signer to match the delegation PDA
- rejects revoked delegations
- rejects expired delegations when `expires_at_slot` is non-zero
- requires the delegation scope bit to allow the receipt kind
- stores the delegate as `actor`
- stores the delegation account in `via_delegation`
- emits `ReceiptCommitted`

### `delegation_engine.create_delegation`

Signature:

- `create_delegation(ctx, allowed_actions, expires_at_slot)`

Behavior:

- rejects empty action scope
- rejects unsupported action bits
- requires the signer to match `identity.authority`
- stores delegate pubkey, scope bitmap, expiry slot, revocation state, and bump

### `delegation_engine.revoke_delegation`

Signature:

- `revoke_delegation(ctx)`

Behavior:

- requires the signer to match `identity.authority`
- marks the delegation as revoked

### `proof_verifier.initialize_checkpoint`

Signature:

- `initialize_checkpoint(ctx, epoch)`

Behavior:

- requires the signer to match `identity.authority`
- initializes a checkpoint PDA for the identity and epoch
- initializes the latest checkpoint PDA for the identity
- starts with an empty root, zero leaves, and an empty Merkle frontier
- updates the identity history root through the history updater PDA

### `proof_verifier.initialize_checkpoint_importer`

Signature:

- `initialize_checkpoint_importer(ctx, authority)`

Behavior:

- initializes the singleton checkpoint importer PDA
- stores the governance authority allowed to import trusted roots

### `proof_verifier.checkpoint_import`

Signature:

- `checkpoint_import(ctx, epoch, root, leaf_count)`

Behavior:

- requires the signer to match the configured checkpoint importer authority
- initializes a checkpoint PDA with the supplied trusted root and leaf count
- marks the checkpoint as imported so direct receipt appends are rejected
- initializes the latest checkpoint PDA for the identity
- updates the identity history root through the history updater PDA

### `proof_verifier.append_receipt_to_checkpoint`

Signature:

- `append_receipt_to_checkpoint(ctx)`

Behavior:

- requires the receipt identity to match the checkpoint identity
- requires the checkpoint to be the latest checkpoint for the identity
- rejects imported checkpoints
- appends the receipt leaf in canonical task and sequence order
- updates the latest checkpoint root and identity history root

### `proof_verifier.rotate_checkpoint`

Signature:

- `rotate_checkpoint(ctx, new_epoch)`

Behavior:

- requires the signer to match `identity.authority`
- requires the previous checkpoint to belong to the identity
- requires the previous checkpoint to be the latest checkpoint
- requires `new_epoch` to equal the previous epoch plus one
- opens an empty checkpoint and stores the previous checkpoint root
- updates the latest checkpoint pointer

### `proof_verifier.verify_receipt_inclusion`

Signature:

- `verify_receipt_inclusion(ctx, leaf, leaf_index, siblings)`

Behavior:

- rejects leaf indexes outside the checkpoint leaf count
- rejects checkpoints that are no longer the latest checkpoint
- verifies the Merkle inclusion proof against the checkpoint root

### `reputation_accumulator.create_reputation_domain`

Signature:

- `create_reputation_domain(ctx, domain, completion_weight, dispute_weight, dispute_resolved_weight)`

Behavior:

- requires the signer to match `identity.authority`
- initializes domain counters to zero
- uses default weights when a provided weight is zero

### `reputation_accumulator.apply_reputation_receipt`

Signature:

- `apply_reputation_receipt(ctx)`

Behavior:

- requires the signer to match `identity.authority`
- requires the receipt to belong to the identity
- requires the reputation account to belong to the identity
- requires the reputation domain to match the receipt domain
- initializes a reputation receipt application marker to reject duplicate application
- applies completion, dispute, and dispute-resolution receipt effects
- rejects receipt kinds that do not affect reputation

### `agent_stake.initialize_stake`

Signature:

- `initialize_stake(ctx, slash_authority)`

Behavior:

- requires the signer to match `identity.authority`
- initializes the identity-scoped stake PDA
- stores the stake owner, configured slash authority, and defaults the trust mode to authority-controlled slashing

### `agent_stake.initialize_stake_with_trust_mode`

Signature:

- `initialize_stake_with_trust_mode(ctx, slash_authority, trust_mode)`

Behavior:

- requires the signer to match `identity.authority`
- initializes the identity-scoped stake PDA
- stores the stake owner, configured slash authority, and selected trust mode

Supported trust modes are defined in `crates/trust_substrate_core/src/constants.rs`:

- `TRUST_MODE_VERDICT = 0`
- `TRUST_MODE_AUTHORITY = 1`

### `agent_stake.stake`

Signature:

- `stake(ctx, amount)`

Behavior:

- rejects zero amounts
- requires the signer to match the stake owner
- constrains the stake PDA by identity and bump
- transfers lamports into escrow and increments available stake

### `agent_stake.request_unstake`

Signature:

- `request_unstake(ctx, amount)`

Behavior:

- rejects zero amounts
- requires the signer to match the stake owner
- constrains the stake PDA by identity and bump
- records a pending unstake amount and unlock slot

### `agent_stake.finalize_unstake`

Signature:

- `finalize_unstake(ctx)`

Behavior:

- requires the signer to match the stake owner
- constrains the stake PDA by identity and bump
- rejects empty or premature unstake requests
- transfers the unlocked lamports back to the owner

### `agent_stake.slash_with_authority`

Signature:

- `slash_with_authority(ctx, amount)`

Behavior:

- rejects zero amounts
- requires the signer to match the configured slash authority
- requires `stake.trust_mode == TRUST_MODE_AUTHORITY`
- constrains the stake PDA by identity and bump
- requires a receipt account owned by `receipt_emitter`
- requires the receipt identity to match the stake identity
- requires `DISPUTE_RESOLVED_KIND`
- initializes a slash marker keyed by stake and receipt to reject replay
- transfers slashed lamports to the protocol treasury PDA owned by `dispute_resolver`

### `agent_stake.slash_with_verdict`

Signature:

- `slash_with_verdict(ctx)`

Behavior:

- requires `stake.trust_mode == TRUST_MODE_VERDICT`
- requires a `dispute_resolver` verdict PDA bound to the supplied dispute receipt
- requires the verdict adjudicator to sign
- requires `AGENT_LOST_OUTCOME`
- initializes a slash marker keyed by stake and dispute receipt to reject replay
- transfers the verdict-defined slash amount to the protocol treasury PDA owned by `dispute_resolver`

### `dispute_resolver.register_adjudicator`

Signature:

- `register_adjudicator(ctx, adjudicator)`

Behavior:

- creates the singleton `AdjudicatorConfig` PDA
- stores the governance signer and the active adjudicator
- creates the singleton protocol treasury PDA used by `agent_stake`

### `dispute_resolver.record_verdict`

Signature:

- `record_verdict(ctx, outcome, slash_amount)`

Behavior:

- requires the signer to match the configured adjudicator
- requires the supplied receipt to be a `DISPUTE_KIND` receipt
- creates a verdict PDA keyed by the dispute receipt
- stores the target identity, adjudicator, outcome, and slash amount

### `dispute_resolver.challenge_verdict`

Signature:

- `challenge_verdict(ctx)`

Behavior:

- reserved for a later protocol wave
- currently rejects with `VerdictChallengeNotImplemented`

## Receipt Kinds

Defined in `crates/trust_substrate_core/src/constants.rs`:

- `ASSIGNMENT_KIND = 1`
- `HANDOFF_KIND = 2`
- `COMPLETION_KIND = 3`
- `DISPUTE_KIND = 4`
- `DISPUTE_RESOLVED_KIND = 5`
- `CHALLENGE_KIND = 6`
- `CHALLENGE_RESPONSE_KIND = 7`

## Delegation Scope Bits

Defined in `crates/trust_substrate_core/src/constants.rs`:

- `ASSIGNMENT_SCOPE_BIT`
- `HANDOFF_SCOPE_BIT`
- `COMPLETION_SCOPE_BIT`
- `DISPUTE_SCOPE_BIT`
- `DISPUTE_RESOLVED_SCOPE_BIT`
- `CHALLENGE_SCOPE_BIT`
- `CHALLENGE_RESPONSE_SCOPE_BIT`
- `VALID_SCOPE_BITMAP`

## Application And Freshness Seeds

Defined in `crates/trust_substrate_core/src/constants.rs`:

- `LATEST_CHECKPOINT_SEED`
- `TASK_RECEIPT_APPLICATION_SEED`
- `REPUTATION_RECEIPT_APPLICATION_SEED`

## Task Statuses

Defined in `crates/trust_substrate_core/src/constants.rs`:

- `TASK_STATUS_PENDING`
- `TASK_STATUS_ACTIVE`
- `TASK_STATUS_COMPLETED`
- `TASK_STATUS_DISPUTED`
- `TASK_STATUS_RESOLVED`

## Errors

Defined in `crates/trust_substrate_core/src/error.rs`:

- `InvalidReceiptKind`
- `EmptyDelegationScope`
- `InvalidDelegationScope`
- `ReceiptIdentityMismatch`
- `TaskIdentityMismatch`
- `ReputationDomainMismatch`
- `ReputationIdentityMismatch`
- `DelegationRevoked`
- `DelegationExpired`
- `DelegationScopeMismatch`
- `DelegationDelegateMismatch`
- `DelegationIdentityMismatch`
- `InvalidMerkleProof`
- `ProofIndexOutOfRange`
- `CheckpointIdentityMismatch`
- `CheckpointEpochOverflow`
- `CheckpointEpochNotSequential`
- `CheckpointLeafCountRegression`
- `TaskDisputeRequiredForResolution`
- `ReceiptKindNotSyncableToTask`
- `ReceiptKindNotAppliedToReputation`
- `ReceiptTaskMismatch`
- `ReceiptAlreadyAppliedToTask`
- `ReceiptAlreadyAppliedToReputation`
- `StaleCheckpoint`
- `IdentityAccountTypeMismatch`
- `ReceiptAccountTypeMismatch`
- `TaskAuthorityMismatch`
- `DelegationAuthorityMismatch`
- `ReceiptAuthorityMismatch`
- `CheckpointAuthorityMismatch`
- `CheckpointImportAuthorityMismatch`
- `CheckpointImportedIsReadOnly`
- `ReputationAuthorityMismatch`
- `StakeAuthorityMismatch`
- `StakeSlashAuthorityMismatch`
- `StakeAmountOverflow`
- `StakeAmountMustBePositive`
- `StakeInsufficient`
- `StakeCooldownNotElapsed`
- `StakeReceiptIdentityMismatch`
- `StakeReceiptKindMismatch`
- `StakeSlashAlreadyApplied`
- `InvalidTrustMode`
- `StakeTrustModeMismatch`
- `StakeTreasuryVaultMismatch`
- `InvalidVerdictOutcome`
- `VerdictAdjudicatorMismatch`
- `VerdictReceiptKindMismatch`
- `VerdictTargetIdentityMismatch`
- `VerdictDisputeReceiptMismatch`
- `VerdictOutcomeNotSlashable`
- `VerdictChallengeNotImplemented`

## Future Work

- stronger multi-hop delegation proof chains
- Light Protocol ZK Compression integration
- production event ingestion
