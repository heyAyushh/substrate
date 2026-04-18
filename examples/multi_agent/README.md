# Multi-agent coding simulation

A pure-TypeScript walkthrough of four coding agents cooperating under
Trust Substrate. Each agent runs the minimal read/write/edit/bash tool
surface of
[`@mariozechner/pi-coding-agent`](https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent),
and every tool call flows through the SDK's canonical hashing rules so
receipt roots match what the `receipt_emitter` program would anchor
on-chain. The script never opens an RPC connection and never submits a
transaction — it is an offline choreography of SDK APIs.

## Identities

- `planner` — assigns work and routes handoffs.
- `builder-alpha` — receives the first handoff and misbehaves.
- `builder-beta` — receives a second handoff and completes cleanly.
- `reviewer` — issues availability challenges and an attestation.

## Scenario

1. `planner` records an `assignment` built from an `ExecutionRecord` of
   `read` + `bash` tool calls, and seeds identity-scoped stake events on the
   same receipt.
2. `planner` hands off to `builder-alpha`, seeding alpha's stake.
3. `builder-alpha` tries to emit a completion whose blob is not pinned.
   The SDK's DA-proof helper rejects the submission; the rejection is
   captured in the transcript.
4. `builder-alpha` emits a completion without DA verification (the
   misbehaviour). `reviewer` challenges that completion with a deadline
   slot.
5. The challenge goes unanswered past the deadline, so `reviewer`
   emits an `unanswered_challenge` dispute followed by a
   `dispute_resolved` receipt with `agent_lost`, slashing 400_000 lamports
   from alpha's stake.
6. `planner` hands off to `builder-beta`, who submits a completion with
   a verified blob.
7. `reviewer` attests to `builder-beta` with a `review` attestation.
8. The indexer derives the execution graph, the domain leaderboard, the
   attestation-filtered leaderboard, the task inheritance chain, per-identity
   stake state, team reputation views, and a reputation profile, then writes
   a JSON snapshot to
   `examples/multi_agent/.snapshot/`.

The transcript surfaces:

- which receipts landed and in what order
- the handoff chain across the three builders
- the inherited lineage for the final completion (`planner -> builder-alpha -> builder-beta`)
- the leaderboard with and without the attestation filter (alpha drops out)
- derived team reputation for the builder team and the control-plane team
- derived stake state, including alpha's 400_000-lamport slash
- the reputation profile derived from the verified receipt history

## Running

```bash
pnpm --filter @trust-substrate/sdk build
pnpm --filter @trust-substrate/indexer build
node --experimental-strip-types examples/multi_agent/run.ts
```

## Tool mapping

| Pi tool | `ExecutionStep.kind` |
| ------- | -------------------- |
| `read`  | `tool_call`          |
| `write` | `file_edit`          |
| `edit`  | `file_edit`          |
| `bash`  | `command`            |

Each step's hash contributes to the Merkle root that becomes the receipt's
`payload_hash`, so a dispute can bind to a single tool invocation inside
an agent's run.

## Connecting a live pi-coding-agent session

This directory is demo-only. To let a real `pi-coding-agent` CLI session
emit receipts onto Surfpool or devnet, install the extension package
instead:

- `packages/pi-extension/src/substrate-extension.ts` — `createSubstrateExtension`
  loads a keypair, bootstraps identity/task PDAs, and commits a
  `completion` receipt at every `turn_end`.
- `packages/pi-extension/src/config.ts` — environment variables:
  `SUBSTRATE_KEYPAIR`, `SUBSTRATE_RPC_URL`, `SUBSTRATE_RPC_SUBSCRIPTIONS_URL`,
  `SUBSTRATE_DOMAIN`, `SUBSTRATE_IDENTITY_LABEL`, `SUBSTRATE_TASK_TITLE`,
  `SUBSTRATE_BLOB_DIR`, `SUBSTRATE_AUTO_PROVISION_IDENTITY`,
  `SUBSTRATE_SURFPOOL_STUDIO_URL`, `SUBSTRATE_RUN_DASHBOARD_URL`.
- `packages/pi-extension/src/slash-commands.ts` — `/substrate-status`,
  `/substrate-dashboard`, `/substrate-stake`, `/substrate-challenge`,
  `/substrate-dispute`.
- `packages/pi-extension/src/delegation-gate.ts` — gates tool calls
  against a `DelegationRecord` scope.
