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
   misbehaviour). `reviewer` opens challenge round `0` against that
   completion with a deadline slot.
5. The challenge goes unanswered past the deadline, so `reviewer`
   finalizes the unanswered challenge as a dispute and then emits a
   `dispute_resolved` receipt with `agent_lost`, slashing 400_000 lamports
   from alpha's stake.
6. `planner` hands off to `builder-beta`, who submits a completion with
   a verified blob.
7. `reviewer` attests to `builder-beta` with a `review` attestation.
8. The indexer derives the execution graph, the domain leaderboard, the
   attestation-filtered leaderboard, per-identity stake state, and a
   reputation profile, then writes a JSON snapshot to
   `examples/multi_agent/.snapshot/`.

The transcript surfaces:

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

## Connecting a live Pi Mono Agent session

The script above stays offline so it is fast and deterministic. For a live
`pi-coding-agent` session backed by Surfpool, use the extension package. It
declares itself as a Pi package and loads `packages/pi-extension/dist/index.js`
as the extension entrypoint.

Build the on-chain programs and extension:

```bash
anchor build --ignore-keys
pnpm --filter @trust-substrate/pi-extension build
```

Start Surfpool with the same ports used by the dashboard and extension:

```bash
NO_DNA=1 surfpool start \
  --host 127.0.0.1 \
  --port 8899 \
  --ws-port 8900 \
  --studio-port 18488 \
  --no-tui \
  --ci \
  --offline \
  --legacy-anchor-compatibility \
  --airdrop-keypair-path "${HOME}/.config/solana/id.json"
```

Run Pi from the repository root with the extension loaded:

```bash
SUBSTRATE_KEYPAIR="${HOME}/.config/solana/id.json" \
SUBSTRATE_RPC_URL="http://127.0.0.1:8899" \
SUBSTRATE_RPC_SUBSCRIPTIONS_URL="ws://127.0.0.1:8900" \
SUBSTRATE_SURFPOOL_STUDIO_URL="http://127.0.0.1:18488" \
SUBSTRATE_RUN_DASHBOARD_URL="http://127.0.0.1:4173/examples/multi_agent/dashboard/index.html" \
pi -e ./packages/pi-extension/dist/index.js
```

Inside Pi, use `/substrate-status` to print the live identity/task binding and
`/substrate-dashboard` to print the Surfpool Studio and dashboard URLs. Each
completed Pi turn commits a `completion` receipt through Surfpool.

The live operator commands also submit real on-chain actions through the same
local Surfpool cluster:

- `/substrate-stake <lamports>` ensures the agent stake PDA exists and deposits
  lamports into it.
- `/substrate-challenge <receiptId>` emits a live `challenge` receipt against a
  prior indexed receipt with a local deadline window and round metadata.
- `/substrate-dispute <receiptId>` emits a live `dispute` receipt. If there is
  an unanswered indexed challenge for that receipt, the payload binds to that
  challenge; otherwise it emits a manual dispute marker against the target
  receipt.

Useful files:

- `packages/pi-extension/src/substrate-extension.ts` — loads the keypair,
  bootstraps identity/task PDAs, commits receipts at `turn_end`, and wires the
  live stake/challenge/dispute commands.
- `packages/pi-extension/src/config.ts` — reads the `SUBSTRATE_*` environment
  variables used above.
- `packages/pi-extension/src/slash-commands.ts` — defines
  `/substrate-status`, `/substrate-dashboard`, `/substrate-stake`,
  `/substrate-challenge`, and `/substrate-dispute`.
- `packages/pi-extension/src/delegation-gate.ts` — gates tool calls against a
  `DelegationRecord` scope.
