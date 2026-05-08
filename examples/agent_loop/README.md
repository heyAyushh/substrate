# Agent Loop Example

This is the small deterministic SDK example. It shows how an agent framework can
use Trust Substrate concepts without starting Solana RPC:

1. declare planner and builder identities
2. publish stake facts as canonical receipt payloads
3. hand off a task from planner to builder
4. emit a completion receipt
5. open and finalize an unanswered challenge
6. slash local stake in the reconstructed view
7. build a Merkle tree over receipt hashes
8. ingest the ledger into the durable indexer

This is not the live Society demo. It writes only local files under
`examples/agent_loop/.snapshot/`.

## Prerequisites

From the repository root:

```bash
pnpm install
pnpm --filter @trust-substrate/sdk build
pnpm --filter @trust-substrate/indexer build
```

## Run

```bash
node --experimental-strip-types examples/agent_loop/run.ts
```

## Verify

The example is covered by the package and verification tests:

```bash
pnpm test:packages
pnpm test:verification
```
