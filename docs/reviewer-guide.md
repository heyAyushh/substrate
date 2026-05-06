# Senior Reviewer Guide

This guide is for engineers reviewing Trust Substrate beyond the public demo.
It separates what is implemented from what is intentionally out of scope.

## What This Branch Claims

- Trust Substrate is a local Solana protocol baseline for agent identity,
  ordered receipts, scoped delegation, checkpoints, derived reputation,
  disputes, and stake.
- Receipts are append-only execution evidence. Reputation is derived from
  verified receipt history, not written directly as a mutable score.
- The live society board is Surfpool-backed. `Go live` creates a server-owned
  session, writes the society world account, commits agent actions, exposes
  account and transaction links, and writes a final proof artifact.
- The browser does not auto-start or auto-resume hidden sessions. `Go live` and
  `Resume last` are explicit user actions.

## What This Branch Does Not Claim

- No mainnet deployment.
- No production indexer or Geyser ingestion pipeline.
- No Light Protocol ZK Compression integration yet.
- No production RPC orchestration beyond local Surfpool and generated clients.
- No automated dispute outcome engine that reads private evidence text.
- No claim that temporary Cloudflare quick tunnels are production
  infrastructure.

For the full list of accepted gaps, see
[Production Readiness](production-readiness.md).

## Suggested Review Path

1. Start with [README](../README.md) for the protocol boundary.
2. Read [Architecture](architecture.md) and [Programs](programs.md) for account
   and instruction responsibilities.
3. Review the on-chain program split:
   - `programs/identity_registry`
   - `programs/task_registry`
   - `programs/receipt_emitter`
   - `programs/delegation_engine`
   - `programs/proof_verifier`
   - `programs/reputation_accumulator`
   - `programs/dispute_resolver`
   - `programs/agent_stake`
4. Review shared protocol constants, errors, and pure model logic in
   `crates/trust_substrate_core`.
5. Review the generated client boundary in `packages/program-clients`.
6. Review SDK transaction and identifier helpers in `packages/sdk/src`.
7. Review the live society path:
   - `programs/task_registry/src/state/society_world.rs`
   - `programs/task_registry/src/instructions/create_society_world.rs`
   - `programs/task_registry/src/instructions/update_society_world.rs`
   - `examples/multi_agent/society_core.js`
   - `examples/multi_agent/society_live.ts`
   - `examples/multi_agent/society_server.ts`
   - `examples/multi_agent/society-ui-app/src/App.tsx`
8. Review the tests that lock the core behavior:
   - `tests/verification/society_core.test.js`
   - `tests/verification/society_live.test.ts`
   - `tests/verification/society_ui_static.test.ts`
   - `tests/verification/society_world_tx_size.test.ts`
   - `crates/trust_substrate_litesvm_tests/tests/society_world.rs`

## Checks To Run First

Fast review gate:

```bash
pnpm verify:review
```

Wider local gate:

```bash
pnpm test
```

Final local E2E gate:

```bash
pnpm test:surfpool
```

Run the Surfpool E2E gate from a clean local shell where the default Surfpool
RPC ports are free. The reviewer demo in this branch normally uses
`127.0.0.1:8898` so it does not collide with another local Surfpool on `8899`;
do not run the full E2E gate against a shared validator that someone is already
using.

For manual society demo verification, follow
[Testing: Society Example Verification](testing.md#society-example-verification).

## Review Questions Worth Asking

- Are all authority checks explicit and test-backed?
- Are PDA seeds stable, documented, and collision-resistant for the intended
  scope?
- Can any receipt be replayed, duplicated, or applied to the wrong task/domain?
- Can reputation be changed without verified receipt evidence?
- Can delegated actions escape their intended identity, task, or scope?
- Does the society world account stay inside the transaction size budget?
- Does the UI ever imply that Surfpool is writing when it is only idle in the
  browser?

## Current Reviewer-Facing Demo Links

These are temporary quick-tunnel links for review convenience only:

- App: `https://plumbing-sparc-pumps-earthquake.trycloudflare.com/society?view=world&entered=1`
- Studio: `https://skip-immediate-paragraph-posing.trycloudflare.com/accounts`
- RPC: `https://pic-subjective-bias-locally.trycloudflare.com`

If the tunnels expire, restart the society server with the environment shown in
`examples/multi_agent/society-demo-env.example.sh`.
