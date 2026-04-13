# Archive Durability

Trust Substrate stores the semantic execution graph off-chain and anchors it with on-chain hashes and checkpoints. A local indexer snapshot is therefore operational evidence: if it disappears, the on-chain roots remain valid but consumers lose the fastest replay path.

## Snapshot Rotation

Use `scripts/snapshot.sh` to copy the current local indexer snapshot into a timestamped archive:

```bash
bash scripts/snapshot.sh
```

Defaults:

- source: `examples/agent_loop/.snapshot/indexer.json`
- archive directory: `examples/agent_loop/.snapshot/archive`
- retention: `10` archived snapshots

Overrides:

```bash
TRUST_SUBSTRATE_SNAPSHOT_SOURCE=/path/to/indexer.json \
TRUST_SUBSTRATE_ARCHIVE_DIR=/path/to/archive \
TRUST_SUBSTRATE_ARCHIVE_RETENTION=20 \
bash scripts/snapshot.sh
```

The script only prunes files named `indexer-*.json` inside the configured archive directory.

## Replay Model

A consumer reconstructs the full view from:

- on-chain identity, task, receipt, delegation, checkpoint, reputation, and stake accounts
- archived local indexer snapshots
- off-chain blobs referenced by receipt payload hashes

Snapshots are a convenience layer, not a replacement for chain replay. For production replay, run an archive-capable RPC path or a Photon-style indexer, then hydrate semantic payloads from IPFS, Arweave, S3, git, or another pinned blob backend.

## Operator Checklist

- Keep at least one archive outside the application host.
- Pin evidence blobs before publishing receipts that depend on them.
- Treat missing blobs as challengeable, not as neutral.
- Verify restored snapshots by loading them through `LocalDurableIndexer.loadSnapshot`.
