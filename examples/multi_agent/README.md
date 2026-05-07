# Multi-agent protocol walkthrough

A pure-TypeScript walkthrough of four coding agents cooperating under
Trust Substrate. Each agent runs the minimal read/write/edit/bash tool
surface of
[`@mariozechner/pi-coding-agent`](https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent),
and every tool call flows through the SDK's canonical hashing rules so
receipt roots match what the `receipt_emitter` program would anchor
on-chain. This script is a deterministic SDK walkthrough, not the live
Society Board: it never opens an RPC connection and never submits a
transaction.

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
8. The indexer reconstructs the execution graph, the domain leaderboard, the
   attestation-filtered leaderboard, the task inheritance chain, per-identity
   stake state, local reputation preview views, and a reputation profile from
   receipt history, then writes a JSON snapshot to
   `examples/multi_agent/.snapshot/`.

The transcript surfaces:

- which receipts landed and in what order
- the handoff chain across the three builders
- the inherited lineage for the final completion (`planner -> builder-alpha -> builder-beta`)
- local team reputation previews for the builder team and the control-plane team
- local stake view, including alpha's 400_000-lamport slash
- the reputation profile reconstructed from verified receipt history

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

The script above stays local-only so it is fast and deterministic. For a live
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
  --port 8898 \
  --ws-port 8897 \
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
SUBSTRATE_RPC_URL="http://127.0.0.1:8898" \
SUBSTRATE_WS_URL="ws://127.0.0.1:8897" \
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
- `packages/pi-extension/src/slash-commands.ts` — currently contains the
  stake/challenge/dispute operator commands: `/substrate-status`,
  `/substrate-dashboard`, `/substrate-stake`, `/substrate-challenge`, and
  `/substrate-dispute`.
- `packages/pi-extension/src/delegation-gate.ts` — gates tool calls against a
  `DelegationRecord` scope.

## Running the live society board

The society board is now live-only. The browser reads a Surfpool-backed world
session, the server advances one confirmed action at a time, and the compact
world snapshot is written into the on-chain society world account after each
step. Each agent gets a local identity folder under
`examples/multi_agent/.society-identities/`, holds its own Solana keypair, signs
its action transcript entry before submission, signs the after-action state
commitment, and submits the action receipt through an on-chain delegation from
the society task identity. The browser board only reads the committed Surfpool
world state; it is not the validator. The final evidence artifact includes the
Merkle transcript root. Each live action also carries the canonical action envelope
linking the agent id, identity address, task address, before/after state hashes,
receipt payload hash, transaction signature, slot, agent signature, and
transcript leaf. Model-backed Pi launch is still explicit; the board does not
send hidden Pi/LLM prompts.

To make live steps ask Pi, run a Pi local-runtime server such as the Pi console
dev server, then set `SUBSTRATE_SOCIETY_PI_ACTIONS=1`. The society server sends
the acting agent a system prompt containing commit-ready allowed actions for the
current tick, plus identity, delegation, and receipt context. Pi must return
strict JSON selecting one allowed action before the delegated receipt is emitted.
If Pi is disabled, missing, refuses, or returns a mismatched action, no fake
response is substituted.

Build the browser bundle:

```bash
pnpm --dir examples/multi_agent/society-ui-app build
```

Start Surfpool on the same local ports used by the server:

```bash
NO_DNA=1 surfpool start \
  --host 127.0.0.1 \
  --port 8898 \
  --ws-port 8897 \
  --studio-port 18488 \
  --no-tui \
  --ci \
  --offline \
  --legacy-anchor-compatibility \
  --airdrop-keypair-path "${HOME}/.config/solana/id.json"
```

Start the society demo server:

```bash
. ./examples/multi_agent/society-demo-env.example.sh
pnpm society
```

Set `SUBSTRATE_PUBLIC_SOCIETY_URL`, `SUBSTRATE_PUBLIC_RPC_URL`, and
`SUBSTRATE_PUBLIC_SURFPOOL_STUDIO_URL` when the demo is behind a named tunnel or
public domain. The browser uses those public links while the server still writes
to the local Surfpool RPC in `SUBSTRATE_RPC_URL`. Live write routes stay
loopback-only unless `SUBSTRATE_ALLOW_PUBLIC_LIVE_MUTATION=1` is set for an
intentional public demo.

Open the printed `/society` URL. Nothing starts on page load. `Go live`
creates a paused server-owned live session, `Resume last` intentionally reopens
the latest server-side session after a refresh, `Step` commits exactly one
pending action, and `Play` / `Pause` streams confirmed actions until the server
writes the final evidence artifact.

The curated onboarding worlds are tuned to stay live-first and responsive on
first paint. They produce child-agent lineage, failures, inherited value,
receipts, account links, and final evidence files without offering offline
preview or replay controls.

The Surfpool panel includes a protocol evidence graph plus a program coverage
card for all nine deployable Trust Substrate programs. The task program is the
board anchor: it owns the society task and Surfpool world state that the browser
reads. The other programs add supporting trust evidence for identity,
attestation, delegation, receipts, history proofs, reputation, stake, and
disputes. The evidence graph indexes readable records per program and marks
missing evidence visibly instead of treating absence as proof. The card also
names the boundary where the board does not auto-play a deeper capability, such
as delegation revocation or example dispute escalation.
