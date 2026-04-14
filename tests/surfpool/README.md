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

1. Builds the Anchor workspace.
2. Starts Surfpool at the local endpoint.
3. Lets Surfpool auto-deploy the declared Anchor program IDs.
4. Runs the validator-backed TypeScript tests with Anchor deployment skipped.

To run a targeted Surfpool suite, pass the test path:

```bash
./scripts/surfpool-e2e.sh tests/audit_receipts.ts
```

The `tests/surfpool/surfpool_e2e.ts` file is a lightweight smoke contract for the Surfpool endpoint. The main harness still runs the full Anchor suite from `tests/*.ts`.

If the Surfpool gate fails, inspect the log path printed by the harness before changing code or test expectations.
