# Society Board

Society Board is the visual demo. It runs a small convoy-like world where
agents hold identities, receive $SUBSOL, act, help each other, create child
agents, die, emit receipts, checkpoint history, update reputation, stake value,
and record dispute outcomes.

The board only reads and displays protocol state. It is not the validator, and
it must not invent Pi answers.

## What It Exercises

The live Society flow uses all nine deployable programs through local Surfpool:

- `identity_registry` for agent identities
- `attester_registry` for reviewer and runtime trust context
- `task_registry` for the society task and world account
- `receipt_emitter` for signed action receipts
- `delegation_engine` for scoped delegated submissions
- `proof_verifier` for checkpoint/history proof state
- `reputation_accumulator` for program-backed reputation
- `dispute_resolver` for verdict evidence
- `agent_stake` for SOL/SPL stake and slashing paths

## Prerequisites

From the repository root:

```bash
pnpm install
anchor build --ignore-keys
pnpm society:ui:build
```

Surfpool must be available on the local ports used by the demo:

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

Deploy the programs into that Surfpool cluster:

```bash
anchor deploy \
  --provider.cluster http://127.0.0.1:8898 \
  --provider.wallet "${HOME}/.config/solana/id.json"
```

## Run

Start the Society server:

```bash
. ./examples/multi_agent/society-demo-env.example.sh
SUBSTRATE_SOCIETY_PORT=4200 pnpm society
```

Open [http://127.0.0.1:4200/society](http://127.0.0.1:4200/society).

The onboarding screen starts the world. Setup creates identities, delegations,
stake accounts, task/world state, and the first receipt. Use `Step` to commit
one action or `Play` to let the world run. The Surfpool panel shows account
links, transaction links, and which programs have evidence for the run.

## Run With Pi Console

Start Pi Console in another terminal:

```bash
pnpm pi-console:dev
```

Open [http://127.0.0.1:5173](http://127.0.0.1:5173).

By default, Society does not call Pi during `Step` or `Play`, so the demo does
not spend model tokens. To ask the local Pi runtime for actions:

```bash
SUBSTRATE_SOCIETY_PI_ACTIONS=1 \
SUBSTRATE_SOCIETY_PI_RUNTIME_URL="http://127.0.0.1:5173" \
SUBSTRATE_SOCIETY_PORT=4200 \
pnpm society
```

In Pi mode, Society sends the acting agent the allowed action set and current
world context. If Pi is disabled, missing, refuses, or returns a mismatched
action, the server stops that path instead of substituting a fake answer.

## Deterministic SDK Walkthrough

The older deterministic walkthrough is still useful for SDK and indexer checks.
It does not open an RPC connection or submit transactions.

```bash
pnpm --filter @trust-substrate/sdk build
pnpm --filter @trust-substrate/indexer build
node --experimental-strip-types examples/multi_agent/run.ts
```

It writes a local snapshot under `examples/multi_agent/.snapshot/`.

## Public Demo Notes

For a public tunnel, set:

```bash
SUBSTRATE_PUBLIC_SOCIETY_URL="https://your-society-url"
SUBSTRATE_PUBLIC_RPC_URL="https://your-rpc-url"
SUBSTRATE_PUBLIC_SURFPOOL_STUDIO_URL="https://your-studio-url"
```

Live write routes stay loopback-only unless you set
`SUBSTRATE_ALLOW_PUBLIC_LIVE_MUTATION=1` for an intentional public demo.

## Verify

```bash
pnpm society:ui:build
pnpm test:verification
pnpm test:litesvm
```

Use `pnpm verify:review` before pushing changes that affect the demo.
