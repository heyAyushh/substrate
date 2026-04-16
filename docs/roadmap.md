# Roadmap

## Product Direction

Trust Substrate is the primitive beneath agent applications. Agents need wallets, memory, receipts, delegation, and reputation that can be audited later.

The durable object is the execution graph. Scores, profiles, and trust views are derived from that graph.

## Phase 1: Identity, Task, And Receipt Flow

Open follow-ups:

- richer task DAG constraints across parent and subtask receipts
- generated-client adoption in higher-level examples and package consumers
- broader authority-transition examples beyond the protocol tests

## Phase 2: Delegation And Handoff Chain

Open follow-ups:

- explicit multi-hop handoff proof chains
- clearer authority-chain display in the agent simulation

## Off-Chain Storage

The on-chain programs anchor only what must be globally ordered. Execution
records, evidence bundles, and agent-trace exports live off-chain. See
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

## Phase 5: SDK, Indexer, And Agent Integration

Open follow-ups:

- production event ingestion design
- generated-client use in agent-facing integration flows
