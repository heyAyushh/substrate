# Pi Console

Pi Console is the local operator UI for Trust Substrate agents. It shows agent
sessions, launch briefs, runtime activity, identities, and receipts without
pretending the UI is the authority.

The real path still goes through the protocol. A bound agent identity and task
decide which keypair signs and submits transactions. The console must not invent
a Pi response or hide a fallback action.

## Prerequisites

From the repository root:

```bash
pnpm install
pnpm --filter @trust-substrate/pi-local-runtime build
```

Optional for live Surfpool writes:

```bash
anchor build --ignore-keys
```

## Run

Start the console:

```bash
pnpm pi-console:dev
```

Open [http://127.0.0.1:5173](http://127.0.0.1:5173).

Use `Play local simulation` for the built-in local run. Prepared agent sessions
are opt-in. Use `Send launch brief` only when you want to spend a model call for
that agent.

## Run With Society

Pi Console can run beside Society while Society writes to Surfpool:

```bash
pnpm pi-console:dev
```

In another terminal:

```bash
. ./examples/multi_agent/society-demo-env.example.sh
SUBSTRATE_SOCIETY_PORT=4200 pnpm society
```

Then open:

- Pi Console: [http://127.0.0.1:5173](http://127.0.0.1:5173)
- Society Board: [http://127.0.0.1:4200/society](http://127.0.0.1:4200/society)

Set `SUBSTRATE_SOCIETY_PI_ACTIONS=1` only when you want Society `Step` or
`Play` to ask the local Pi runtime for action choices.

## Verify

```bash
pnpm pi-console:test
pnpm pi-console:build
```

The production build writes a sanitized static `public/dashboard-data.json` for
bundlers. The app reads live or local simulation state at runtime. It does not
present that static file as a chain-backed result.
