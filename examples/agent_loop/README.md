# Agent loop example

An end-to-end walkthrough of how an agent framework uses Trust Substrate locally:

1. Two agents (`planner`, `builder`) are declared as identities.
2. The planner receives an assignment, hands off to the builder, and the builder completes the task.
3. Receipts are appended to a replay-safe ledger and ingested by the durable indexer.
4. A Merkle tree is built over the receipt hashes — this matches the on-chain checkpoint format.
5. A domain-specific reputation profile is derived from the verified history.
6. The indexer snapshot is persisted to disk so a restart can recover the full execution graph.

## Running

```bash
pnpm --filter @trust-substrate/sdk build
pnpm --filter @trust-substrate/indexer build
node --experimental-strip-types examples/agent_loop/run.ts
```

The example only uses local SDK primitives and writes its snapshot under
`examples/agent_loop/.snapshot/`. No Solana RPC is required.
