# Scope Tags

Use these tags consistently across the protocol docs:

- **[on-chain]** enforced by Anchor programs, PDA constraints, and account
  state
- **[sdk]** enforced by local helper code, build-time validation, or submit-time
  builders
- **[indexer]** reconstructed, derived, or interpreted during replay and local
  graph rebuilding

When a statement has no tag, treat it as editorial context rather than an
enforced guarantee.
