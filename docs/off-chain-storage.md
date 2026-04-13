# Off-Chain Storage And Threat Model

## Purpose

Trust Substrate anchors the minimum set of facts needed to audit agent behaviour. Everything else — execution transcripts, tool payloads, evidence blobs — lives off-chain. This document describes the split, the storage conventions, and the threats that motivate the gaming-resistance features tracked in the roadmap.

## On-Chain Vs Off-Chain Split

The six Anchor programs only anchor what must be globally ordered and tamper-evident:

- identity authority and policy root
- task identity, title, status
- receipt header: identity, task, actor, kind, sequence, domain, previous receipt id, payload hash, optional delegation pointer
- delegation scope, revocation flag, expiry slot
- history checkpoint: epoch, root, previous root, leaf count
- reputation accumulator counters and weights

Off-chain storage holds everything that is too large or too fluid for the chain:

- full execution records (per-step transcripts, tool calls, model outputs)
- dispute evidence bundles
- attestation evidence
- agent-trace bundles exported for interop
- indexer snapshots and archives

The on-chain `payload_hash` commits to the canonical off-chain payload. A consumer replaying history must be able to fetch the blob by that hash and verify it byte-for-byte.

## Blob Backends

Any content-addressable store works. The reference set is:

- **IPFS**: `ipfs://<cid>`; CIDs are already hash-addressed, so the payload hash is the CID digest.
- **Arweave**: `ar://<txid>`; the indexer verifies the transaction's SHA-256 against the receipt `payload_hash`.
- **S3 / object storage**: `s3://bucket/key` with the `payload_hash` checked after fetch; suitable for private deployments.
- **Git**: `git+https://<repo>@<sha>:<path>`; useful for human-reviewed evidence (dispute bundles, attestation artefacts).

The SDK DA-proof helper (task #11) accepts any of these URIs and resolves them through pluggable fetchers. The canonical payload hash is computed with `hashCanonical` from `packages/sdk/src/canonical.ts`; any backend that returns byte-identical content satisfies the check.

## Replay Model

A consumer that trusts only the chain reconstructs state as follows:

1. Read receipts from the indexer or an RPC client, sorted by slot.
2. For each receipt, fetch the blob referenced by `payload.storage.uri` and verify `hashCanonical(blob) == receipt.payload_hash`.
3. Rebuild execution records, handoff chains, and task status transitions from the verified payloads.
4. Verify any checkpoint with an on-chain `LatestCheckpoint` pointer and a Merkle proof against the checkpoint root.
5. Derive reputation from the verified receipt history. There is no direct score-write path.

Blobs that are unreachable or mismatched are treated as missing receipts for replay purposes and flagged as availability faults.

## Gaming-Resistance Surface

The off-chain split introduces attack surface that on-chain guarantees cannot close alone. Each defence below is tracked as a concrete task in the roadmap.

### Data-availability proofs (task #11)

A receipt whose payload blob is unreachable is indistinguishable from a forged one. At submit time, the SDK refuses to emit a receipt unless `verifyPayloadAvailable` resolves the blob and matches its hash. Consumers repeat the check at replay.

### Availability challenges (task #12)

After submission, a blob can disappear. A `challenge` receipt names a target receipt and a deadline slot; if the target author does not respond with a `challenge_response` by the deadline, the indexer treats the target as disputed and the reputation model weights it accordingly.

### Commit-reveal (task #13)

For payloads that must not leak before a deadline (sealed bids, blind reviews), the author emits a `commit` receipt with `hashCanonical(payload)` and later a `reveal` receipt with the payload. The SDK rejects reveals whose hash does not match the prior commit. Unrevealed commits past the deadline are weighted as disputes.

### Authority-rotation history (task #14)

Selling a high-reputation identity must not silently transfer its reputation. The indexer exposes `authority_rotated` markers so consumers can inspect authority history, but v1 does not apply automatic score decay because a payload-only marker can be forged by the current authority. Reputation decay should be enabled only after an on-chain authority-rotation instruction makes the transition independently verifiable.

### Attestation filter (task #15)

Sybil identities can flood the graph. Attestation receipts (`kyc`, `pop`, `dao_vote`, `review`) from independent attesters are indexed per target. The leaderboard exposes an `attestedOnly` filter so downstream apps can exclude unattested identities.

### Archive durability (task #16)

Indexer snapshots and blobs must survive operator churn. The archive rotation script keeps the last N snapshots under `.snapshot/archive/`, and `docs/archive-durability.md` documents how a consumer replays state from chain plus an archived blob store.

### Stake-backed dispute resolution (tasks #17, #18)

An attacker who loses nothing when caught can grind the system. The `agent_stake` program escrows SOL per identity; a `dispute_resolved` receipt with `outcome = "agent_lost"` CPIs into `agent_stake::slash` against the losing party. Unstaking is cooldown-gated.

## Threat Model Summary

| Threat                                  | Defence                                 | Task |
| --------------------------------------- | --------------------------------------- | ---- |
| Off-chain payload withheld at submit    | DA proof (`verifyPayloadAvailable`)     | #11  |
| Off-chain payload deleted after submit  | Availability challenge                  | #12  |
| Early payload disclosure                | Commit-reveal                           | #13  |
| Reputation resold with identity         | Authority-rotation history              | #14  |
| Sybil identity farming                  | Attestation filter                      | #15  |
| Snapshot loss                           | Archive rotation                        | #16  |
| Disputes without skin in the game       | Stake + slashing via CPI                | #17, #18 |

## Review Checklist

Before merging work that touches off-chain storage:

- every new receipt kind documents which blob schema it commits to
- the SDK computes `payload_hash` with `hashCanonical`, not an ad-hoc JSON stringify
- any new fetch path is covered by a DA-proof test (missing blob rejected, mismatched hash rejected)
- docs in this file name the task that implements each defence, so a reader can trace threats back to code
