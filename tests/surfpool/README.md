# Surfpool E2E Harness

This directory holds the local-only Surfpool smoke path for the MVP.

Default RPC endpoint:

- `http://127.0.0.1:8899`

Validated Surfpool CLI version on this machine:

- `surfpool 1.0.0`

Run the harness from the repository root:

```bash
./scripts/surfpool-e2e.sh
```

What the harness does:

1. Sets `ANCHOR_TEST_RUN` so Anchor runs the TypeScript validator suite instead of the LiteSVM Rust suite.
2. Delegates validator startup and deployment to `anchor test --validator surfpool`.
3. Runs the validator-backed TypeScript tests from `tests/*.ts`.
4. Includes `tests/surfpool/pi_extension_e2e.test.ts` in the same Surfpool-backed run.
5. Uses the Anchor wallet as the default signer for the pi-extension E2E path.

To run a targeted Surfpool suite, pass the test path:

```bash
./scripts/surfpool-e2e.sh tests/audit_receipts.ts
```

The shell harness waits for Surfpool RPC readiness before handing off to the
native Anchor Surfpool flow, which deploys the declared program IDs from
`Anchor.toml` before running the validator-backed TypeScript suite.

If the Surfpool gate fails, inspect the log path printed by the harness before changing code or test expectations.
