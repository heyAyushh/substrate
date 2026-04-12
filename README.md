# Trust Substrate

Agents need wallets, but they also need memory, receipts, delegation, and reputation.

Trust Substrate is a local-first Solana infrastructure primitive for autonomous agents. The core idea is simple: do not store a score. Store an append-only execution graph, then derive reputation from verified history.

This repository contains the MVP implementation:

- an Anchor program for identity, task, receipt, delegation, checkpoint, and reputation records
- deterministic TypeScript SDK helpers
- a local durable indexer that rebuilds execution graphs from receipts
- Rust, TypeScript, Anchor, and Surfpool test coverage
- local documentation for architecture, development, testing, security, and roadmap decisions

## Current status

This is an MVP, not a production deployment.

The original product plan names six program surfaces: identity registry, task registry, receipt emitter, delegation engine, reputation accumulator, and proof verifier. The current implementation keeps those surfaces inside one Anchor program so the protocol can be tested end to end before splitting deployment boundaries.

Implemented today:

- PDA-based agent identity roots
- canonical task records with subtask metadata
- receipt accounts for assignment, handoff, completion, and dispute events
- scoped delegation records with revocation state
- per-agent history checkpoint accounts
- reputation accumulators derived from receipt history
- deterministic SDK and indexer models
- local Surfpool end-to-end verification

Not implemented yet:

- Light Protocol ZK Compression integration
- remote event streaming or Geyser ingestion
- production RPC client wrappers generated from Codama
- separate deployed programs for every protocol surface
- advanced on-chain Merkle proof verification

## Documentation

- [Architecture](docs/architecture.md)
- [Program Interface](docs/programs.md)
- [Development](docs/development.md)
- [Testing](docs/testing.md)
- [Security](docs/security.md)
- [Roadmap](docs/roadmap.md)
- [MVP Local Verification](docs/verification/mvp-local-verification.md)
- [Agent Instructions](AGENTS.md)

## Repository layout

```text
programs/trust_substrate/     Anchor program
packages/sdk/                 Deterministic local SDK helpers
packages/indexer/             Local durable execution graph indexer
tests/                        TypeScript, Anchor, Surfpool, and verification tests
scripts/                      Local automation scripts
docs/                         Project documentation
```

## Toolchain

Validated locally:

- Anchor CLI `0.32.1`
- Solana CLI `3.1.13`
- Surfpool `1.0.0`
- pnpm `10.33.0`
- TypeScript `5.7.3`

Repository pins:

- `@coral-xyz/anchor` `0.32.1`
- `packageManager` `pnpm@10.33.0`
- `Anchor.toml` `anchor_version = "0.32.1"`

## Quick start

Install dependencies:

```bash
pnpm install
```

Run the local unit and model checks:

```bash
pnpm test
```

Run the Anchor flow:

```bash
pnpm test:anchor
```

Run the Surfpool end-to-end gate:

```bash
pnpm test:surfpool
```

The required final E2E environment is Surfpool, not devnet.

## TDD workflow

Every behavior starts as a failing test:

1. Write the smallest test that describes the behavior.
2. Run it and confirm it fails for the expected reason.
3. Implement the smallest passing change.
4. Re-run the focused test.
5. Run the wider local suite.
6. Use Surfpool as the final end-to-end gate.

Do not add protocol behavior that has no local test.

## MVP flow

The current local end-to-end path is:

1. Create an agent identity PDA.
2. Create a task PDA under that identity.
3. Emit ordered receipts for meaningful execution steps.
4. Create scoped delegation records for handoffs.
5. Checkpoint receipt history roots.
6. Apply receipts to derived reputation state.
7. Rebuild the execution graph through the local indexer.

The key invariant is that receipts are the source of truth. Reputation is derived from that receipt graph.

## Useful commands

```bash
pnpm test:packages
pnpm test:rust
pnpm test:verification
pnpm test:anchor
pnpm test:surfpool
pnpm lint
```

`anchor build` and `pnpm test:surfpool` may print upstream Anchor/Solana compiler warnings. Passing status is determined by command exit code.

## Contributing rules

- Use Conventional Commits.
- Keep commits focused and reviewable.
- Prefer existing Anchor, Solana, TypeScript, and Surfpool tooling over custom infrastructure.
- Keep reputation derived from verified execution history.
- Do not use devnet as the required verification gate.
- Read [AGENTS.md](AGENTS.md) before making agent-driven changes.
