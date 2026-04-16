# Changelog

All notable changes to Trust Substrate are documented in this file.

## 2026-04-16

### Added

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
  completed W0, W1, W2, W5, and W8 work.

### Verified

- Expanded the hardening audit lane to cover W5 and the completed W8
  documentation work.
- Added README truthing and doc-boundary checks so the written guarantees stay
  aligned with the codebase.
