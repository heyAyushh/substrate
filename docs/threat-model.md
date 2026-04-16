# Trust Substrate Threat Model

This document maps the 2026-04-14 audit findings to the hardening workstreams.
It is an accountability index: each finding must point to a concrete protocol,
SDK, indexer, or documentation task.

Scope tags are defined in [Scope Tags](scope-tags.md).

## Mapping

[on-chain] Findings that change protocol behavior point at workstreams that add
or tighten instruction, account, or event constraints.
[sdk] Findings that remain intentionally off-chain are documented as local
verification or submit-time boundaries.
[indexer] Findings that are replay or interpretation problems point at indexer
workstreams that make those boundaries explicit to downstream consumers.
[indexer] The W0-W8 labels are retained as design-history names for the
completed hardening pass, not as live plan phases.

| Finding | Title | Workstreams |
| --- | --- | --- |
| #1 | anyone-can-challenge is false on-chain | W1.1 |
| #2 | unanswered challenge -> slash has no on-chain trigger | W1.2 + W3 |
| #3 | DA proofs are client-side only | W8.1 (doc-level; on-chain DA is a non-goal) |
| #4 | commit-reveal only matters if author reveals | W8.1 (doc-level) |
| #5 | reputation is self-applied | W4.1 |
| #6 | domains are free-typed `[u8; 32]` | W0.2 + W4.2 |
| #7 | checkpoint roots are attestations, not proofs | W2.1 |
| #8 | slash amount is unbounded by the verdict | W3.2 |
| #9 | treasury is unchecked | W3.3 |
| #10 | receipt chain is not verified | W0.1 |
| #11 | handoff does nothing on-chain | N4 (handoff-as-capability-grant) + W3 (verdicts for handoff-scoped disputes) |
| #12 | authority rotation is impossible on-chain | W5 |
| #13 | `policy_root` and `history_root` are dead | W0.3 |
| #14 | identities are rent-only sybil | W6.1 |
| #15 | nothing binds identity to model/framework | W7.1 |
| #16 | execution steps have no provenance signature | W7.2 |
| #17 | no notion of agent cost/compute receipts | W7.3 |
| #18 | no cross-agent challenge primitive | W1.1 |
| #19 | receipts have no expiry or slashing window | W3 + N3 (evergreen vs time-boxed dispute classes) |
| #20 | off-chain blobs have no on-chain pointer | W8.1 (non-goal, clarified in docs) |
| #21 | checkpoint sequentiality bypassable | W2.1 (first epoch must be 0) |
| #22 | `init_if_needed` hazards | W0.5 |
| #23 | only `ReceiptCommitted` event emitted | W0.4 |

## Notes

[on-chain] Some findings are resolved by new protocol behavior.
[sdk] Some remain deliberate non-goals for v1 and are only safe when the
documentation and local helpers state the boundary plainly.
[indexer] Downstream consumers should read this table with
`docs/architecture.md`, `docs/off-chain-storage.md`, and `docs/security.md` so
they know which guarantees come from the chain and which come from replay.
