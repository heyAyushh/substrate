# Multi-agent coding simulation

A local walkthrough of how multiple coding agents — modelled on the minimal
read/write/edit/bash tool surface of
[`@mariozechner/pi-coding-agent`](https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent) —
cooperate under Trust Substrate's trust layer.

Four identities drive the scenario:

- `planner` — assigns work and routes handoffs.
- `builder-alpha` — receives the first handoff and misbehaves.
- `builder-beta` — receives a second handoff and completes cleanly.
- `reviewer` — issues availability challenges and an attestation.

## Scenario

1. `planner` records an `assignment` built from an `ExecutionRecord` of
   `read` + `bash` tool calls, and seeds identity-scoped stake events on the
   same receipt.
2. `planner` hands off to `builder-alpha`, seeding alpha's stake.
3. `builder-alpha` attempts a completion with a blob that is not pinned. The
   SDK's DA-proof helper rejects it at submit time; the rejection reason is
   captured in the output.
4. `builder-alpha` emits a completion without DA verification (the
   misbehaviour). `reviewer` challenges the completion with a deadline slot.
5. Because the challenge is unanswered past the deadline, the reviewer
   emits an `unanswered_challenge` dispute and a `dispute_resolved` with
   `agent_lost`, slashing 400_000 lamports from alpha's stake.
6. `planner` hands off to `builder-beta`, who submits a completion with a
   verified blob.
7. `reviewer` attests to `builder-beta` with a `review` attestation.
8. The indexer computes the execution graph, a domain leaderboard, the
   attestation-filtered leaderboard, stake state per identity, and a
   reputation profile — and writes a JSON snapshot to
   `examples/multi_agent/.snapshot/`.

The output surfaces:

- which receipts landed and in what order
- the handoff chain across the three builders
- the leaderboard with and without the attestation filter (alpha drops out)
- derived stake state, including alpha's 400_000-lamport slash
- the reputation profile derived from the verified receipt history

## Running

```bash
pnpm --filter @trust-substrate/sdk build
pnpm --filter @trust-substrate/indexer build
node --experimental-strip-types examples/multi_agent/run.ts
```

The simulation is pure TypeScript and requires no Solana RPC. It reuses the
on-chain canonical hashing rules, so the execution-record roots it prints are
the same `payload_hash` values the `receipt_emitter` program would anchor.

For a live Solana hook-up, use the SDK bridge path instead of this demo-only
script:

- `adaptPiToolCalls` / `adaptAndSignPiToolCalls` in `packages/sdk/src/pi-adapter.ts`
- `TrustSubstrateOnchainClient` in `packages/sdk/src/onchain-client.ts`
- `PiToolStreamBridge` in `packages/sdk/src/pi-bridge.ts`

## Tool mapping

Pi-mono's coding agent exposes four default tools: `read`, `write`, `edit`,
`bash`. The simulation maps each invocation into an `ExecutionStep` kind:

| Tool    | Step kind   |
| ------- | ----------- |
| `read`  | `tool_call` |
| `write` | `file_edit` |
| `edit`  | `file_edit` |
| `bash`  | `command`   |

Each step's hash contributes to the Merkle root that becomes the receipt's
`payload_hash`, so a dispute can bind to a single tool invocation inside an
agent's run.
