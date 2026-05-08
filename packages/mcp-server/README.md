# Trust Substrate MCP Server

Local MCP server for inspecting Trust Substrate indexer snapshots and, when
explicitly enabled, previewing or submitting Solana protocol writes.

## Build

```bash
pnpm --filter @trust-substrate/mcp-server build
```

## Run

```bash
TRUST_SUBSTRATE_PROJECT_ROOT="$(pwd)" \
TRUST_SUBSTRATE_SNAPSHOT_PATH="examples/agent_loop/.snapshot/indexer.json" \
pnpm --filter @trust-substrate/mcp-server start
```

The server uses stdio and exposes read-only tools for snapshot summaries,
agent profiles, task traces, domain summaries, and write-mode status.

## Optional Chain Writes

Write tools are hidden unless `TRUST_SUBSTRATE_MCP_ENABLE_WRITES=1` is set.
When enabled, the server loads an existing Solana keypair from
`SUBSTRATE_KEYPAIR` and uses the SDK transaction client. It never edits local
snapshots and never creates or overwrites keypairs.

```bash
TRUST_SUBSTRATE_PROJECT_ROOT="$(pwd)" \
TRUST_SUBSTRATE_SNAPSHOT_PATH="examples/agent_loop/.snapshot/indexer.json" \
TRUST_SUBSTRATE_MCP_ENABLE_WRITES=1 \
SUBSTRATE_RPC_URL="http://127.0.0.1:8899" \
SUBSTRATE_RPC_SUBSCRIPTIONS_URL="ws://127.0.0.1:8900" \
SUBSTRATE_KEYPAIR="$HOME/.config/solana/id.json" \
pnpm --filter @trust-substrate/mcp-server start
```

Every write tool defaults to `mode: "preview"`. A real transaction requires
`mode: "submit"` and `confirm: true` in the tool input.
