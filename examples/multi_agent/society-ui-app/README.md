# Agent Society UI

React UI for the Surfpool-backed agent society demo.

Build the browser bundle:

```bash
pnpm --dir examples/multi_agent/society-ui-app build
```

Run it through the society server from the repository root:

```bash
SUBSTRATE_SOCIETY_PORT=4177 \
SUBSTRATE_RPC_URL="http://127.0.0.1:8898" \
SUBSTRATE_WS_URL="ws://127.0.0.1:8897" \
SUBSTRATE_SURFPOOL_STUDIO_URL="http://127.0.0.1:18488" \
node --experimental-strip-types examples/multi_agent/society_server.ts
```

For a public demo, set `SUBSTRATE_PUBLIC_SOCIETY_URL`,
`SUBSTRATE_PUBLIC_RPC_URL`, and `SUBSTRATE_PUBLIC_SURFPOOL_STUDIO_URL` to the
named tunnel or domain URLs. The sample shell file is
`examples/multi_agent/society-demo-env.example.sh`.

Open `/society`. The UI waits until `Go live`, then starts a Surfpool session,
shows the agent grid, and links accounts and transactions to Surfpool Studio
and Solana Explorer. After a refresh, use `Resume last` to reopen the latest
server-side session explicitly.
