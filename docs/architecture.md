# Trust Substrate Architecture

## Overview

Trust Substrate is a local-first Solana program set for agent identity, task tracking, receipt history, delegation records, history checkpoints, and derived reputation. The on-chain program stores canonical state. The SDK provides deterministic local helpers. The indexer reconstructs execution history from ordered receipts.

The repository is organized around three layers:

1. On-chain state in `programs/trust_substrate/src/*.rs`
2. Local deterministic helpers in `packages/sdk/src`
3. Local execution-graph reconstruction in `packages/indexer/src`

## Current architecture

### On-chain program

The Anchor program defines six persistent account types:

- `AgentIdentity`
- `TaskRecord`
- `ReceiptRecord`
- `DelegationRecord`
- `HistoryCheckpoint`
- `ReputationAccumulator`

Each account is derived from a PDA with a fixed seed prefix:

- `identity`
- `task`
- `receipt`
- `delegation`
- `checkpoint`
- `reputation`

The program uses the agent identity PDA as the root of trust for the other records. The authority signer must control the identity for identity-scoped writes.

### Deterministic history model

The protocol treats receipts as the append-only source of truth.

On chain, a receipt captures:

- identity
- task
- receipt id
- actor
- kind
- sequence
- domain
- previous receipt id
- payload hash

The canonical receipt kinds are:

- assignment
- handoff
- completion
- dispute

The Rust `model.rs` module mirrors that history model for local tests. It provides:

- receipt hashing
- delegation scope checks
- Merkle tree construction and proof verification
- reputation derivation from verified receipt history

### Reputation model

Reputation is a derived vector, not a manually written score. The current implementation records:

- completed count
- disputed count

in the on-chain `ReputationAccumulator`, and computes richer derived profiles in the SDK and Rust model layer.

### Indexing

`packages/indexer/src/local-durable-indexer.ts` reconstructs local execution history from receipts. It deduplicates by `receiptId:slot`, sorts by slot, and builds:

- task histories
- agent histories
- handoff chains
- domain summaries
- a full execution graph view

This indexer is local and deterministic. It is not a networked or event-streaming indexer yet.

### SDK

`packages/sdk/src` is a deterministic TypeScript helper layer. It is not a chain RPC client. It provides:

- canonical identity/task/receipt/delegation record creation
- append-only receipt ledger replay protection
- Merkle tree creation and proof verification
- delegation scope assertions
- derived reputation profiles

## Current boundaries

Implemented today:

- Anchor program accounts and instructions
- local Rust model tests for hash/proof/reputation logic
- local TypeScript SDK helpers
- local durable indexer
- full local integration test that walks identity -> task -> receipt -> delegation -> checkpoint -> reputation

Not implemented yet:

- a production RPC client layer that sends these SDK objects to the chain
- a remote indexer or Geyser pipeline
- compressed history storage beyond the checkpoint account
- advanced on-chain enforcement of delegation during receipt emission
- a separate proof-verifier instruction surface

## Execution flow

1. Create an agent identity PDA with `agent_id`, `policy_root`, and `history_root`.
2. Create a task PDA under that identity with `task_id`, `subtask_root`, and `subtask_count`.
3. Emit receipts for assignments, handoffs, completions, and disputes.
4. Create a scoped delegation record for a delegate public key.
5. Record a history checkpoint for an epoch.
6. Create or update a domain reputation accumulator and apply receipts to it.

The local TypeScript and Rust test suites use the same conceptual sequence, but they exercise it with deterministic local data rather than live network ingestion.

