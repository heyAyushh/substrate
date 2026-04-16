# Off-Chain Storage And Threat Model

Scope tags are defined in [Scope Tags](scope-tags.md).

## Purpose

[on-chain] Trust Substrate anchors the minimum set of facts needed to audit agent behaviour.
[indexer] Everything else — execution transcripts, tool payloads, evidence blobs — lives off-chain.
[indexer] This document describes the split, the storage conventions, and the threats that motivate the gaming-resistance features tracked in the roadmap.

## On-Chain Vs Off-Chain Split

[on-chain] The Anchor programs only anchor what must be globally ordered and tamper-evident:

- identity authority and policy root
- task identity, title, status
- receipt header: identity, task, actor, kind, sequence, domain, previous receipt id, payload hash, optional delegation pointer
- delegation scope, revocation flag, expiry slot
- history checkpoint: epoch, root, previous root, leaf count
- reputation accumulator counters and weights
- stake escrow, unstake cooldowns, and slashing replay markers

[indexer] Off-chain storage holds everything that is too large or too fluid for the chain:

- full execution records (per-step transcripts, tool calls, model outputs)
- dispute evidence bundles
- attestation evidence
- agent-trace bundles exported for interop
- indexer snapshots and archives

[on-chain] The on-chain `payload_hash` commits to the canonical off-chain payload.
[indexer] A consumer replaying history must be able to fetch the blob by that hash and verify it byte-for-byte.

## Blob Backends

Any content-addressable store works. The reference set is:

- **IPFS**: `ipfs://<cid>`; CIDs are already hash-addressed, so the payload hash is the CID digest.
- **Arweave**: `ar://<txid>`; the indexer verifies the transaction's SHA-256 against the receipt `payload_hash`.
- **S3 / object storage**: `s3://bucket/key` with the `payload_hash` checked after fetch; suitable for private deployments.
- **Git**: `git+https://<repo>@<sha>:<path>`; useful for human-reviewed evidence (dispute bundles, attestation artefacts).

[sdk] The SDK DA-proof helper (task #11) accepts any of these URIs and resolves them through pluggable fetchers.
[sdk] The canonical payload hash is computed with `hashCanonical` from `packages/sdk/src/canonical.ts`; any backend that returns byte-identical content satisfies the check.

## Replay Model

[indexer] A consumer that trusts only the chain reconstructs state as follows:

1. Read receipts from the indexer or an RPC client, sorted by slot.
2. For each receipt, fetch the blob referenced by `payload.storage.uri` and verify `hashCanonical(blob) == receipt.payload_hash`.
3. Rebuild execution records, handoff chains, and task status transitions from the verified payloads.
4. Verify any checkpoint with an on-chain `LatestCheckpoint` pointer and a Merkle proof against the checkpoint root.
5. Derive reputation from the verified receipt history. The on-chain accumulator is only a permissionless cache/projection, not the source of truth.

[indexer] Blobs that are unreachable or mismatched are treated as missing receipts for replay purposes and flagged as availability faults.

## Gaming-Resistance Surface

The off-chain split introduces attack surface that on-chain guarantees cannot close alone. Each defence below is tracked as a concrete task in the roadmap.

### Data-availability proofs (task #11)

[sdk] A receipt whose payload blob is unreachable is indistinguishable from a forged one. At submit time, the SDK refuses to emit a receipt unless `verifyPayloadAvailable` resolves the blob and matches its hash.
[indexer] Consumers repeat the check at replay.

### Availability challenges (task #12)

[on-chain] After submission, a blob can disappear. A `challenge` receipt names a target receipt and a deadline slot.
[indexer] If the target author does not respond with a `challenge_response` by the deadline, the indexer treats the target as disputed and the reputation model weights it accordingly.

### Commit-reveal (task #13)

[on-chain] For payloads that must not leak before a deadline (sealed bids, blind reviews), the author emits a `commit` receipt with `hashCanonical(payload)` and later a `reveal` receipt with the payload.
[sdk] The SDK rejects reveals whose hash does not match the prior commit.
[indexer] Unrevealed commits past the deadline are weighted as disputes.

### Authority-rotation history (task #14)

[indexer] Selling a high-reputation identity must not silently transfer its reputation. The indexer exposes `authority_rotated` markers so consumers can inspect authority history.
[indexer] v1 does not apply automatic score decay because a payload-only marker can be forged by the current authority.
[on-chain] Reputation decay should be enabled only after an on-chain authority-rotation instruction makes the transition independently verifiable.

[on-chain] That condition now exists in the local baseline: `identity_registry` supports
both cooldown-gated authority rotation and guardian-gated emergency rotation.
[indexer] The indexer records the resulting `AuthorityRotated` mode so consumers can
differentiate deliberate succession from incident recovery before applying any
pre-rotation decay policy.

### Attestation filter (task #15)

[indexer] Sybil identities can flood the graph. Attestation receipts (`kyc`, `pop`, `dao_vote`, `review`) from independent attesters are indexed per target.
[indexer] The leaderboard exposes an `attestedOnly` filter so downstream apps can exclude unattested identities.

### Archive durability (task #16)

[indexer] Indexer snapshots and blobs must survive operator churn. Use
`scripts/snapshot.sh` to copy the current local indexer snapshot into a
timestamped archive.

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

[indexer] The script only prunes files named `indexer-*.json` inside the
configured archive directory. A consumer reconstructs the full view from
on-chain identity, task, receipt, delegation, checkpoint, reputation, and
stake accounts, archived local indexer snapshots, and off-chain blobs
referenced by receipt payload hashes.

[indexer] Snapshots are a convenience layer, not a replacement for chain
replay. Keep at least one archive outside the application host, pin evidence
blobs before publishing receipts that depend on them, treat missing blobs as
challengeable instead of neutral, and verify restored snapshots by loading them
through `LocalDurableIndexer.loadSnapshot`.

### Stake-backed dispute resolution (tasks #17, #18)

[on-chain] An attacker who loses nothing when caught can grind the system. The `agent_stake` program escrows SOL per identity, cooldown-gates unstaking, and supports two explicit slash paths: `slash_with_authority` for authority-mode stake against a real `dispute_resolved` receipt, and `slash_with_verdict` for verdict-mode stake against a `dispute_resolver` verdict account bound to a dispute receipt.
[on-chain] Both paths write replay markers and route funds into the protocol treasury PDA instead of a caller-chosen account.

## Threat Model Summary

| Threat                                  | Defence                                 | Task |
| --------------------------------------- | --------------------------------------- | ---- |
| Off-chain payload withheld at submit    | DA proof (`verifyPayloadAvailable`)     | #11  |
| Off-chain payload deleted after submit  | Availability challenge                  | #12  |
| Early payload disclosure                | Commit-reveal                           | #13  |
| Reputation resold with identity         | Authority-rotation history              | #14  |
| Sybil identity farming                  | Attestation filter                      | #15  |
| Snapshot loss                           | Archive rotation                        | #16  |
| Disputes without skin in the game       | Stake + slashing bound to receipts      | #17, #18 |

## Review Checklist

Before merging work that touches off-chain storage:

- every new receipt kind documents which blob schema it commits to
- the SDK computes `payload_hash` with `hashCanonical`, not an ad-hoc JSON stringify
- any new fetch path is covered by a DA-proof test (missing blob rejected, mismatched hash rejected)
- docs in this file name the task that implements each defence, so a reader can trace threats back to code
