# Roadmap

## Direction

Trust Substrate is the protocol beneath agent applications. Agents need
wallets, memory, receipts, delegation, and reputation that can be audited
later.

The execution graph is the record. Scores, profiles, and trust views are
derived from that graph for display, while canonical domain reputation is
applied by the reputation program.

## Production Readiness To-Do

The active checklist for current production boundaries lives in
[Production Readiness To-Do](production-readiness.md)
(`docs/production-readiness.md`). Keep that file in sync with the security
known-gaps list before claiming a gap is closed.

## Phase 1: Identity, Task, And Receipt Flow

Open follow-ups:

- richer task DAG constraints across parent and subtask receipts
- richer sequence ordering tests across interleaved tasks and domains
- generated-client adoption in higher-level examples and package consumers
- broader authority-transition examples beyond the protocol tests

## Phase 2: Delegation And Handoff Chain

Open follow-ups:

- explicit multi-hop handoff proof chains
- on-chain proof constraints for handoff chains beyond local reconstruction
- clearer authority-chain display in example integrations

## Off-Chain Storage

The on-chain programs anchor only what must be globally ordered. Execution
records, evidence bundles, and Cursor Agent Trace exports live off-chain. See
`docs/off-chain-storage.md` for the split, supported blob backends, replay
model, and durability requirements.

## Phase 3: Compressed History And Proof API

Open follow-ups:

- Light Protocol ZK Compression evaluation
- compressed account integration after the checkpoint model is stable

## Phase 4: Reputation Derivation

Open follow-ups:

- richer domain-separated vectors
- stronger model tests for gaming resistance

## Phase 4B: Stake-Backed Dispute Resolution

Open follow-ups:

- move slash policy from an authority key into a dedicated dispute-resolution program
- bind slash amounts to structured verdict accounts instead of private receipt payloads
- decide whether v1 authority/adjudicator slashing is the accepted production policy

## Phase 5: SDK, Indexer, And Agent Integration

Open follow-ups:

- production RPC orchestration through generated `@solana/kit` clients
- production event ingestion design
- networked event pipeline with backfill, reconnect, and replay handling
- generated-client use in agent-facing integration flows
