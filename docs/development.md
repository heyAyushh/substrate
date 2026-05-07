# Development

## Local setup

1. Install the pinned toolchain.
2. Install dependencies from the repository root with `pnpm install`.
3. Run the local checks once before making changes:

```bash
pnpm test
```

4. Regenerate the typed program clients whenever an IDL changes:

```bash
pnpm generate:clients
```

## Toolchain

Validated on this machine:

- Node `v25.6.0`
- pnpm `10.33.0`
- npm `11.8.0`
- Rust `1.92.0`
- Cargo `1.92.0`
- Solana CLI `3.1.13`
- Anchor CLI `1.0.0`
- Surfpool `1.0.0`
- LiteSVM `0.10.0`

Repository pins:

- `packageManager`: `pnpm@10.33.0`
- `@anchor-lang/core`: `1.0.0`
- `Anchor.toml`: `anchor_version = "1.0.0"`

## Developer workflow

- Make one focused change at a time.
- Start with a failing test for the behavior you want.
- Implement the smallest change that makes that test pass.
- Run the narrowest local test first, then the wider suite.
- Keep protocol changes documented in tests, not just in prose.
- Use LiteSVM for normal protocol instruction/account integration tests.
- Do not use devnet as the final verification gate. Surfpool is the final end-to-end environment.
- Regenerate `packages/program-clients/src/generated` from `target/idl/*.json` instead of hand-writing RPC wrappers.

## TDD workflow

1. Add or update the smallest test that describes the behavior.
2. Run that test and confirm it fails for the expected reason.
3. Implement the minimal code path.
4. Re-run the focused test.
5. Run the relevant package, Rust, LiteSVM/Anchor, and Surfpool checks before moving on.

The local verification order and command guidance live in `docs/testing.md`.

## Live society board

The society dashboard is Surfpool-backed end to end. It starts a live world
session, advances one confirmed action at a time, stores the compact world
state in the `task_registry` society world account, and writes a final proof
artifact when the run completes.

Build the dashboard bundle before starting the demo server:

```bash
pnpm --dir examples/multi_agent/society-ui-app build
```

Start a local Surfpool instance on the ports the society server expects:

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

Then start the society server from the repository root:

```bash
. ./examples/multi_agent/society-demo-env.example.sh
pnpm society
```

For a public demo, set these before `pnpm society`:

```bash
export SUBSTRATE_PUBLIC_SOCIETY_URL="https://society.example.com"
export SUBSTRATE_PUBLIC_RPC_URL="https://rpc.example.com"
export SUBSTRATE_PUBLIC_SURFPOOL_STUDIO_URL="https://studio.example.com"
```

Live write routes stay loopback-only by default even when public links are set.
Set `SUBSTRATE_ALLOW_PUBLIC_LIVE_MUTATION=1` only for an intentional public demo
where anyone with the URL may advance the local Surfpool session.

Open the printed `/society` URL in a browser. Nothing starts on page load. Use
`Go live` to create a live session, `Resume last` to reopen the latest
server-side session intentionally, `Step` to commit one pending action at a
time, and `Play` / `Pause` to let the server stream confirmed actions
continuously. The server refuses to commit to a non-local RPC unless
`SUBSTRATE_ALLOW_REMOTE_RPC=1` is set explicitly.
