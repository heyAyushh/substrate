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
2. Reuses an already-running Surfpool endpoint if `ANCHOR_PROVIDER_URL` or `SURFPOOL_RPC_URL` is already healthy.
3. Starts Surfpool locally when needed.
4. Runs the real Anchor test suite against the Surfpool RPC URL.
5. Cleans up the Surfpool process it started.

To point the harness at an existing local Surfpool instance, set `SURFPOOL_RPC_URL` before running it.

The `tests/surfpool/surfpool_e2e.ts` file is a lightweight smoke contract for the Surfpool endpoint. The main harness still runs the Anchor suite from `tests/trust_substrate.ts`.

If the Surfpool deploy path fails, the current blocker is the TPU client slot-leader lookup during Anchor deploy, which returns `Invalid slot range` against `ws://127.0.0.1:8900` on Surfpool 1.0.0. The harness reports that explicitly and exits non-zero.
