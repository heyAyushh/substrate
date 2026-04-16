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

Regenerate and compile the Codama clients when IDLs change:

```bash
pnpm --filter @trust-substrate/program-clients build
```

Run Rust program and model tests:

```bash
pnpm test:rust
```

Run LiteSVM protocol tests through Anchor:

```bash
pnpm test:litesvm
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

`pnpm test:anchor` is an alias for `pnpm test:litesvm`. It runs `anchor test --skip-lint --skip-local-validator --skip-deploy`, which builds the Anchor workspace and then runs the granular LiteSVM suites in `crates/trust_substrate_litesvm_tests/tests`.

The main protocol flow is covered by the LiteSVM suite, including:

- identity creation
- task creation
- direct receipt emission
- task status sync from receipts
- delegation creation, revocation, and future revocation grace windows
- delegated receipt emission
- history checkpoint creation and rotation
- receipt inclusion proof verification
- reputation domain creation and receipt application
- stake escrow, cooldown unstake, dispute-resolution slashing, verdict stale windows, and slash replay rejection

The pure Rust command intentionally excludes `trust_substrate_litesvm_tests`, because those tests load built SBF artifacts from `target/deploy`. Use `pnpm test:anchor` when instruction/account behavior changed.

## Verification Tests

`pnpm test:verification` runs every file under `tests/verification/*.test.ts`.

These checks keep the lightweight repo-consistency lane honest. They cover:

- the archive snapshot script behavior
- the shared protocol error taxonomy

## Surfpool Final E2E

Surfpool replaces devnet as the final end-to-end gate.

`pnpm test:surfpool` runs `scripts/surfpool-e2e.sh`, which:

1. builds the Anchor workspace
2. starts Surfpool directly at the local endpoint
3. sets `ANCHOR_TEST_RUN` so the validator-backed TypeScript E2E suite runs instead of the default LiteSVM script
4. lets Surfpool auto-deploy the declared Anchor program IDs
5. runs the E2E suite against Surfpool with Anchor deployment skipped

Default local endpoint:

- RPC: `http://127.0.0.1:8899`
- Websocket: `ws://127.0.0.1:8900`

The harness intentionally lets Surfpool own local program deployment, then runs Anchor with `--skip-deploy`. That avoids deploying generated `target/deploy/*-keypair.json` IDs that do not match the declared program IDs used by the TypeScript tests.

## Expected Local Order

1. `pnpm test:packages`
2. `pnpm test:rust`
3. `pnpm test:anchor`
4. `pnpm test:verification`
5. `pnpm test:surfpool`

Keep Surfpool as the final local gate. Devnet is not the required release gate
for this repository.
