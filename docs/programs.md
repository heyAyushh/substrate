# Trust Substrate Program Interface

## Program overview

The Anchor program is defined in `programs/trust_substrate/src/lib.rs`. The declared program id is:

`FG9pVEZe1srVF1zTF2WgYpT5VSxxy7om9i9SJj9rGq3n`

The program currently exposes one no-op initializer and six protocol instructions.

## Accounts

### `AgentIdentity`

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

Fields:

- `identity: Pubkey`
- `task_id: [u8; 32]`
- `subtask_root: [u8; 32]`
- `subtask_count: u16`
- `bump: u8`

PDA seed:

- `task`
- identity pubkey
- `task_id`

### `ReceiptRecord`

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
- `bump: u8`

PDA seed:

- `receipt`
- identity pubkey
- task pubkey
- `receipt_id`

### `DelegationRecord`

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

Fields:

- `identity: Pubkey`
- `epoch: u64`
- `root: [u8; 32]`
- `leaf_count: u64`
- `bump: u8`

PDA seed:

- `checkpoint`
- identity pubkey
- epoch as little-endian bytes

### `ReputationAccumulator`

Fields:

- `identity: Pubkey`
- `domain: [u8; 32]`
- `completed: u64`
- `disputed: u64`
- `bump: u8`

PDA seed:

- `reputation`
- identity pubkey
- `domain`

## Instructions

### `initialize`

Signature:

- `initialize(ctx: Context<Initialize>) -> Result<()>`

Behavior:

- currently a no-op aside from a log message
- does not create state

### `create_identity`

Signature:

- `create_identity(ctx, agent_id, policy_root, history_root)`

Accounts:

- `identity` PDA, init
- `authority` signer
- `system_program`

Behavior:

- stores the authority pubkey on the identity
- stores the agent id, policy root, and history root
- records the PDA bump

### `create_task`

Signature:

- `create_task(ctx, task_id, subtask_root, subtask_count)`

Accounts:

- `authority` signer
- `identity`
- `task` PDA, init
- `system_program`

Behavior:

- requires the signer to match `identity.authority`
- stores the task id, subtask root, subtask count, and bump

### `emit_receipt`

Signature:

- `emit_receipt(ctx, receipt_id, kind, sequence, domain, previous_receipt, payload_hash)`

Accounts:

- `authority` signer
- `identity`
- `task`
- `receipt` PDA, init
- `system_program`

Behavior:

- validates `kind` against the canonical receipt vocabulary
- requires the signer to match `identity.authority`
- stores the receipt fields and bump
- emits a `ReceiptCommitted` event

Event fields:

- `identity`
- `task`
- `receipt_id`
- `actor`
- `kind`
- `sequence`
- `domain`

### `create_delegation`

Signature:

- `create_delegation(ctx, allowed_actions, expires_at_slot)`

Accounts:

- `authority` signer
- `identity`
- `delegate`
- `delegation` PDA, init
- `system_program`

Behavior:

- requires at least one allowed action bit
- requires the signer to match `identity.authority`
- stores the delegate pubkey, scope bitmap, expiry slot, revoked flag, and bump

### `revoke_delegation`

Signature:

- `revoke_delegation(ctx)`

Accounts:

- `authority` signer
- `identity`
- `delegation`

Behavior:

- requires the signer to match `identity.authority`
- sets `revoked` to `true`

### `checkpoint_history`

Signature:

- `checkpoint_history(ctx, epoch, root, leaf_count)`

Accounts:

- `authority` signer
- `identity`
- `checkpoint` PDA, init
- `system_program`

Behavior:

- requires the signer to match `identity.authority`
- stores the epoch root and leaf count
- records the PDA bump

### `create_reputation_domain`

Signature:

- `create_reputation_domain(ctx, domain)`

Accounts:

- `authority` signer
- `identity`
- `reputation` PDA, init
- `system_program`

Behavior:

- requires the signer to match `identity.authority`
- initializes `completed` and `disputed` counters to zero
- stores the PDA bump

### `apply_reputation_receipt`

Signature:

- `apply_reputation_receipt(ctx)`

Accounts:

- `authority` signer
- `identity`
- `receipt`
- `reputation`

Behavior:

- requires the signer to match `identity.authority`
- requires the receipt identity to match the identity account
- requires the reputation domain to match the receipt domain
- increments `completed` for completion receipts
- increments `disputed` for dispute receipts
- leaves assignment and handoff receipts unchanged

## Constants

Defined in `programs/trust_substrate/src/constants.rs`:

- `IDENTITY_SEED`
- `TASK_SEED`
- `RECEIPT_SEED`
- `DELEGATION_SEED`
- `CHECKPOINT_SEED`
- `REPUTATION_SEED`
- `EMPTY_SCOPE_BITMAP = 0`
- `ASSIGNMENT_KIND = 1`
- `HANDOFF_KIND = 2`
- `COMPLETION_KIND = 3`
- `DISPUTE_KIND = 4`
- `COMPLETION_CREDIT = 1`
- `DISPUTE_CREDIT = 1`

## Errors

Defined in `programs/trust_substrate/src/error.rs`:

- `InvalidAuthority`
- `InvalidReceiptKind`
- `EmptyDelegationScope`
- `ReceiptIdentityMismatch`
- `ReputationDomainMismatch`

## Current/future boundary

Current:

- account creation and mutation logic described above
- identity-gated writes for task, receipt, delegation, checkpoint, and reputation accounts
- receipt event emission

Future:

- richer on-chain delegation enforcement during receipt emission
- on-chain Merkle proof verification
- compressed history accounts or proof verifier instructions
- non-local program interfaces beyond the current instruction set

