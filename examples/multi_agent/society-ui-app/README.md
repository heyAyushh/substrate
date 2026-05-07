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
`examples/multi_agent/society-demo-env.example.sh`. Live write routes stay
loopback-only unless `SUBSTRATE_ALLOW_PUBLIC_LIVE_MUTATION=1` is set for an
intentional public demo.

Open `/society`. The UI waits until `Go live`, then prepares a paused Surfpool
session, shows the agent grid, and links accounts and transactions to Surfpool
Studio and Solana Explorer. Press `Step` for one signed action or `Play` to keep
committing actions. After a refresh, use `Resume last` to reopen the latest
server-side session explicitly.

Each board agent has a local identity folder and Solana keypair managed by the
server. When an action is committed, the acting agent key signs the action
before submission and signs the after-action state commitment before the
delegated receipt enters the shared society task. The browser board reads the
committed Surfpool world state; it is not the validator. Model-backed Pi prompts
are still explicit; the board does not auto-launch LLM calls.

Set `SUBSTRATE_SOCIETY_PI_ACTIONS=1` only when you want `Step` or `Play` to call
the local Pi runtime. The system prompt includes the commit-ready allowed action
set for that agent and tick, and the receipt evidence records the Pi prompt and
response hashes as commitments. Tests use an in-test recording client only;
production never fabricates a Pi response.

The Surfpool tab also shows a program coverage card for all nine deployable
programs. It lists the evidence each program contributes to the board and the
honest boundary for capabilities that are not auto-run in the normal convoy demo.
