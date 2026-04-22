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

1. uses the Anchor wallet as the default signer for the live pi-extension flow
2. sets `ANCHOR_TEST_RUN` so the validator-backed TypeScript E2E suite runs instead of the default LiteSVM script
3. delegates Surfpool startup, deployment, and teardown to `anchor test --validator surfpool`
4. runs the validator-backed TypeScript suite from `tests/*.ts`
5. includes `tests/surfpool/pi_extension_e2e.test.ts` in the same Surfpool-backed `ts-mocha` lane

Default local endpoint:

- RPC: `http://127.0.0.1:8899`
- Websocket: `ws://127.0.0.1:8900`

The repository now relies on Anchor's native Surfpool integration. That path
starts a clean Surfpool validator, deploys the declared program IDs from
`Anchor.toml`, and avoids the stale-state problems that came from reusing a
manually started local Surfpool instance.

The appended pi-extension E2E confirms a live `createSubstrateExtension` turn can:

- provision or reuse the identity/task PDAs
- initialize the domain catalog, register the task domain, and initialize the receipt emitter CPI authority
- emit a `completion` receipt and sync task status
- use the Anchor wallet by default for the extension signer
- re-attach with the same signer without recreating the identity or task

## Expected Local Order

1. `pnpm test:packages`
2. `pnpm test:rust`
3. `pnpm test:anchor`
4. `pnpm test:verification`
5. `pnpm test:surfpool`

Keep Surfpool as the final local gate. Devnet is not the required release gate
for this repository.
