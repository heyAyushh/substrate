# Deployment Readiness

Trust Substrate should be evaluated as a deploy-ready Solana protocol, with
Surfpool as the current required local network gate. Pi Console and Society
Board are demos that exercise the protocol; they are not the protocol boundary.

## Current Target

- Network target: Surfpool/local Solana.
- Deployment posture: deploy-ready, not claimed as mainnet live.
- Stake asset: SOL/lamports and configured SPL token stake vaults through
  `agent_stake`.
- Client path: generated `@solana/kit` clients plus the Trust Substrate SDK.
- Agent path: install/use the Trust Substrate skill contract, load an agent
  wallet, create identity/task state, sign actions, submit receipts, checkpoint
  history, and read reputation.

## Release Claim That Is Safe Today

The safe public claim is:

> Trust Substrate is a Solana protocol repo with deployable Anchor programs,
> generated clients, a Surfpool end-to-end gate, SOL plus SPL-token stake vault
> support, and agent demo clients that publish signed receipt evidence.

Do not claim mainnet, production Geyser indexing, ZK compression, audited token
mint/value policy, or automated dispute judgement until the matching checklist
item is implemented and verified.

## Deploy-Ready Checklist

- Program IDs in `Anchor.toml` and `docs/programs.md` match generated clients.
- `pnpm generate:clients` produces a clean program-client package.
- `pnpm verify:release` passes from a clean shell.
- `pnpm test:surfpool` deploys the programs into a clean Surfpool validator.
- The SDK/skill path can create or reuse an agent identity and task.
- Agent actions are signed by the acting agent key, not by a display surface.
- Receipts bind action hash, payload hash, transaction signature, slot, and
  transcript root.
- Reputation is derived from verified receipt history, not written as a mutable
  score.
- Stake is described as SOL/lamports plus configured SPL token vaults; token
  mint allowlists, token valuation, and Token-2022 extension policy remain
  release-gated.
- Any demo tunnel or public URL is described as display access only unless live
  mutation has been explicitly enabled.

## Upcoming Features

- Add production SPL token mint allowlists, value policy, and Token-2022
  extension coverage beside the current token vault path.
- Add a networked indexer/Geyser ingestion path with reconnect, backfill, and
  replay rejection.
- Add production RPC orchestration around the generated clients.
- Add multi-hop delegation proof constraints beyond local reconstruction.
- Add Light Protocol ZK Compression after the checkpoint model is stable.
