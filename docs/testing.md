# Testing

## Commands

Run the full local package, Rust, and verification suite:

```bash
pnpm test
```

Run package tests only:

```bash
pnpm test:packages
```

Run Rust program and model tests:

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

## Anchor Test Flow

`pnpm test:anchor` runs the Anchor test suite against the local validator flow used by the workspace.

The main on-chain integration test is `tests/trust_substrate.ts`. It covers the local path for:

- identity creation
- task creation
- direct receipt emission
- task status sync from receipts
- delegation creation and revocation
- delegated receipt emission
- history checkpoint creation and rotation
- receipt inclusion proof verification
- reputation domain creation and receipt application

## Verification Tests

`pnpm test:verification` runs every file under `tests/verification/*.test.ts`.

The verification layer checks the local acceptance contract, including:

- required local command order
- Surfpool as the final gate
- no required devnet gate
- deployable protocol program declarations
- feature-owned instruction module layout

## Surfpool Final E2E

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

## Expected Local Order

1. `pnpm test:packages`
2. `pnpm test:rust`
3. `pnpm test:verification`
4. `pnpm test:anchor`
5. `pnpm test:surfpool`

The verification contract explicitly keeps devnet out of the required gate.
