# Roadmap

## Product direction

Trust Substrate is the primitive beneath agent applications. It is designed for systems where agents need wallets, memory, receipts, delegation, and reputation that can be audited later.

The durable object is the execution graph. Scores, profiles, and trust views are derived from that graph.

## Current MVP

The current repository proves the local protocol loop:

1. identity
2. task
3. receipt
4. delegation
5. checkpoint
6. reputation derivation
7. SDK replay
8. indexer graph reconstruction
9. Surfpool end-to-end execution

The MVP intentionally favors correctness, auditability, and test coverage before compute optimization or deployment splitting.

## Phase 1: Identity, task, and receipt flow

Status: implemented for the MVP.

Done:

- identity PDA creation
- authority-gated task creation
- canonical receipt accounts
- receipt event emission
- duplicate receipt protection through PDA uniqueness and SDK ledger replay checks
- local Anchor and TypeScript tests

Next:

- richer task DAG constraints
- task status transitions derived from receipt history
- SDK helpers that submit real transactions through generated clients

## Phase 2: Delegation and handoff chain

Status: partially implemented.

Done:

- scoped delegation records
- empty-scope rejection
- revocation state
- local SDK scope assertions
- handoff-chain reconstruction in the indexer

Next:

- enforce delegated receipt emission on chain
- add expiry checks against the slot clock
- support multi-hop handoff proofs with explicit authority chains

## Phase 3: Compressed history and proof API

Status: local model implemented, on-chain surface is checkpoint-only.

Done:

- Merkle tree construction in the Rust and TypeScript model layers
- inclusion proof checks in local tests
- per-agent checkpoint account shape
- stale and wrong-agent proof expectations in verification docs

Next:

- on-chain Merkle proof verifier instruction
- epoch rotation rules
- Light Protocol ZK Compression evaluation
- compressed account integration only after the checkpoint model is stable

## Phase 4: Reputation derivation

Status: MVP accumulator implemented.

Done:

- domain-specific reputation accumulator
- completion and dispute counters derived from receipts
- no direct score-write path
- deterministic SDK reputation profile derivation

Next:

- richer domain-separated vectors
- weighting policies derived from verified receipt classes
- dispute resolution receipts
- model tests for gaming resistance

## Phase 5: SDK, indexer, and agent integration

Status: local deterministic packages implemented.

Done:

- SDK helper package
- local durable indexer package
- tests for graph reconstruction and replay behavior
- Surfpool E2E harness

Next:

- Codama-generated client layer targeting `@solana/kit`
- agent framework integration example
- durable local store for indexer snapshots
- production event ingestion design

## Release gate

No phase is considered complete without:

- a failing test written first
- a passing focused test
- passing relevant local suite
- documentation updates
- Surfpool E2E success for end-to-end behavior

Devnet is not the required final gate for this project.
