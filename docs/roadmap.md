# Roadmap

## Product Direction

Trust Substrate is the primitive beneath agent applications. Agents need wallets, memory, receipts, delegation, and reputation that can be audited later.

The durable object is the execution graph. Scores, profiles, and trust views are derived from that graph.

## Current Local Baseline

The repository is organized around a local protocol loop:

1. identity creation
2. task creation
3. receipt emission
4. delegation and delegated receipt emission
5. checkpoint creation, rotation, and inclusion verification
6. reputation derivation from receipts
7. stake-backed dispute resolution
8. SDK replay checks
9. indexer graph reconstruction
10. Surfpool end-to-end execution

The baseline favors correctness, auditability, and test coverage before compute optimization or production deployment.

## Phase 1: Identity, Task, And Receipt Flow

Current scope:

- identity PDA creation
- authority-gated task creation
- canonical receipt accounts
- receipt event emission
- duplicate receipt protection through PDA uniqueness and SDK replay checks
- task status transitions derived from receipts through `sync_task_status`
- local Anchor and TypeScript tests

Next:

- richer task DAG constraints across parent and subtask receipts
- generated transaction clients for real RPC submission

## Phase 2: Delegation And Handoff Chain

Current scope:

- scoped delegation records
- empty-scope rejection
- revocation state
- slot-clock expiry checks for delegated receipt emission
- scope-bit checks for delegated receipt kinds
- delegated receipt attribution through `via_delegation`
- local SDK scope assertions
- handoff-chain reconstruction in the indexer

Next:

- explicit multi-hop handoff proof chains
- clearer authority-chain display in the agent simulation

## Off-Chain Storage

The on-chain programs anchor only what must be globally ordered. Execution records, evidence bundles, and agent-trace exports live off-chain. See `docs/off-chain-storage.md` for the split, supported blob backends, replay model, and the gaming-resistance surface each Wave B/C task addresses.

## Phase 3: Compressed History And Proof API

Current scope:

- Merkle tree construction in Rust and TypeScript model layers
- shared on-chain/off-chain hashing rules
- checkpoint creation and rotation
- on-chain receipt inclusion verification against checkpoint roots
- previous-root tracking during checkpoint rotation
- local proof tests for valid, forged, stale, and wrong-agent cases

Next:

- Light Protocol ZK Compression evaluation
- compressed account integration after the checkpoint model is stable

## Phase 4: Reputation Derivation

Current scope:

- domain-specific reputation accumulators
- configurable completion, dispute, and dispute-resolution weights
- completion, dispute, and resolution counters derived from receipts
- no direct score-write path
- deterministic SDK reputation profile derivation

Next:

- richer domain-separated vectors
- stronger model tests for gaming resistance

## Phase 4B: Stake-Backed Dispute Resolution

Current scope:

- identity-scoped stake accounts
- owner-gated staking and cooldown unstaking
- slash authority checks
- slashing bound to `dispute_resolved` receipts from `receipt_emitter`
- slash marker replay protection
- local Anchor tests for success and rejection paths

Next:

- move slash policy from an authority key into a dedicated dispute-resolution program
- bind slash amounts to structured verdict accounts instead of private receipt payloads
- expose stake state through SDK and indexer helpers

## Phase 5: SDK, Indexer, And Agent Integration

Current scope:

- SDK helper package with checkpoint-compatible Merkle primitives
- local durable indexer package with JSON snapshot persistence
- tests for graph reconstruction, replay behavior, and snapshot round-trip
- local agent-loop example under `examples/agent_loop`
- Surfpool E2E harness

Next:

- Codama-generated client layer targeting `@solana/kit`
- production event ingestion design
- stronger multi-agent simulation flows

## Release Gate

No phase should be treated as complete without:

- a failing test written first
- a passing focused test
- passing relevant local suite
- documentation updates
- Surfpool E2E success for end-to-end behavior

Devnet is not the required final gate for this project.
