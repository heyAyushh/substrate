---
name: trust-substrate-mcp
description: Inspect Trust Substrate local indexer snapshots with the bundled MCP server. Use when Codex needs to summarize receipt history, review agent profiles, inspect task handoffs, check domain activity, or reason about local Trust Substrate execution evidence from `indexer.json` snapshots.
---

# Trust Substrate MCP

## Overview

Use the project MCP server to inspect Trust Substrate indexer snapshots without hand-parsing JSON. Prefer the MCP tools for read-only analysis of agents, tasks, domains, stake state, attestations, and handoff chains.

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

## Tool Choice

- Use `trust_substrate_snapshot_summary` first to understand receipt count, task count, agents, domains, stake state, identity state, attester records, and leaderboard.
- Use `trust_substrate_agent_profile` when the user asks about one agent's activity, stake, attestations, authority rotations, or tool quality.
- Use `trust_substrate_task_trace` when the user asks what happened on one task, including receipts and handoffs. Use `offset` and `limit` for long task histories.
- Use `trust_substrate_domain_summary` when the user asks which domains are active or wants a specific domain's receipt and handoff counts.

## Response Guidance

Default to `response_format: "markdown"` for direct explanations. Use `response_format: "json"` when composing results with other tools or when the user asks for raw structured data.

When a snapshot is missing, ask the user to run one of the local examples that writes a snapshot, such as `examples/agent_loop/run.ts`, before retrying the MCP call.
