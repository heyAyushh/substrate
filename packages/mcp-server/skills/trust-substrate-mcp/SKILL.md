---
name: trust-substrate-mcp
description: Inspect Trust Substrate snapshots and, when explicitly enabled, preview or submit Solana protocol writes with the bundled MCP server. Use when Codex needs receipt history, agent profiles, task handoffs, domain activity, or controlled Trust Substrate transaction tools.
---

# Trust Substrate MCP

## Overview

Use the project MCP server to inspect Trust Substrate indexer snapshots without hand-parsing JSON. Prefer the MCP tools for read-only analysis of agents, tasks, domains, stake state, attestations, and handoff chains.

The server can also expose Solana write tools. Write mode is opt-in and chain-only: it never edits snapshots, never creates keypairs, and every write tool defaults to `mode: "preview"`. Submitting requires `TRUST_SUBSTRATE_MCP_ENABLE_WRITES=1`, an existing `SUBSTRATE_KEYPAIR`, `mode: "submit"`, and `confirm: true`.

## Setup

Build the server before connecting it:

```bash
pnpm --filter @trust-substrate/mcp-server build
```

Run it as a stdio MCP server:

```bash
TRUST_SUBSTRATE_PROJECT_ROOT="$(pwd)" \
TRUST_SUBSTRATE_SNAPSHOT_PATH="examples/agent_loop/.snapshot/indexer.json" \
node packages/mcp-server/dist/index.js
```

`TRUST_SUBSTRATE_PROJECT_ROOT` bounds all snapshot reads. The server rejects snapshot paths outside that root and only accepts JSON files.

Enable chain write tools only when the user explicitly asks for real protocol writes:

```bash
TRUST_SUBSTRATE_PROJECT_ROOT="$(pwd)" \
TRUST_SUBSTRATE_SNAPSHOT_PATH="examples/agent_loop/.snapshot/indexer.json" \
TRUST_SUBSTRATE_MCP_ENABLE_WRITES=1 \
SUBSTRATE_RPC_URL="http://127.0.0.1:8899" \
SUBSTRATE_RPC_SUBSCRIPTIONS_URL="ws://127.0.0.1:8900" \
SUBSTRATE_KEYPAIR="$HOME/.config/solana/id.json" \
node packages/mcp-server/dist/index.js
```

## Tool Choice

- Use `trust_substrate_snapshot_summary` first to understand receipt count, task count, agents, domains, stake state, identity state, attester records, and leaderboard.
- Use `trust_substrate_agent_profile` when the user asks about one agent's activity, stake, attestations, authority rotations, or tool quality.
- Use `trust_substrate_task_trace` when the user asks what happened on one task, including receipts and handoffs. Use `offset` and `limit` for long task histories.
- Use `trust_substrate_domain_summary` when the user asks which domains are active or wants a specific domain's receipt and handoff counts.
- Use `trust_substrate_write_status` before any write attempt. If `ready` is false, do not call write tools.
- Use write tools in preview mode first. Only submit when the user explicitly requested a chain transaction and the tool call includes `confirm: true`.
- Use grouped write tools for protocol areas: identity, task, receipt, stake, reputation, attester, delegation, checkpoint, and dispute.

## Response Guidance

Default to `response_format: "markdown"` for direct explanations. Use `response_format: "json"` when composing results with other tools or when the user asks for raw structured data.

When a snapshot is missing, ask the user to run one of the local examples that writes a snapshot, such as `examples/agent_loop/run.ts`, before retrying the MCP call.

When a write fails, report the tool error directly. Do not retry destructive stake, slash, finalize, or verdict operations unless the user explicitly confirms the retry.
