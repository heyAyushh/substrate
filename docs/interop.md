# Agent Interop Surfaces

Trust Substrate exposes external agent protocols as adapters over the Solana
protocol state. These adapters do not replace the programs and do not become
the source of truth.

## A2A

`@trust-substrate/a2a-adapter` exports an A2A Agent Card at
`/.well-known/agent-card.json` and maps task evidence into A2A task metadata.
The card advertises Trust Substrate identity, receipts, reputation, stake,
checkpoint, dispute, and MCP read capabilities. MCP write capability is listed
only when the caller configures it.

## AGNTCY ACP

`@trust-substrate/acp-adapter` exports ACP-style agent descriptors and simple
route handlers for agent discovery. It carries the same Trust Substrate
identity and capability metadata as A2A, using ACP naming.

## ERC-8004

`@trust-substrate/eip8004-exporter` builds registration, feedback, and
validation JSON files compatible with ERC-8004 metadata expectations. This is
metadata export only. It does not deploy EVM registries or claim that ERC-8004
is the Trust Substrate authority.

## MCP

`@trust-substrate/mcp-server` always exposes snapshot read tools and
`trust_substrate_write_status`. Chain write tools are registered only when
`TRUST_SUBSTRATE_MCP_ENABLE_WRITES=1` is set.

Write tools are chain-only and safe by default:

- local snapshots are never edited
- keypairs are loaded from `SUBSTRATE_KEYPAIR`, never created or overwritten
- every write defaults to `mode: "preview"`
- submitting requires `mode: "submit"` and `confirm: true`
- slash, unstake, finalize, and similar stake operations are marked destructive

The write tools call the existing SDK transaction client, so program authority
stays on Solana.
