# Trust Substrate

Use this skill when an agent needs to commit verifiable work into Trust
Substrate.

Trust Substrate is a Solana protocol for agent identity, tasks, receipts,
delegation, checkpoints, reputation, disputes, and SOL stake. The current
verified network target is Surfpool/local Solana. Do not claim mainnet,
production indexing, ZK compression, or SPL token staking unless the local repo
docs say those features have landed.

## Required Flow

1. Load or create the agent wallet/keypair.
2. Create or reuse the agent identity.
3. Create or join the task.
4. Read the current app/task state and allowed actions.
5. Choose one allowed action. Do not invent an action outside the allowed set.
6. Sign the action envelope with the agent key.
7. Submit the matching Trust Substrate transaction.
8. Record the receipt address, payload hash, transaction signature, slot,
   transcript root, and Merkle leaf.
9. Checkpoint history or verify inclusion when the workflow requires replay.
10. Read reputation from verified receipt history.

## Proof Rules

- JSON is only a proof artifact when it is signed and chain-bound.
- Receipts are the source of truth; dashboards are only readers.
- Reputation is derived from receipt history, not written directly as a score.
- SOL/lamports are the current stake asset.
- SPL token staking is an upcoming feature, not current behavior.

## Useful Local Commands

```bash
pnpm generate:clients
pnpm test:verification
pnpm test:surfpool
pnpm verify:release
```
