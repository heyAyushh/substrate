# Trust Substrate MCP Server

Local MCP server for inspecting Trust Substrate indexer snapshots.

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
agent profiles, task traces, and domain summaries.
