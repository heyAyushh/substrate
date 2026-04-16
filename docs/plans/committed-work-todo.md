# Committed Work TODO

Snapshot date: 2026-04-16.

Scope checked: `CHANGELOG.md`, `README.md`, `docs/architecture.md`,
`docs/programs.md`, `docs/security.md`, `docs/testing.md`,
`docs/development.md`, `docs/off-chain-storage.md`, `docs/threat-model.md`,
`docs/roadmap.md`, `docs/verification/mvp-local-verification.md`,
`docs/verification/hardening-plan-scoreboard.md`,
`docs/plans/hardening-plan.md`, and git history through this snapshot.

Uncommitted worktree changes are not counted here.

## Committed Baseline

- [x] Scaffolded the Anchor workspace and local protocol shell.
- [x] Split the old bundled protocol into deployable programs for identity,
      tasks, receipts, delegation, proofs, reputation, stake, and disputes.
- [x] Added the deterministic SDK, local durable indexer, and local execution
      graph model.
- [x] Added architecture, program interface, development, testing, security,
      roadmap, and agent instruction docs.
- [x] Made Surfpool the final local end-to-end gate instead of devnet.
- [x] Added the MVP local verification contract and verification tests.
- [x] Upgraded the Anchor toolchain to Anchor 1.0 and documented the pinned
      local toolchain.
- [x] Added granular LiteSVM protocol suites and made `pnpm test:anchor` run
      the LiteSVM-backed Anchor path.
- [x] Added Codama-generated `@solana/kit` program clients from the Anchor
      IDLs.
- [x] Added Surfpool E2E coverage and aligned the harness with Surfpool
      auto-deploy behavior.
- [x] Added local agent-loop and multi-agent examples with delegation and
      handoff tracing.
- [x] Added `CHANGELOG.md` to summarize the current committed state.

## Hardening Plan: Completed Waves

- [x] W0 protocol hygiene is complete in the scoreboard.
- [x] W0.1 validates receipt chain continuity on-chain.
- [x] W0.2 adds a canonical reputation domain catalog.
- [x] W0.3 gives `policy_root` and `history_root` real protocol meaning.
- [x] W0.4 emits events for state changes across the protocol programs.
- [x] W0.5 replaces `init_if_needed` replay guards with explicit paths.
- [x] W1 permissionless receipts is complete in the scoreboard.
- [x] W1.1 adds audit receipts so third-party identities can challenge,
      dispute, or attest to target receipts.
- [x] W1.2 adds the on-chain challenge response window and unanswered
      challenge finalization path.
- [x] W2 real checkpoints is complete in the scoreboard.
- [x] W2.1 appends real receipts into on-chain checkpoint roots.
- [x] W2.2 restricts caller-supplied roots to a governance-gated checkpoint
      import path.
- [x] W3 verdict program is complete in the scoreboard.
- [x] W3.1 separates adjudication from stake slashing through the
      `dispute_resolver` program.
- [x] W3.2 binds verdict-mode slashing to verdict accounts while preserving an
      explicit authority-mode fallback.
- [x] W3.3 routes slash proceeds to the protocol treasury PDA.
- [x] W4 reputation-as-derived-view is complete in the scoreboard.
- [x] W4.1 keeps reputation application permissionless while requiring a
      matching negative verdict before dispute receipts can degrade reputation.
- [x] W4.2 scopes reputation domains to the identity-task receipt flow.
- [x] W5 authority rotation is complete in the scoreboard.
- [x] W5.1 adds cooldown authority rotation and guardian-gated emergency
      rotation.
- [x] W5.2 exposes rotation history through SDK and indexer hooks.
- [x] W8 docs and SDK alignment is complete in the scoreboard.
- [x] W8.1 tags docs so guarantees are distinguished as on-chain, SDK, or
      indexer behavior.
- [x] W8.2 marks SDK helpers that build payloads but do not replace on-chain
      enforcement.
- [x] W8.3 truths the README so it describes the actual local baseline and
      not future guarantees.

## Other Committed Hardening Work

- [x] Added `dispute_resolver` program docs and program workspace wiring.
- [x] Added verdict-gated stake slashing with an explicit authority-mode
      fallback.
- [x] Added the protocol treasury PDA path for slashed funds.
- [x] Added permissionless reputation receipt application as a cache/projection
      over verified receipt history.
- [x] Added tests for third-party reputation application.
- [x] Added task-domain scoping so receipts and reputation applications stay
      tied to the task domain.
- [x] Added stake-backed dispute resolution and exposed stake state through the
      SDK and indexer.
- [x] Added off-chain storage, data availability, commit-reveal, availability
      challenge, attestation, and archive-durability docs.
- [x] Added SDK helpers for execution records, Merkle hashing, receipt
      builders, commit-reveal payloads, and data-availability verification.
- [x] Added indexer analytics, leaderboard, authority history, snapshot
      archive rotation, and trace export support.

## Documentation Alignment Already Done

- [x] README now says this is a correct, auditable local loop, not a production
      deployment.
- [x] README lists what is not in scope yet: Light Protocol ZK Compression,
      remote event streaming, production RPC orchestration, mainnet hardening,
      and full multi-hop delegation proof chains.
- [x] Architecture docs describe the current local layers and program
      boundaries.
- [x] Program docs describe accounts, instructions, seeds, errors, receipt
      kinds, delegation bits, and future work.
- [x] Security docs list current controls and known gaps.
- [x] Testing docs define the package, Rust, LiteSVM/Anchor, verification, and
      Surfpool commands.
- [x] Roadmap docs separate current scope from next work for each phase.
- [x] Threat model maps all 23 audit findings to hardening waves or
      nice-to-have follow-ups.
- [x] Hardening scoreboard is mechanically checked by `pnpm test:audit`.

## Open Or Not Yet Scoreboard-Complete

- [ ] W6 sybil gating remains open.
- [ ] W6.1 tiered identities and identity bonding are planned but not marked
      complete.
- [ ] W6.2 permissionless bonded attester registry is planned but not marked
      complete.
- [ ] W7 AI-era provenance remains open.
- [ ] W7.1 versioned runtime attestation is planned but not marked complete.
- [ ] W7.2 signed execution steps are planned but not marked complete.
- [ ] W7.3 cost and effort fields are planned but not marked complete.
- [ ] Multi-hop delegation proof chains remain future work.
- [ ] Light Protocol ZK Compression remains future work.
- [ ] Production event ingestion and remote indexing remain future work.
- [ ] Mainnet deployment hardening remains future work.
- [ ] Generated-client adoption in higher-level examples and package consumers
      remains next work.
- [ ] Broader authority-transition examples remain next work.
- [ ] Richer task DAG constraints remain next work.
- [ ] Richer domain-separated reputation vectors remain next work.
- [ ] Stronger gaming-resistance model tests remain next work.
- [x] README protocol-program list includes `dispute_resolver`, matching the
      architecture and program docs.
- [x] N1 delegation revocation grace windows are implemented with an effective
      revoke slot, LiteSVM coverage, validator-backed TypeScript coverage, and
      updated program, security, testing, architecture, and roadmap docs.
- [x] N2 re-challenge rounds are implemented through audit-receipt round
      seeding and indexer challenge-round views with local package coverage.
- [x] N3 evergreen versus time-boxed dispute classes are implemented with
      verdict class validation, stale-window slashing checks, and LiteSVM
      coverage for missing, expired, and evergreen windows.
- [x] N4 handoff-as-capability-grant is implemented through
      `emit_handoff_grant`, delegation-engine CPI, LiteSVM coverage, and
      validator-backed TypeScript coverage.
- [x] N5 Tier-0 leaderboard opt-in is implemented in the local durable
      indexer so unbonded identities remain hidden by default and are exposed
      only when a consumer opts in.
- [x] N6 domain stats aggregation accounts are implemented with signed
      snapshot writes and local Rust plus validator-backed TypeScript
      coverage.

## Nice-To-Have Follow-Ups

- [x] N1 delegation revocation grace window.
- [x] N2 re-challenge rounds.
- [x] N3 evergreen versus time-boxed dispute classes.
- [x] N4 handoff as capability grant.
- [x] N5 Tier-0 leaderboard opt-in.
- [x] N6 domain stats aggregation account.

## Verification Checklist For Updating This File

- [x] Check `docs/plans/hardening-plan.md` top-level TODO status.
- [x] Check `docs/verification/hardening-plan-scoreboard.md` for mechanically
      verified complete rows.
- [x] Check `CHANGELOG.md` for user-facing changes since the last snapshot.
- [x] Check `git log --oneline` for committed work that docs may not yet
      summarize.
- [x] Run `pnpm test:audit` after changing hardening-plan or guarantee-status
      documentation.
