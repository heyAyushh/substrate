# Changelog

All notable changes to Trust Substrate are documented in this file.

## 2026-04-16

### Added

- A committed-work TODO snapshot for the hardening plan, covering completed
  docs, plans, protocol work, and the remaining open follow-ups.
- Delegation revocation grace windows, so revocation can take effect
  immediately or at a scheduled future slot.
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

- Core architecture, program, storage, and security docs now mark which
  guarantees are enforced on-chain, which are local SDK behavior, and which are
  replay/indexer conventions.
- Added a threat-model document that maps all 23 audit findings to concrete
  hardening workstreams.
- Hardening plan status now matches the mechanically verified scoreboard for
  completed W0 through W5 work, completed W8 documentation alignment, and the
  finished N1 and N3 follow-ups.
- Program, security, testing, roadmap, and generated-client docs now reflect
  the delegation revocation and verdict-window behavior.

### Verified

- Added LiteSVM coverage for delegation revocation grace windows, verdict stale
  windows, safety verdicts, and verdict-gated reputation degradation.
- Added validator-backed TypeScript coverage for delegated revocation and
  dispute reputation verdict requirements.
- Expanded the hardening audit lane to cover W5 and the completed W8
  documentation work.
- Expanded the hardening scoreboard tests to cover W3 and W4 evidence.
- Added README truthing and doc-boundary checks so the written guarantees stay
  aligned with the codebase.
