# Trust Substrate Hardening Plan

## Purpose

This plan fixes the 23 loopholes identified in the 2026-04-14 audit. The
guiding idea: right now the protocol is auditor-friendly for an honest agent
and permissive to a dishonest one. After this plan, the chain constrains the
four things that matter — who can file grievances, who grades agents, who
determines truth, and who sets penalties — and binds those to proofs rather
than to the agent's own authority signature.

The plan preserves the current file layout, the seven-program split, and the
SDK shape. It changes instruction surfaces, adds two new programs, and
replaces the "identity applies its own reputation" model with a permissionless
derivation.

## Invariants we preserve

- receipts remain append-only evidence
- all data needed to audit an agent is derivable from chain + off-chain blobs
- no direct score-write path
- canonical hashing rules (`hashCanonical`) remain the single source of truth
  for payload hashes
- Anchor/LiteSVM + Surfpool remain the local verification gates

## Invariants we add

- (I1) on-chain action is gated by proof, not by signer identity, wherever the
  action touches another identity's state
- (I2) an identity cannot be the grader of its own reputation
- (I3) a checkpoint root is a function of the receipts actually committed
  on-chain for that identity — never a caller-supplied blob
- (I4) slash amount is a function of a verdict account, never a function of
  the slash-authority's discretion at call time
- (I5) every state-changing instruction emits a structured event

## Workstream dependency graph

```
W0 protocol hygiene ─┬─▶ W1 permissionless receipts ─┬─▶ W3 verdict program
                     │                                │
                     ├─▶ W2 real checkpoints          ├─▶ W4 reputation as view
                     │                                │
                     ├─▶ W5 authority rotation        │
                     │                                │
                     └─▶ W6 sybil gating              │
                                                      │
                W7 AI-era provenance ◀────────────────┘
                                                      │
                W8 docs + SDK alignment  ◀────────────┘
```

W0 is a prerequisite for everything. W1/W2/W5/W6 are parallel after W0. W3
depends on W1. W4 depends on W1 + W3. W7 can land any time after W1. W8
closes out each wave.

---

## W0 — Protocol hygiene (prereq for everything)

### W0.1 Validate receipt chain on-chain

Fixes audit findings #10, #21.

**Files:**

- `programs/receipt_emitter/src/instructions/emit_receipt.rs`
- `programs/receipt_emitter/src/instructions/emit_delegated_receipt.rs`
- `programs/receipt_emitter/src/state/receipt_record.rs`
- `programs/task_registry/src/state/task_record.rs`

**Changes:**

- add `task.last_receipt: Pubkey` and `task.last_sequence: u64` to
  `TaskRecord`.
- in `emit_receipt` and `emit_delegated_receipt`, require:
  - `previous_receipt == task.last_receipt` (byte-equality on the PDA key)
  - `sequence == task.last_sequence + 1`
- on success, update `task.last_receipt = receipt.key()` and
  `task.last_sequence = sequence`.
- on `task_registry.create_task`, initialize
  `last_receipt = Pubkey::default()`, `last_sequence = 0`, and allow the
  first receipt to use `previous_receipt = Pubkey::default()`.

**New errors in `crates/trust_substrate_core/src/error.rs`:**

- `ReceiptChainBroken`
- `ReceiptSequenceNotMonotonic`

**Tests:**

- two sequential receipts succeed.
- out-of-order sequence fails with `ReceiptSequenceNotMonotonic`.
- wrong `previous_receipt` fails with `ReceiptChainBroken`.
- two forks of the same chain (two receipts with the same
  `previous_receipt`) fail on the second one.

### W0.2 Canonical domain registry

Fixes audit finding #6.

**New program: none.** Add to `reputation_accumulator`:

- new account `ReputationDomainCatalog` singleton PDA (seed
  `domain_catalog`), storing up to N canonical domain byte-strings plus a
  curator authority.
- new instructions `register_domain(domain)` and `deprecate_domain(domain)`
  gated by the catalog's `curator` (initially a governance multisig, later a
  DAO).
- `reputation_accumulator.create_reputation_domain` must require the
  `domain` is present in the catalog (read via PDA).
- on `emit_receipt`, require `domain` is either:
  - empty bytes (non-reputation-bearing receipt), or
  - present in the catalog.

**Tests:**

- creating a reputation accumulator for an unregistered domain fails with
  `DomainNotRegistered`.
- emitting a receipt with an unregistered non-empty domain fails.
- a deprecated domain still validates existing receipts but rejects new
  `create_reputation_domain` calls.

### W0.3 Give the dead identity fields real meaning

Fixes audit finding #13.

**Decision (refined to preserve optionality):** do not delete
`policy_root` and `history_root`. Repurpose them so the fields carry real
semantics instead of being dead bytes.

- `policy_root` becomes a commitment to the identity's capability/policy
  manifest: tool allowlist, rate limits, max-spend per domain, acceptable
  model family. The manifest itself lives off-chain; the chain anchors the
  hash. Gives us a clean hook for future on-chain policy enforcement
  without touching the account layout again.
- `history_root` becomes a cached mirror of the latest checkpoint root
  owned by `proof_verifier`. Redundant with `LatestCheckpoint.root` but
  cheap, and lets external consumers fingerprint an identity in one
  account read.
- add instructions `update_policy_root(ctx, new_root)` and an internal CPI
  hook from `proof_verifier` that keeps `history_root` in sync on
  checkpoint rotation.

**Migration note:** layout preserved, semantics changed. No breaking
deserialization for existing identities.

### W0.4 Emit events on every state change

Fixes audit finding #23.

Add `anchor_lang::emit!` events for:

- `StakeInitialized`, `StakeDeposited`, `StakeUnstakeRequested`,
  `StakeUnstakeFinalized`, `StakeSlashedByAuthority`,
  `StakeSlashedWithVerdict` in `agent_stake`.
- `CheckpointCreated`, `CheckpointRotated`, `InclusionVerified` in
  `proof_verifier`.
- `DelegationCreated`, `DelegationRevoked` in `delegation_engine`.
- `TaskStatusSynced` in `task_registry`.

Every event carries identity, authority/actor, operation-specific fields,
and a `slot: Clock::get()?.slot`.

**Tests:**

- `tests/trust_substrate.ts` asserts event emission via
  `program.addEventListener` for at least one happy-path of each.

### W0.5 Replace `init_if_needed` with explicit existence guards

Fixes audit finding #22.

**Files:**

- `programs/agent_stake/src/instructions/slash_with_authority.rs`
- `programs/agent_stake/src/instructions/slash_already_applied.rs`
- `programs/reputation_accumulator/src/instructions/apply_reputation_receipt.rs`
- `programs/task_registry/src/instructions/sync_task_status.rs`

**Change:** replace `init_if_needed` with `init` for the replay-guard PDA
and add a separate instruction path that expects the PDA to already exist
when re-checked.

---

## W1 — Permissionless receipts

Fixes audit findings #1, #2, #18.

### W1.1 Split receipt emission into self-emit vs audit-emit

**Current problem:** `emit_receipt` gates on `task.identity == identity.key()`
and `identity.authority == signer`. That makes challenges and disputes by an
external auditor impossible on-chain.

**New model:** two distinct on-chain receipt *modes* — self vs audit —
distinguished by who can author them and what they can assert.

- **Self-receipts** (`assignment`, `handoff`, `completion`, `commit`,
  `reveal`, `challenge_response`) — emitted by the task's identity authority
  on that identity's tasks. Unchanged gating.
- **Audit-receipts** (`challenge`, `dispute`, `attestation`) — emitted by
  any identity against any task. Authored by the auditor's identity, but
  annotated against the target task.

**Implementation (refined — field-additive, no account split):**

- keep `ReceiptRecord` as a single account type. Add three nullable fields:
  - `auditor_identity: Pubkey` (default = `Pubkey::default()` for self-receipts)
  - `target_receipt: Pubkey` (the receipt being challenged/disputed/attested;
    default for self-receipts)
  - `round: u16` (see nice-to-haves — defaults to 0)
- extend the PDA seed set so audit-receipts have a distinct key space:
  - self-receipt seed (unchanged): `receipt`, identity, task, receipt_id
  - audit-receipt seed: `audit_receipt`, auditor_identity, target_receipt,
    kind, round_le_bytes
- new instruction `receipt_emitter.emit_audit_receipt(ctx, kind, domain,
  payload_hash, sequence, round)`:
  - signer must equal `auditor_identity.authority`.
  - must reference a valid `target_receipt` owned by `receipt_emitter`.
  - must reference `target_identity` = `target_receipt.identity`.
  - `kind` restricted to audit-kinds.
  - PDA uniqueness prevents double-challenges for the same (auditor, target,
    kind, round).
- emit `AuditReceiptCommitted { auditor, target, kind, round, ... }`.

**Why field-additive instead of splitting the account:** indexers,
generated IDLs, and the SDK keep their existing type. Downstream
consumers branch on `auditor_identity != Pubkey::default()` instead of
learning a second account shape. Zero IDL churn.

**New errors:** `ReceiptKindNotAuditable`, `ReceiptKindNotSelfEmittable`.

**Tests:**

- reviewer-A can challenge builder-B's completion.
- same reviewer cannot challenge the same completion twice (PDA collision).
- builder-B cannot challenge their own completion via `emit_audit_receipt`
  (kind check catches it — self-attacks don't hit the permission wall, they
  hit the reputation of the self-challenger).
- attestation by reviewer-A on builder-B's completion succeeds.
- an audit-receipt against a non-existent target fails at account
  deserialization.

### W1.2 Response window + timeout as on-chain primitive

**Current problem:** "unanswered challenge → dispute" is SDK-only.

**Implementation:**

- `AuditReceipt` for `kind == CHALLENGE_KIND` must include
  `payload.deadline_slot` committed under `payload_hash` *and* a redundant
  on-chain `deadline_slot: u64` field on the account so the chain can read
  it without re-parsing.
- new instruction `receipt_emitter.finalize_unanswered_challenge(ctx)`:
  - requires the challenge account, the target receipt, and (optionally)
    the `challenge_response` audit-receipt if one exists.
  - passes only if `Clock::get()?.slot > challenge.deadline_slot` and no
    matching `challenge_response` is supplied.
  - writes a new `AuditReceipt` of kind `DISPUTE_KIND` derived directly on-
    chain, with the challenge account as its predecessor.
  - anyone may call this — the slot clock is the adjudicator.
- rename the SDK helper `createUnansweredChallengeDispute` to
  `buildUnansweredChallengePayload` and mark it informational-only;
  production flow uses the on-chain instruction.

**Tests:**

- finalize fails before deadline.
- finalize fails when a valid response exists.
- finalize succeeds post-deadline and with no response.
- finalize is idempotent-safe via PDA uniqueness.

---

## W2 — Real checkpoints

Fixes audit findings #7, #11.

### W2.1 Incremental checkpoint from actual receipts

**Current problem:** `checkpoint_history(epoch, root, leaf_count)` stores
whatever root the caller passes.

**Replacement model — chunked accumulator:**

- checkpoint account stores `root`, `leaf_count`, `latest_committed_receipt`,
  and `epoch`.
- new instruction `append_receipt_to_checkpoint(ctx, receipt)`:
  - signer irrelevant; anyone may append.
  - receipt must be owned by `receipt_emitter`, must belong to the
    identity.
  - must be the *next* receipt in the identity's canonical ordering.
  - ordering: receipts ordered by `(task_pubkey, sequence)` tuple; the
    checkpoint tracks the next (task, sequence) it expects.
  - on success: `root = hash_internal(root || hash_leaf(receipt_pda_bytes))`
    (using the shared `OnchainMerkleTree` rule), `leaf_count += 1`,
    `latest_committed_receipt = receipt.key()`.
- `checkpoint_history(epoch=0)` becomes `initialize_checkpoint(ctx)` with
  no root parameter. The root is strictly derived.
- `rotate_checkpoint(ctx)` seals the current checkpoint (preserves its
  root), opens a new one at `epoch + 1` with `root = 0`, and points
  `latest_checkpoint` at the new one.
- `verify_receipt_inclusion` stays, but now it is verifying inclusion in a
  root the chain itself computed — not in a caller-asserted blob.

**Trade-off:** each receipt now requires a follow-up append tx. The append
fee is the cost of a trustworthy checkpoint. For batch efficiency, add
`append_receipts_to_checkpoint(receipts[])` accepting up to N in one tx
(bounded by Solana tx size).

**New errors:** `CheckpointOrderingViolation`,
`CheckpointReceiptIdentityMismatch`, `CheckpointReceiptAlreadyAppended`.

**Tests:**

- append two sequential receipts; inclusion of each verifies against the
  checkpoint root.
- append out-of-order fails.
- append across identity boundaries fails.
- rotate preserves prior root in `previous_root`.

### W2.2 Restrict — not remove — caller-supplied root

**Refined:** rename `checkpoint_history(root, leaf_count)` to
`checkpoint_import(root, leaf_count)` and gate it on a governance-signed
authority account (seed `checkpoint_importer`, single pubkey field). The
instruction now documents its trust level explicitly ("operator-signed,
not chain-verified") and is intended for bulk migration, cross-chain
imports, and disaster-recovery — not for routine operation.

Normal callers use `initialize_checkpoint` + `append_receipts_to_checkpoint`.
Tests and SDK default to that path. `checkpoint_import` is exercised by a
single dedicated test that also asserts a non-governance signer is
rejected.

---

## W3 — Verdict program (dispute_resolver)

Fixes audit findings #8, #9.

### W3.1 Separate adjudication from slashing

**New program: `programs/dispute_resolver/`.**

- State `DisputeVerdict`:
  - `dispute_receipt: Pubkey` (must be an `AuditReceipt` of kind
    `DISPUTE_KIND`)
  - `target_identity: Pubkey`
  - `outcome: u8` (`AGENT_WON | AGENT_LOST | NO_FAULT`)
  - `slash_amount: u64`
  - `adjudicator: Pubkey` (the entity permitted to write the verdict)
  - `created_at_slot: u64`
  - `bump: u8`
  - PDA seed: `verdict`, dispute_receipt.
- Instructions:
  - `register_adjudicator(ctx, adjudicator)` gated by governance.
  - `record_verdict(ctx, outcome, slash_amount)` gated by `adjudicator` ==
    signer; PDA uniqueness prevents double-verdicts on a dispute.
  - `challenge_verdict(ctx, ...)` — future; stubbed for now.

- **Initial adjudicator choices** (v1):
  - single authority (current model, now explicit)
  - or a 3-of-N multisig account (Squads v4 compatible)
  - or an on-chain voting account (future)

### W3.2 Bind slash to verdict, keep authority path as opt-in tier

**Refined:** ship two slash paths instead of deleting the old one. Each
`StakeAccount` declares a `trust_mode: u8` at `initialize_stake` time:

- `TRUST_MODE_VERDICT` (default, recommended): slashable only via the
  verdict path below. `slash_authority` field is unused.
- `TRUST_MODE_AUTHORITY` (explicit opt-in, documented as lower-trust):
  slashable by the stake's configured `slash_authority` with a
  caller-supplied amount, i.e., today's behavior. Suitable for small
  closed markets that don't want to run an adjudicator.

**Verdict path (`slash_with_verdict`) — the new default:**

- replace the `amount: u64` argument with reading
  `verdict.slash_amount`.
- add `verdict: Account<'info, DisputeVerdict>` to accounts.
- require:
  - `stake.trust_mode == TRUST_MODE_VERDICT`
  - `verdict.target_identity == stake.identity`
  - `verdict.outcome == AGENT_LOST`
  - `verdict.dispute_receipt == dispute_receipt.key()`
  - signer == `verdict.adjudicator`

**Authority path (`slash_with_authority`) — preserved, tagged lower-trust:**

- keep the current signature and checks.
- require `stake.trust_mode == TRUST_MODE_AUTHORITY`.
- emit `StakeSlashedByAuthority` with the `trust_mode` field so indexers
  can visibly label these as lower-trust events.

**Result:** verdict-gated is the default and covers the main trust path;
the authority path survives for operators who explicitly accept the
weaker guarantee. The `StakeAccount.slash_authority` field is retained
but unused when `trust_mode == TRUST_MODE_VERDICT`.

### W3.3 Protocol treasury

- add a `TreasuryVault` PDA under `dispute_resolver` with seed `treasury`.
- `slash` transfers slashed lamports into the treasury vault, not into an
  unchecked account chosen by the caller.
- treasury withdrawal is a future governance instruction; v1 only
  accumulates.

**Tests:**

- slash without a matching verdict fails.
- slash amount ≠ verdict.slash_amount fails (because we no longer accept
  it as an argument).
- slash proceeds flow to the treasury PDA and not to a caller-named
  address.
- re-running slash with the same verdict fails (replay marker).

---

## W4 — Reputation as a derived view

Fixes audit findings #5, #6.

### W4.1 Remove self-application

**Decision:** delete `reputation_accumulator.apply_reputation_receipt` as
an identity-authority-gated instruction. Replace with one of two
permissionless paths:

**Option A (preferred) — derive at read time, off-chain.**

- keep `ReputationAccumulator` storing weights only (the parameters).
- reputation values are computed off-chain by the SDK / indexer from the
  identity's audit + self-receipts. `deriveReputation` is already the
  reference implementation.
- on-chain programs that want to consume reputation CPI into a new
  `reputation_oracle` program (W4.2) that holds a verified projection.

**Option B — permissionless apply.**

- any signer may call `apply_reputation_receipt`, but the receipt must:
  - be owned by `receipt_emitter` for self-receipts, or
  - be owned by the audit-receipt PDA for audit-receipts, and
  - have passed through a `DisputeVerdict` for dispute-class application
    (so a raw unresolved dispute does not degrade reputation).
- PDA uniqueness (receipt × reputation) still prevents double-apply.
- payer is the caller, not the identity — so a third party can "poke" the
  reputation.

**Refined recommendation:** ship *both* A and B concurrently, not B→A.

- Option B (on-chain accumulator, permissionless apply) stays as a
  *cached projection*. Anyone can poke it; verdict-gated for dispute
  receipts; self-grading is killed.
- Option A (off-chain derivation via `deriveReputation`) is the canonical
  truth. When the projection and the derivation disagree (e.g., a missed
  poke, or a receipt applied out of order), the off-chain derivation
  wins.
- The on-chain cache is useful for CPI consumers that don't want to
  re-derive — they accept the "maybe stale" trade-off explicitly by
  reading it.

Docs must state the trust relationship plainly: **the on-chain
accumulator is a cache, not a source of truth.**

### W4.2 Scope domain per identity-task

- on `create_reputation_domain`, require the domain byte-string matches an
  entry in the catalog from W0.2.
- on `emit_receipt`, the `domain` must equal `task.domain` (new field
  added to `TaskRecord` at task creation). This prevents a single task
  from claiming completions across multiple domains.

**Tests:**

- agent cannot apply a completion receipt to their own reputation in a new
  domain unless the task itself is in that domain.
- an external "poker" correctly applies a verdict-backed dispute.
- an unverdict'd dispute cannot degrade reputation.

---

## W5 — Authority rotation

Fixes audit findings #12, and enables a real version of the "authority
rotation decay" hinted at in `docs/off-chain-storage.md`.

### W5.1 On-chain rotation instruction (with emergency path)

**Files:**

- `programs/identity_registry/src/instructions/rotate_authority.rs`
- `programs/identity_registry/src/instructions/emergency_rotate_authority.rs`

**Normal rotation (cooldown-gated):**

- `rotate_authority(ctx, new_authority: Pubkey, unlock_slot: u64)`:
  - signer must equal current `identity.authority`.
  - `unlock_slot >= Clock::get()?.slot + ROTATION_COOLDOWN_SLOTS` (e.g.,
    one epoch).
  - writes a pending rotation into a new `PendingAuthorityRotation` PDA
    (seed `pending_rotation`, identity).
  - emits `AuthorityRotationRequested`.
- `finalize_authority_rotation(ctx)`:
  - anyone may call after `unlock_slot`.
  - swaps `identity.authority` to `pending.new_authority`.
  - deletes the pending rotation.
  - emits `AuthorityRotated { identity, previous_authority,
    new_authority, slot, mode: NORMAL }`.

**Emergency rotation (N-of-M guardian-gated, zero cooldown):**

- identities optionally declare a `GuardianSet` at `create_identity` time:
  a list of up to `MAX_GUARDIANS` pubkeys plus a threshold `M`. Stored in
  a side PDA `guardian_set` seeded by identity.
- `emergency_rotate_authority(ctx, new_authority: Pubkey)`:
  - N-of-M guardian signatures (via multisig account or attached signer
    set).
  - instant effect: `identity.authority` swaps immediately.
  - emits `AuthorityRotated { ..., mode: EMERGENCY }`.
- if no `GuardianSet` was declared, emergency rotation is not available
  for that identity. Declaring guardians is a conscious choice made at
  mint time.

Indexer/SDK weights pre-rotation receipts identically for both modes —
decay applies either way — but the event's `mode` field is surfaced so
downstream consumers can distinguish deliberate succession from incident
response.

### W5.2 SDK and indexer hooks

- `packages/sdk/src/client.ts` adds `identity.rotateAuthority` and
  `identity.finalizeRotation` helpers.
- `packages/indexer/src/local-durable-indexer.ts.getAuthorityHistory`
  becomes a real view of `AuthorityRotated` events, not a derived guess.
- `deriveReputation` gains an option to weight pre-rotation receipts at a
  configurable decay factor (default 0.5). This is now sound because the
  rotation event is on-chain-verified.

**Tests:**

- rotation fails before cooldown.
- rotation succeeds after cooldown, `identity.authority` updated.
- pre-rotation receipts are weighted at `0.5` in derived reputation when
  decay is enabled.

---

## W6 — Sybil gating

Fixes audit finding #14. Creates the foundation for #15.

### W6.1 Tiered identities (not binary bonded)

**Refined:** two tiers instead of a single bond requirement. Binary
bonding would kill the "spin up a cheap read-only helper agent" use
case.

- **Tier 0 — unbonded** (default; free beyond rent):
  - can create self-receipts on their own tasks.
  - *cannot* author audit-receipts (`challenge`, `dispute`, `attestation`).
  - *does not* appear in `getAgentLeaderboard` unless `tier0: true` is
    explicitly passed — reputation surface is opt-out for consumers.
- **Tier 1 — bonded**:
  - requires a lamport deposit into a new `IdentityBond` PDA (seed
    `bond`, identity). Amount in
    `trust_substrate_core::constants::IDENTITY_BOND_LAMPORTS`.
  - unlocks full receipt surface: audit-receipts, reputation eligibility,
    leaderboard presence.
  - bond is refundable via `close_identity`, which requires:
    - no open tasks (`AgentIdentity.open_task_count == 0`).
    - no active stake account.
    - no open challenges against this identity's receipts.
- `create_identity` takes an optional bond deposit; the identity's `tier`
  field is set accordingly. An identity can upgrade Tier 0 → Tier 1 later
  via `deposit_identity_bond(ctx)`.

**Result:** spin-up remains cheap for read-only helpers and throwaway
agents, but griefing via audit-receipts or reputation farming requires
skin in the game.

### W6.2 Permissionless attester registry with bonded tiers

**Refined:** governance curates *tiers* of attesters, not the membership
list itself. Any identity can self-register as an attester by bonding.

- new program `attester_registry` with a single `AttesterRecord` account
  per registered attester (seed `attester`, identity).
- `register_attester(ctx, category, self_declared_tier)`:
  - requires a lamport bond beyond the Tier 1 identity bond.
  - `category` is a free-form enum (`kyc`, `pop`, `dao_vote`, `review`,
    `custom:X`).
  - `self_declared_tier` is the attester's own claim; the governance
    curator can later reclassify via `set_attester_tier(ctx, tier)`.
  - anyone can register; no prior approval needed.
- attestation receipts whose `auditor_identity` has an `AttesterRecord`
  are weighted by the record's effective tier. Records with tier 0 count
  as un-attested for leaderboard purposes.
- `close_attester(ctx)` refunds the bond if no open attestations depend
  on the record.

**Result:** the membership is permissionless, the *trust weighting* is
curated. Governance cannot silently exclude an attester — only demote
them — and the demotion is observable on-chain.

**Tests:**

- minting 1000 identities is now cost-prohibitive (unit test asserts bond
  deducted, indexer `getAgentLeaderboard({attestedOnly:true})` filters
  correctly).

---

## W7 — AI-era provenance

Fixes audit findings #15, #16, #17.

### W7.1 Versioned runtime attestation

**Refined:** the runtime commitment is a versioned list, not a single
overwritten field. A model swap appends a new version; historical
verification knows which runtime was active at a given slot.

- new account `RuntimeAttestationHistory` PDA per identity (seed
  `runtime_history`, identity). Stores up to N recent entries; older
  entries spill into a companion `RuntimeAttestationArchive` PDA keyed by
  `(identity, archive_epoch)` for unbounded history.
- each entry:
  - `runtime_commit: [u8; 32]` — hash commitment to the execution runtime.
    Examples:
    - TEE-attested model: SHA-256 of the TEE quote + model weight hash.
    - Provider-attested model: SHA-256 of
      `{provider_pubkey, model_id, system_prompt_hash}`.
    - Self-declared: SHA-256 of
      `{declared_provider, declared_model, declared_version}` (trust
      level: low, but explicit).
  - `runtime_authority: Pubkey`
  - `valid_from_slot: u64`
- new instruction `append_runtime_attestation(ctx, runtime_commit,
  runtime_authority)`:
  - signer is identity authority.
  - `valid_from_slot = Clock::get()?.slot`.
  - emits `RuntimeAttestationAppended`.
- SDK helper `resolveRuntimeAtSlot(identityId, slot)` returns the
  `runtime_commit`/`runtime_authority` pair that was active at that slot
  — enables "which model signed this step?" queries at replay.

### W7.2 Signed execution steps

**SDK-level addition:**

- extend `ExecutionStep` with `signature?: { signer: string; sig: string
  }` — signer pubkey (hex), Ed25519 signature over `hashStep(step)`.
- `hashExecutionRecord` excludes the signature field so the Merkle root
  stays deterministic.
- `verifyExecutionRecord(record, runtimeAuthority)` new SDK helper that
  returns `{ signedSteps, unsignedSteps, invalidSteps }`.

**On-chain:** no change — the chain continues to anchor only
`payload_hash`. Verification is off-chain but now has signatures to check.

### W7.3 Cost / effort fields

- add to `ExecutionStep.payload` a convention:
  - `cost?: { tokensIn: number; tokensOut: number; elapsedMs: number;
    usdMicros?: number }`.
  - `modelId?: string`.
- `deriveReputation` optionally weights completions by log(cost) to
  dampen trivial-task farming.

**Tests:**

- unit tests for `verifyExecutionRecord` — signed, unsigned, forged
  signature.
- reputation weighting with and without cost.

---

## W8 — Docs and SDK alignment

Fixes audit findings #3, #4, #11, #20. Also part of every wave above.

### W8.1 Rewrite docs to distinguish enforced vs convention

- `docs/architecture.md`, `docs/programs.md`, `docs/off-chain-storage.md`,
  and `docs/security.md` get a tag on every guarantee: **[on-chain]**,
  **[sdk]**, or **[indexer]**.
- a new `docs/threat-model.md` imports the 23 audit findings and maps
  each to the workstream(s) that close it.

### W8.2 Mark SDK helpers that are NOT on-chain equivalents

- `packages/sdk/src/challenge.ts`, `commit-reveal.ts`, and
  `data-availability.ts` get a file-level banner comment:
  `// [sdk] This module builds receipt payloads. On-chain behavior is
  governed by the `receipt_emitter` program.`
- rename `createUnansweredChallengeDispute` →
  `buildUnansweredChallengePayload` (it is only a payload builder; the
  real dispute is W1.2's `finalize_unanswered_challenge`).
- **keep the old export name as a deprecated shim** that re-exports the
  new function with a one-line JSDoc `@deprecated` pointing at the
  replacement. Shim lives for one minor version so downstream users see a
  compiler warning instead of a breakage.

### W8.3 README truthing

- delete any phrasing that implies automatic slashing. Slashing is
  gated by a verdict; verdicts are gated by an adjudicator (governance
  or multisig v1, on-chain jury in future work).
- mark DA proofs, commit-reveal, and availability challenges as
  "SDK-enforced at submit time; consumers MUST re-verify at replay" —
  which is the actual guarantee.

---

## Nice-to-haves (orthogonal, unlocked by the refinements above)

These are not required to close the 23 audit findings, but the refined
plan surfaces clean hooks for each. They can land as separate PRs after
the main waves.

### N1 — Delegation revocation grace window

**Wave:** companion to W0.

Today `revoke_delegation` is instant. Optional grace window:
`revoke_delegation(ctx, revoke_at_slot?)` defaults to instant (current
behavior) but may set a future slot so in-flight delegated receipts
don't fail mid-tx. `emit_delegated_receipt` reads
`delegation.revoke_at_slot` and rejects only when
`Clock::get()?.slot >= revoke_at_slot`.

### N2 — Re-challenge rounds

**Wave:** companion to W1.1.

The `round: u16` field is already in the `AuditReceipt` seed (see W1.1
refinement). After a verdict reversal or appeal, a second round can
produce a fresh challenge of the same kind on the same target without
PDA collision. Default `round = 0`. Indexer exposes
`getChallengeRounds(targetReceiptId)` as a chronological view.

### N3 — Evergreen vs time-boxed dispute classes

**Wave:** companion to W3.

`DisputeVerdict` gains a `class: u8` field:

- `CLASS_SAFETY` — evergreen. Never goes stale. Example: the agent
  emitted a completion claim that turned out to be fraudulent; truth
  doesn't expire.
- `CLASS_PERFORMANCE` — time-boxed. `stale_after_slot: u64`
  required. Example: SLA violation; stops mattering after the window
  closes.
- `CLASS_POLICY` — time-boxed with governance-tuned default window.

`slash_with_verdict` rejects verdicts whose `stale_after_slot` has
passed for non-evergreen classes. Closes audit finding #19 with policy
granularity rather than a single hard-coded window.

### N4 — Handoff as capability grant

**Wave:** companion to W1 / W5.

Today `handoff` is a marker receipt with no on-chain effect. Wrap it as
a thin primitive that CPIs into `delegation_engine.create_delegation`,
so the receiving agent gains a scoped delegation on the same task. The
scope is derived from the payload (`allowed_actions`, `expires_at_slot`,
`domains`), hashed into `payload_hash`, and enforced on any subsequent
`emit_delegated_receipt` from the new holder.

Closes audit finding #11 with a real primitive instead of
a rotation analogy.

### N5 — Tier-0 leaderboard opt-in

**Wave:** companion to W6.1.

`getAgentLeaderboard({ tier0: true })` includes unbonded identities but
surfaces them with a distinct badge. Makes the tier visible without
forcing it on consumers.

### N6 — DomainStats aggregation account

**Wave:** companion to W0.2.

A per-domain aggregation PDA that any ingester can write into with a
signed snapshot of domain-wide stats. Cheap for leaderboards that don't
want to scan all receipts. Explicit trust tier: operator-signed,
indexer-verifiable.

## Breaking changes

This plan is significantly less breaking after the refinements. The only
true breaks are the places where correctness demands them.

| Change | Wave | Severity |
| --- | --- | --- |
| `emit_receipt` requires chain continuity | W0.1 | **hard break** (existing clients must pass `previous_receipt`) |
| `TaskRecord` gains `last_receipt`, `last_sequence`, `domain` | W0.1, W4.2 | layout break |
| `apply_reputation_receipt` signer no longer must be identity authority | W4.1 | soft break (more permissive) |
| `ReceiptRecord` gains `auditor_identity`, `target_receipt`, `round` | W1.1 | **field-additive**, no split |
| `agent_stake` slashing uses `slash_with_verdict` / `slash_with_authority` | W3.2 | additive split — authority mode stays opt-in and verdict mode is explicit |
| `reputation_accumulator.create_reputation_domain` requires catalog entry | W0.2 | hard break |
| `AgentIdentity.policy_root` / `history_root` repurposed (not deleted) | W0.3 | **semantic, not layout** |
| `checkpoint_history` renamed to `checkpoint_import`, governance-gated | W2.2 | rename + access-control |
| `runtime_commit` / `runtime_authority` moved to a separate history PDA | W7.1 | **additive** |

All breaking changes land behind a single program-version bump.

## Test strategy

Each wave lands as a self-contained PR with:

1. failing test first, named after the audit finding it closes
   (`test_closes_finding_07_checkpoint_attestation_vs_proof`)
2. implementation
3. passing test
4. `pnpm test:packages && pnpm test:anchor` green
5. Surfpool E2E updated for any wave touching on-chain behavior

A new `tests/audit/` directory holds one test per audit finding, each
asserting the closing condition. `pnpm test:audit` runs them as a suite.
At the end of the plan, `tests/audit/` has 23 passing tests — one per
finding — making the audit's closure mechanically verifiable.

## Non-goals

- **Mainnet deployment.** This plan does not target a devnet or mainnet
  rollout. It targets a correct, auditable local baseline.
- **Zero-knowledge compression.** Light Protocol ZK Compression remains
  future work and is orthogonal.
- **Economic simulation.** Bond sizes, slash amounts, cooldown periods are
  left as governance parameters; tuning them is out of scope.
- **Closing finding #20** ("off-chain blobs have no on-chain pointer").
  Intentional — adding URI strings on-chain couples the protocol to
  specific blob schemes and offers no guarantee the blob exists. W8.1
  clarifies that "replay from chain alone" is explicitly NOT a promise;
  replay requires at least one indexer / gossip path.

## Execution stance

- **One PR per workstream item** (W0.1, W0.2, … W7.3). 23 total PRs. Each
  is a tight, reviewable change with the failing test it closes named in
  the commit subject.
- **Conventional Commits.** `feat(program)`, `feat(sdk)`, `test(audit)`,
  `refactor(program)`, `docs`.
- **Surfpool is the local E2E gate.** Devnet is not.
- **Stop and surface** on any divergence from this plan. If a workstream
  turns out infeasible (e.g., Solana tx size limits on the chunked
  checkpoint in W2.1), surface it before silently redesigning.

## Finding → workstream index

| Finding | Title | Wave |
| --- | --- | --- |
| #1 | anyone-can-challenge is false on-chain | W1.1 |
| #2 | unanswered challenge → slash has no on-chain trigger | W1.2 + W3 |
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

23 of 23 findings mapped to concrete fixes.

## Summary of the refinement pass

The v1 plan closed every finding but traded away optionality in four
places. The refined plan preserves that optionality:

1. **W0.3** repurposes `policy_root` / `history_root` instead of deleting
   them — dead bytes become a capability commitment and a checkpoint
   mirror.
2. **W1.1** makes `ReceiptRecord` field-additive (`auditor_identity`,
   `target_receipt`, `round`) instead of splitting the account into two
   types.
3. **W2.2** renames `checkpoint_history` to `checkpoint_import` and gates
   it on governance, rather than removing it entirely — migration /
   disaster-recovery path survives.
4. **W3.2** keeps the authority-based slash path as an opt-in
   `TRUST_MODE_AUTHORITY` tier alongside the new verdict-gated default —
   small closed markets can still operate without running an adjudicator.
5. **W4.1** ships Option A (off-chain canonical) and Option B (on-chain
   cache) together rather than B→A sequentially — consumers get both a
   cheap CPI read and a trustworthy derivation.
6. **W5** adds an emergency rotation path beside the cooldown one — key
   compromise doesn't wait out an epoch.
7. **W6.1** tiers identities (Tier 0 unbonded / Tier 1 bonded) rather
   than requiring a bond to exist at all — throwaway read-only helpers
   still cost only rent.
8. **W6.2** makes attester membership permissionless; governance curates
   trust tiers, not the roster — no silent exclusion possible.
9. **W7.1** keeps a versioned history of `runtime_commit` values instead
   of a single overwritten field — model swaps become chronologically
   verifiable.
10. **W8.2** retains deprecated shim exports in the SDK for one minor
    version — downstream gets compiler warnings, not a hard break.

Six orthogonal nice-to-haves (N1–N6) fall out of the refined surface and
can land incrementally after the core waves.
