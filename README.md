# Trust Substrate

Agents need wallets, but they also need memory, receipts, delegation, and reputation.

Trust Substrate is a local Solana trust layer for autonomous agents. It stores
an append-only execution graph and derives reputation from verified history
instead of writing a mutable score.

## What Is Here

This repository contains a local protocol baseline:

- Anchor programs for identity, tasks, receipts, delegation, checkpoints, reputation, and stake-backed disputes
- a shared Rust core crate for constants, errors, Merkle proofs, and local model tests
- Codama-generated `@solana/kit` program clients
- deterministic TypeScript SDK helpers for local graph, proof, and reputation modeling
- a local durable indexer that rebuilds execution graphs from receipts
- Anchor/LiteSVM, Rust, TypeScript, verification, and Surfpool test paths
- documentation for architecture, development, testing, security, and roadmap decisions

This is not a production deployment. The current goal is a correct local
baseline that can be hardened before networked indexing, compression
integrations, or production deployment. The active production-readiness
checklist is tracked in [Production Readiness To-Do](docs/production-readiness.md).

## Protocol Programs

The workspace has these deployable Anchor programs:

- `identity_registry`
- `task_registry`
- `receipt_emitter`
- `delegation_engine`
- `proof_verifier`
- `reputation_accumulator`
- `dispute_resolver`
- `agent_stake`

Shared protocol constants and pure model logic live in `crates/trust_substrate_core`.

## Out of scope for v0.1

- Light Protocol ZK Compression integration
- remote event streaming or Geyser ingestion
- production RPC orchestration beyond the generated local client package
- mainnet deployment hardening
- full multi-hop delegation proof chains
- automated dispute outcome decisions from private receipt payload text
- production claims around cross-task and cross-domain ordering until the
  additional readiness tests land

## Documentation

- [Architecture](docs/architecture.md)
- [Program Interface](docs/programs.md)
- [Development](docs/development.md)
- [Testing](docs/testing.md)
- [Senior Reviewer Guide](docs/reviewer-guide.md)
- [Security](docs/security.md)
- [Production Readiness To-Do](docs/production-readiness.md)
- [Roadmap](docs/roadmap.md)
- [Agent Instructions](AGENTS.md)

## Repository Layout

```text
crates/trust_substrate_core/  Shared protocol constants, errors, Merkle logic, and model tests
crates/trust_substrate_litesvm_tests/  LiteSVM protocol integration tests
programs/                    Anchor protocol programs
packages/sdk/                 Deterministic local SDK helpers
packages/program-clients/     Codama-generated @solana/kit clients from Anchor IDLs
packages/indexer/             Local durable execution graph indexer
tests/                        TypeScript package, Surfpool, and verification tests
scripts/                      Local automation scripts
docs/                         Project documentation
examples/                     Local agent simulations
```

## Toolchain

Validated locally:

- Anchor CLI `1.0.0`
- Solana CLI `3.1.13`
- Surfpool `1.0.0`
- LiteSVM `0.10.0`
- pnpm `10.33.0`
- TypeScript `5.7.3`

Repository pins:

- `@anchor-lang/core` `1.0.0`
- `packageManager` `pnpm@10.33.0`
- `Anchor.toml` `anchor_version = "1.0.0"`

## Quick Start

Install dependencies:

```bash
pnpm install
```

Regenerate the typed program clients from the current IDLs:

```bash
pnpm generate:clients
```

Run the local unit and model checks:

```bash
pnpm test
```

Run the Anchor flow:

```bash
pnpm test:anchor
```

`pnpm test:anchor` builds the programs and runs the granular LiteSVM protocol suites without starting a validator.

Run the Surfpool end-to-end gate:

```bash
pnpm test:surfpool
```

Surfpool is the required final local E2E environment. Devnet is not the release gate for this project.

## TDD Workflow

Every protocol behavior starts as a failing test:

1. Write the smallest test that describes the behavior.
2. Run it and confirm it fails for the expected reason.
3. Implement the smallest passing change.
4. Re-run the focused test.
5. Run the wider local suite.
6. Use LiteSVM for protocol integration and Surfpool as the final end-to-end gate.

Do not add protocol behavior that has no local test.

## Local Flow

The current local path is:

1. Create an agent identity PDA.
2. Create a task PDA under that identity.
3. Emit ordered receipts for meaningful execution steps.
4. Create scoped delegation records for handoffs.
5. Checkpoint receipt history roots.
6. Apply receipts to derived reputation state.
7. Escrow stake for agents that opt into slashable dispute resolution.
8. Rebuild the execution graph through the local indexer.

Receipts are the source of truth. Reputation is derived from that receipt graph.

## Useful Commands

```bash
pnpm test
pnpm test:surfpool
```

`pnpm test` and `pnpm test:surfpool` may print upstream Anchor or Solana
warnings. Passing status is determined by command exit code.

## Contributing Rules

- Use Conventional Commits.
- Keep commits focused and reviewable.
- Prefer existing Anchor, Solana, LiteSVM, TypeScript, and Surfpool tooling over custom infrastructure.
- Keep reputation derived from verified execution history.
- Do not use devnet as the required verification gate.
- Read [AGENTS.md](AGENTS.md) before making agent-driven changes.
