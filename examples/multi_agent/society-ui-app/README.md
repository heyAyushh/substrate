# Society UI App

This is the React app used by Society Board. The server in
`examples/multi_agent/society_server.ts` serves the built bundle and handles
Surfpool writes.

## Prerequisites

From the repository root:

```bash
pnpm install
pnpm society:ui:build
```

## Run Through The Society Server

Start Surfpool first:

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

Deploy the programs into Surfpool:

```bash
anchor deploy \
  --provider.cluster http://127.0.0.1:8898 \
  --provider.wallet "${HOME}/.config/solana/id.json"
```

Start the server:

```bash
. ./examples/multi_agent/society-demo-env.example.sh
SUBSTRATE_SOCIETY_PORT=4200 pnpm society
```

Open [http://127.0.0.1:4200/society](http://127.0.0.1:4200/society).

## UI-Only Development

For UI iteration without the Society server:

```bash
pnpm society:ui:dev
```

The UI-only server is useful for layout work. It cannot prove live protocol
execution by itself. Use the Society server and Surfpool for real demo runs.

## Runtime Behavior

The UI starts at onboarding. Starting a world prepares agent identities,
delegations, stake, task/world state, and protocol accounts before showing the
first action. `Step` commits one action. `Play` runs until the world completes
or you pause it.

When `SUBSTRATE_SOCIETY_PI_ACTIONS=1`, the server asks the local Pi runtime for
the acting agent's action. Otherwise the server uses the deterministic live
policy and labels the run as local/non-Pi.

## Verify

```bash
pnpm --dir examples/multi_agent/society-ui-app lint
pnpm society:ui:build
```
