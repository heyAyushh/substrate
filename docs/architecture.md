# Trust Substrate Architecture

## Overview

Trust Substrate is a local-first Solana protocol set for agent identity, task tracking, receipt history, delegation, checkpoint proofs, derived reputation, and stake-backed dispute resolution.

The durable object is the execution graph. Receipts describe meaningful steps. Checkpoints anchor history roots. Reputation is derived from verified receipt history.

## Layers

1. Anchor programs in `programs/*`
2. Shared Rust core in `crates/trust_substrate_core`
3. Deterministic TypeScript helpers in `packages/sdk/src`
4. Local execution-graph reconstruction in `packages/indexer/src`
5. Local verification through Rust, TypeScript, Anchor/LiteSVM, and Surfpool tests

## On-Chain Programs

The workspace currently has these Anchor programs:

- `identity_registry`: creates PDA-based agent identities with authority, policy root, and history root
- `task_registry`: creates task records and syncs task status from receipts
- `receipt_emitter`: emits direct and delegated receipt records
- `delegation_engine`: creates and revokes scoped delegate records
- `proof_verifier`: creates, rotates, and verifies history checkpoints
- `reputation_accumulator`: applies receipt facts to domain-specific reputation accumulators
- `dispute_resolver`: registers the active adjudicator, anchors the protocol treasury PDA, and records dispute verdicts
- `agent_stake`: escrows identity-scoped stake, cooldown-gates unstaking, and binds slashing to dispute-resolution receipts

`crates/trust_substrate_core` keeps shared seeds, receipt kinds, task statuses, errors, Merkle helpers, and pure model tests out of the program crates.

## Account Roots

Each persistent account is derived from a fixed PDA seed:

- `AgentIdentity`: `identity`
- `TaskRecord`: `task`
- `ReceiptRecord`: `receipt`
- `DelegationRecord`: `delegation`
- `HistoryCheckpoint`: `checkpoint`
- `ReputationAccumulator`: `reputation`
- `DisputeVerdict`: `verdict`
- `StakeAccount`: `stake`
- `SlashMarker`: `slash_marker`

The agent identity PDA is the root of trust for identity-scoped writes. Authority checks and account constraints keep tasks, receipts, checkpoints, reputation records, and stake accounts tied to the correct identity.

## Receipt History

Receipts are append-only evidence. A receipt records:

- identity
- task
- receipt id
- actor
- kind
- sequence
- domain
- previous receipt id
- payload hash
- optional delegation record

Canonical receipt kinds are:

- assignment
- handoff
- completion
- dispute
- dispute resolved
- challenge
- challenge response

Direct receipts are signed by the identity authority. Delegated receipts are signed by the delegate and must pass delegation identity, revocation, expiry, and scope checks.

## Checkpoints And Proofs

The proof verifier stores per-identity history checkpoints with:

- epoch
- current root
- previous root
- leaf count

Normal checkpoints start empty and append receipt leaves in canonical task and sequence order. Checkpoint rotation requires the next epoch and carries the previous root forward. Inclusion verification checks Merkle proofs against the checkpoint root using the shared core hashing rules.

`checkpoint_import` is the only caller-supplied root path. It is marked as imported, gated by the `checkpoint_importer` governance authority, and intended for migration or recovery rather than routine receipt history.

This is the local checkpoint model. Light Protocol ZK Compression is future work, not part of the current local baseline.

## Reputation

Reputation is derived from receipts. The on-chain accumulator stores domain-specific counters and weights:

- completed
- disputed
- resolved
- completion weight
- dispute weight
- dispute-resolved weight

There is no direct score-write instruction. The SDK can derive richer local profiles from the verified graph.

## Stake-Backed Disputes

`agent_stake` keeps optional slashable SOL escrow under an agent identity. Stake owners can request unstake, but withdrawals are delayed by a cooldown slot. Authority-mode stake can be slashed only by the configured slash authority against a `DISPUTE_RESOLVED_KIND` receipt. Verdict-mode stake can be slashed only from a `dispute_resolver` verdict bound to a dispute receipt, the target identity, and the active adjudicator. Both paths share the same replay marker PDA keyed by stake and dispute receipt.

## Indexing

`packages/indexer/src/local-durable-indexer.ts` reconstructs local execution history from receipts. It deduplicates receipts, sorts by slot, and builds:

- task histories
- agent histories
- handoff chains
- domain summaries
- execution graph snapshots

The indexer is local and deterministic. Remote event ingestion and Geyser-style pipelines are future work.

## SDK

`packages/program-clients/src/generated` contains Codama-generated `@solana/kit` clients derived from the current Anchor IDLs. This is the RPC-facing layer for instructions, accounts, PDAs, and typed parsers.

`packages/sdk/src` provides deterministic local helpers for:

- canonical execution records and receipt builders
- append-only receipt ledger replay checks
- Merkle tree creation and proof verification
- delegation scope assertions
- derived reputation profiles
- stake, challenge, and execution-trace projection helpers

The generated clients and the SDK have different roles. The generated package speaks to programs. The SDK derives and validates local protocol state around those on-chain facts.

## Local Flow

1. Create an agent identity PDA.
2. Create a task PDA under that identity.
3. Emit receipts for assignments, handoffs, completions, disputes, and resolutions.
4. Create scoped delegation records for handoff authority.
5. Checkpoint receipt history roots and verify inclusion proofs.
6. Apply receipts to domain reputation accumulators.
7. Rebuild the execution graph with the local indexer.
