# Changelog

All notable changes to Trust Substrate are documented in this file.

## [0.1.0] - 2026-04-16

### Added

- An ISC `LICENSE` file so the declared package license is present in the
  repository.
- Tiered identities with bonded audit eligibility and guarded bond withdrawal,
  so challenge power is not rent-only and bonded identities cannot exit while
  tasks, stake, or challenge obligations are still open.
- A permissionless attester registry with bonded registration and curator-set
  effective tiers, so attestation weight is observable and auditable on-chain.
- Versioned runtime attestation records and SDK slot-resolution helpers, so a
  consumer can resolve which runtime commitment was active when an agent step
  happened.
- SDK verification for signed execution steps, so off-chain execution records
  can distinguish valid signatures, unsigned steps, and forged provenance.
- Cost-aware completion weighting in reputation derivation, so trivial cheap
  loops do not score the same as more expensive verified work.
- Delegation revocation grace windows, so revocation can take effect
  immediately or at a scheduled future slot.
- Audit-receipt round views in the local durable indexer, so challenge rounds
  against the same target receipt can be replayed and inspected chronologically.
- Handoff-as-capability-grant, so a handoff receipt can mint a scoped
  delegation and immediately authorize the next delegated step on the same task.
- Tier-0 leaderboard opt-in, so unbonded identities stay hidden by default and
  are only surfaced when a consumer explicitly asks for them.
- Signed domain-stats snapshot accounts, so operator snapshots for a canonical
  domain can be written on-chain without scanning the full receipt history.
- Verdict classes and stale windows for dispute slashing, separating evergreen
  safety verdicts from time-boxed performance and policy verdicts.
- Verdict-gated dispute reputation degradation, so dispute receipts only reduce
  reputation after a matching negative verdict.
- Permissionless reputation application, so verified receipt facts can be
  applied without requiring the target identity to sign every update.
- Task-domain enforcement for receipt flows, so receipts and reputation writes
  stay tied to the task's declared domain.
- Cooldown-based authority rotation for agent identities.
- Emergency guardian-based authority rotation for recovery scenarios.
- SDK and indexer authority-history hooks for inspecting rotation history.

### Changed

- Prepared the v0.1 release surface by bumping the package version, renaming
  the verification guide, tightening `.gitignore`, and retitling the README's
  scope section for the release.
- Core architecture, program, storage, and security docs now mark which
  guarantees are enforced on-chain, which are local SDK behavior, and which are
  replay/indexer conventions.
- Folded the finished hardening plan and archive-durability write-up into the
  durable docs that remain, keeping the archive procedure in off-chain storage
  and the historical hardening record in the changelog and threat model instead
  of separate planning files.
- Added a threat-model document that maps all 23 audit findings to concrete
  hardening workstreams.
- Program, security, testing, roadmap, and generated-client docs now reflect
  delegation revocation, handoff grant, domain snapshot, challenge round, and
  verdict-window behavior.
- Codama-generated program clients now expose `emitHandoffGrant` and
  `writeDomainStatsSnapshot` alongside the earlier hardening surfaces.
- Removed self-referential verification docs and tests, keeping the remaining
  verification order in `docs/testing.md` and the verification lane focused on
  the archive snapshot script and shared protocol errors.
- Trimmed the duplicated constants, error lists, roadmap recap, README command
  list, and AGENTS/Test docs wording that were restating code or other docs,
  and renamed the generic TypeScript test files to match what they cover.
- Collapsed `agent_stake` stake initialization to one `initialize_stake`
  instruction with `trust_mode`, and removed the `slash_already_applied`
  helper from the on-chain and generated client surfaces.
- Flattened the SDK, indexer, and program-clients package builds to
  `dist/index.js`, aligned the private package versions with the `0.1.0`
  release, and updated the example entrypoints to resolve through workspace
  package roots.

### Verified

- Added LiteSVM coverage for sybil-gated audit receipts, guarded bond
  withdrawal, attester registration and tier updates, and versioned runtime
  attestations.
- Added package-level coverage for runtime provenance verification, runtime
  slot resolution, and cost-aware reputation weighting.
- Added indexer coverage for bonded attester visibility and Tier-0 opt-in
  leaderboard behavior.
- Added a Surfpool end-to-end slice for sybil gating and provenance covering
  identity, task, receipt, runtime attestation, attester registration, and
  tier updates.
- Added LiteSVM coverage for delegation revocation grace windows, verdict stale
  windows, safety verdicts, verdict-gated reputation degradation, handoff
  grants, and domain-stats snapshots.
- Added validator-backed TypeScript coverage for delegated revocation and
  dispute reputation verdict requirements, plus Surfpool-backed coverage for
  handoff grants and domain-stats snapshots.
