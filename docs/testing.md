# Testing

## Commands

Run the full local suite:

```bash
pnpm test
```

Run package tests only:

```bash
pnpm test:packages
```

Run Rust program tests:

```bash
pnpm test:rust
```

Run the verification contract:

```bash
pnpm test:verification
```

Run the Anchor flow directly:

```bash
pnpm test:anchor
```

Run the Surfpool end-to-end gate:

```bash
pnpm test:surfpool
```

## Anchor test flow

`pnpm test:anchor` runs the Anchor test suite against the local validator flow used by the workspace.

The main on-chain integration test is `tests/trust_substrate.ts`. It covers the local end-to-end path for:

- identity creation
- task creation
- receipt emission
- delegation creation
- history checkpointing
- reputation application

## Surfpool final E2E

Surfpool replaces devnet as the final end-to-end gate.

`pnpm test:surfpool` runs `scripts/surfpool-e2e.sh`, which:

1. builds the Anchor workspace
2. starts Surfpool locally when needed
3. waits for RPC and websocket readiness
4. runs the real Anchor test suite against Surfpool
5. cleans up the Surfpool process it started

Default local endpoint:

- RPC: `http://127.0.0.1:8899`
- Websocket: `ws://127.0.0.1:8900`

The harness uses `tests/surfpool/txtx.yml` when that manifest is present. Without that manifest, it starts Surfpool against the default local endpoint contract and runs the Anchor suite with deployment skipped after the local build.

The Surfpool gate currently passes locally. If it fails, inspect the log path printed by the harness before changing code.

## Expected local order

1. `pnpm test:packages`
2. `pnpm test:rust`
3. `pnpm test:anchor`
4. `pnpm test:surfpool`

The verification contract explicitly keeps devnet out of the required gate.
