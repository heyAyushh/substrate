# Reputation Model

Trust Substrate reputation is program-backed. The `reputation_accumulator`
program is the canonical writer for domain reputation, and SDKs/indexers only
preview, explain, and verify the program result.

## Inputs

Reputation is applied from verified receipt accounts. A receipt can affect a
reputation account only once because every application creates a
`reputation_receipt_application` marker.

The evidence source is:

- the target identity for self-issued execution receipts
- the auditor identity for audit, dispute, and attestation receipts

The program can weight that evidence source with:

- identity tier or a valid identity bond
- attester record and effective tier
- active SOL or configured SPL token stake
- runtime attestation
- prior slashed stake

Missing optional evidence gives no bonus. Reputation-affecting audit and
attestation receipts require reviewer evidence: a valid identity bond and a
matching attester record.

## Weight Formula

The on-chain reviewer weight uses integer-only saturating math:

```text
raw = 1
    + bonded_identity_bonus
    + attester_effective_tier
    + min(active_stake_units / STAKE_WEIGHT_UNIT_LAMPORTS, MAX_STAKE_REPUTATION_WEIGHT)
    + runtime_attestation_bonus
    - min(slashed_stake_units / SLASH_WEIGHT_UNIT_LAMPORTS, MAX_SLASH_REPUTATION_PENALTY)

weight = clamp(raw, 0, MAX_REVIEWER_REPUTATION_WEIGHT)
```

Current constants live in `crates/trust_substrate_core/src/constants.rs`.
SOL stake uses lamports. Configured SPL token stake is accepted as program
evidence, but production mint allowlists, token valuation, and Token-2022
handling remain production-readiness items.

## Effects

- `completion` increases legacy and weighted completion totals.
- `dispute` requires a matching negative dispute verdict before it can degrade
  reputation.
- `dispute_resolved` requires the prior dispute receipt and verdict evidence.
  A negative verdict does not erase the disputed history; non-negative outcomes
  add resolved credit.
- `attestation` increases attestation totals when the reviewer is bonded and
  registered as an attester.

Legacy counters remain for compatibility. Weighted counters are the stronger
execution-backed reputation surface.

## SDK And Indexer Role

The SDK may preview the same weight formula for UI planning, but that preview is
not authority. The indexer may ingest fetched program-backed reputation accounts
and flag mismatches against local replay. If a UI has no fetched program-backed
account, it must label any local score as an unverified preview.

## ERC-8004 Interop

ERC-8004 feedback and validation metadata can export Trust Substrate reputation,
but ERC-8004 does not define the Trust Substrate scoring policy. Trust
Substrate should expose its execution-backed reputation as 8004-friendly
metadata while keeping the Solana program state canonical.
