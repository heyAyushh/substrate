import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { deepStrictEqual, ok, strictEqual } from "node:assert/strict";

const REPO_ROOT = join(import.meta.dirname, "..", "..");
const PLAN_PATH = join(REPO_ROOT, "docs", "plans", "hardening-plan.md");
const SCOREBOARD_PATH = join(
  REPO_ROOT,
  "docs",
  "verification",
  "hardening-plan-scoreboard.md"
);

type ScoreStatus = "complete" | "missing";

type ScoreboardItem = {
  readonly wave: "W0" | "W1" | "W2" | "W3" | "W4" | "W5" | "W6" | "W7" | "W8";
  readonly item: string;
  readonly status: ScoreStatus;
  readonly evidence: readonly {
    readonly path: string;
    readonly marker?: string;
  }[];
  readonly gap?: string;
};

const SCOREBOARD: readonly ScoreboardItem[] = [
  {
    wave: "W0",
    item: "W0.1 validate receipt chain on-chain",
    status: "complete",
    evidence: [
      {
        path: "programs/task_registry/src/state/task_record.rs",
        marker: "last_receipt",
      },
      {
        path: "programs/receipt_emitter/src/instructions/emit_receipt.rs",
        marker: "ReceiptChainBroken",
      },
      {
        path: "programs/receipt_emitter/src/instructions/emit_delegated_receipt.rs",
        marker: "ReceiptSequenceNotMonotonic",
      },
      {
        path: "crates/trust_substrate_litesvm_tests/tests/receipt_chain.rs",
        marker: "ReceiptChainBroken",
      },
    ],
  },
  {
    wave: "W0",
    item: "W0.2 canonical domain registry",
    status: "complete",
    evidence: [
      {
        path: "programs/reputation_accumulator/src/state/domain_catalog.rs",
        marker: "ReputationDomainCatalog",
      },
      {
        path: "programs/reputation_accumulator/src/instructions/register_domain.rs",
        marker: "DomainAlreadyRegistered",
      },
      {
        path: "programs/reputation_accumulator/src/instructions/deprecate_domain.rs",
        marker: "DomainNotRegistered",
      },
      {
        path: "programs/reputation_accumulator/src/instructions/create_reputation_domain.rs",
        marker: "is_domain_active",
      },
      {
        path: "programs/receipt_emitter/src/instructions/emit_receipt.rs",
        marker: "DomainNotRegistered",
      },
      {
        path: "tests/reputation_domains.ts",
        marker: "deprecated domain still validates receipts",
      },
    ],
  },
  {
    wave: "W0",
    item: "W0.3 repurpose policy_root and history_root",
    status: "complete",
    evidence: [
      {
        path: "programs/identity_registry/src/state/agent_identity.rs",
        marker: "policy_root",
      },
      {
        path: "programs/identity_registry/src/instructions/update_policy_root.rs",
        marker: "policy_root",
      },
      {
        path: "programs/identity_registry/src/instructions/update_history_root.rs",
        marker: "history_updater",
      },
      {
        path: "programs/proof_verifier/src/instructions/initialize_checkpoint.rs",
        marker: "update_history_root",
      },
      {
        path: "programs/proof_verifier/src/instructions/append_receipt_to_checkpoint.rs",
        marker: "update_history_root",
      },
      {
        path: "programs/proof_verifier/src/instructions/rotate_checkpoint.rs",
        marker: "update_history_root",
      },
    ],
  },
  {
    wave: "W0",
    item: "W0.4 emit events on every state change",
    status: "complete",
    evidence: [
      {
        path: "programs/agent_stake/src/lib.rs",
        marker: "StakeUnstakeFinalized",
      },
      {
        path: "programs/proof_verifier/src/events.rs",
        marker: "CheckpointReceiptAppended",
      },
      {
        path: "programs/task_registry/src/events.rs",
        marker: "TaskStatusSynced",
      },
      {
        path: "programs/delegation_engine/src/events.rs",
        marker: "DelegationRevoked",
      },
      {
        path: "tests/trust_substrate.ts",
        marker: "DelegationCreated and DelegationRevoked events",
      },
      { path: "tests/agent_stake_events.ts", marker: "StakeUnstakeFinalized" },
      {
        path: "tests/proof_verifier_events.ts",
        marker: "checkpointReceiptAppended",
      },
    ],
  },
  {
    wave: "W0",
    item: "W0.5 replace init_if_needed with explicit guards",
    status: "complete",
    evidence: [
      {
        path: "programs/agent_stake/src/instructions/slash_with_authority.rs",
        marker: "pub struct SlashWithAuthority",
      },
      {
        path: "programs/agent_stake/src/instructions/slash_already_applied.rs",
        marker: "pub struct SlashAlreadyApplied",
      },
      {
        path: "programs/reputation_accumulator/src/instructions/apply_reputation_receipt.rs",
        marker: "already_applied_handler",
      },
      {
        path: "programs/task_registry/src/instructions/sync_task_status.rs",
        marker: "already_applied_handler",
      },
    ],
  },
  {
    wave: "W1",
    item: "W1.1 split self-emit vs audit-emit",
    status: "complete",
    evidence: [
      {
        path: "programs/receipt_emitter/src/instructions/emit_receipt.rs",
        marker: "ReceiptKindNotSelfEmittable",
      },
      {
        path: "programs/receipt_emitter/src/instructions/emit_delegated_receipt.rs",
        marker: "ReceiptKindNotSelfEmittable",
      },
      {
        path: "programs/receipt_emitter/src/instructions/emit_audit_receipt.rs",
        marker: "ReceiptKindNotAuditable",
      },
      {
        path: "programs/receipt_emitter/src/state/receipt_record.rs",
        marker: "auditor_identity",
      },
      {
        path: "programs/receipt_emitter/src/events.rs",
        marker: "AuditReceiptCommitted",
      },
      {
        path: "crates/trust_substrate_litesvm_tests/tests/audit_receipts.rs",
        marker: "tracks_audit_receipts_without_advancing_the_task_chain",
      },
      {
        path: "tests/audit_receipts.ts",
        marker: "allows a reviewer identity to challenge another agent receipt",
      },
    ],
  },
  {
    wave: "W1",
    item: "W1.2 response window + timeout primitive",
    status: "complete",
    evidence: [
      {
        path: "programs/receipt_emitter/src/instructions/emit_audit_receipt.rs",
        marker: "ChallengeDeadlineMissing",
      },
      {
        path: "programs/receipt_emitter/src/instructions/emit_challenge_response.rs",
        marker: "ChallengeResponseCommitted",
      },
      {
        path: "programs/receipt_emitter/src/instructions/finalize_unanswered_challenge.rs",
        marker: "ChallengeAlreadyResponded",
      },
      {
        path: "programs/receipt_emitter/src/state/receipt_record.rs",
        marker: "deadline_slot",
      },
      {
        path: "crates/trust_substrate_litesvm_tests/tests/audit_receipts.rs",
        marker: "finalize_unanswered_challenge_requires_elapsed_deadline",
      },
    ],
  },
  {
    wave: "W2",
    item: "W2.1 incremental checkpoint from actual receipts",
    status: "complete",
    evidence: [
      {
        path: "programs/proof_verifier/src/instructions/initialize_checkpoint.rs",
        marker: "CheckpointCreated",
      },
      {
        path: "programs/proof_verifier/src/instructions/append_receipt_to_checkpoint.rs",
        marker: "CheckpointReceiptAppended",
      },
      {
        path: "programs/proof_verifier/src/instructions/rotate_checkpoint.rs",
        marker: "CheckpointRotated",
      },
      {
        path: "programs/proof_verifier/src/instructions/verify_receipt_inclusion.rs",
        marker: "InclusionVerified",
      },
      {
        path: "crates/trust_substrate_litesvm_tests/tests/proof_verifier.rs",
        marker: "append_receipt_to_checkpoint",
      },
      {
        path: "crates/trust_substrate_litesvm_tests/tests/protocol_flow.rs",
        marker: "history_root",
      },
      {
        path: "tests/proof_verifier_events.ts",
        marker: "checkpointReceiptAppended",
      },
      {
        path: "tests/trust_substrate.ts",
        marker: "appendReceiptToCheckpoint()",
      },
    ],
  },
  {
    wave: "W2",
    item: "W2.2 restrict caller-supplied root instead of removing it",
    status: "complete",
    evidence: [
      {
        path: "programs/proof_verifier/src/instructions/initialize_checkpoint_importer.rs",
        marker: "CHECKPOINT_IMPORTER_SEED",
      },
      {
        path: "programs/proof_verifier/src/instructions/checkpoint_import.rs",
        marker: "CheckpointImportAuthorityMismatch",
      },
      {
        path: "programs/proof_verifier/src/instructions/append_receipt_to_checkpoint.rs",
        marker: "CheckpointImportedIsReadOnly",
      },
      {
        path: "crates/trust_substrate_litesvm_tests/tests/proof_verifier.rs",
        marker:
          "imports_trusted_checkpoint_roots_only_for_configured_governance",
      },
    ],
  },
  {
    wave: "W3",
    item: "W3.1 separate adjudication from slashing",
    status: "complete",
    evidence: [
      {
        path: "programs/dispute_resolver/src/state/dispute_verdict.rs",
        marker: "pub struct DisputeVerdict",
      },
      {
        path: "programs/dispute_resolver/src/instructions/register_adjudicator.rs",
        marker: "AdjudicatorRegistered",
      },
      {
        path: "programs/dispute_resolver/src/instructions/record_verdict.rs",
        marker: "VerdictAdjudicatorMismatch",
      },
      {
        path: "programs/dispute_resolver/src/instructions/challenge_verdict.rs",
        marker: "VerdictChallengeNotImplemented",
      },
      {
        path: "crates/trust_substrate_litesvm_tests/tests/agent_stake.rs",
        marker:
          "slashes_verdict_mode_stake_only_with_matching_verdict_and_treasury",
      },
    ],
  },
  {
    wave: "W3",
    item: "W3.2 bind slash to verdict with authority mode opt-in",
    status: "complete",
    evidence: [
      {
        path: "programs/agent_stake/src/state/stake_account.rs",
        marker: "trust_mode",
      },
      {
        path: "programs/agent_stake/src/instructions/slash_with_verdict.rs",
        marker: "TRUST_MODE_VERDICT",
      },
      {
        path: "programs/agent_stake/src/instructions/slash_with_authority.rs",
        marker: "TRUST_MODE_AUTHORITY",
      },
      {
        path: "crates/trust_substrate_core/src/constants.rs",
        marker: "TRUST_MODE_VERDICT",
      },
      {
        path: "crates/trust_substrate_litesvm_tests/tests/agent_stake.rs",
        marker: "keeps_authority_slashing_as_opt_in_trust_mode",
      },
    ],
  },
  {
    wave: "W3",
    item: "W3.3 protocol treasury",
    status: "complete",
    evidence: [
      {
        path: "programs/dispute_resolver/src/state/treasury_vault.rs",
        marker: "pub struct TreasuryVault",
      },
      {
        path: "programs/dispute_resolver/src/instructions/register_adjudicator.rs",
        marker: "treasury_vault",
      },
      {
        path: "programs/agent_stake/src/instructions/slash_with_verdict.rs",
        marker: "treasury_vault",
      },
      {
        path: "programs/agent_stake/src/instructions/slash_with_authority.rs",
        marker: "StakeTreasuryVaultMismatch",
      },
      {
        path: "crates/trust_substrate_litesvm_tests/tests/agent_stake.rs",
        marker: "treasury_before + 100_000_000",
      },
    ],
  },
  {
    wave: "W4",
    item: "W4.1 permissionless reputation projection with verdict-gated disputes",
    status: "complete",
    evidence: [
      {
        path: "programs/reputation_accumulator/src/instructions/apply_reputation_receipt.rs",
        marker: "ReputationVerdictMissing",
      },
      {
        path: "crates/trust_substrate_litesvm_tests/tests/reputation_domains.rs",
        marker: "requires_a_verdict_before_a_dispute_can_degrade_reputation",
      },
      {
        path: "tests/reputation_domains.ts",
        marker:
          "requires a verdict before dispute receipts can degrade reputation",
      },
    ],
  },
  {
    wave: "W4",
    item: "W4.2 task-domain scoped reputation flow",
    status: "complete",
    evidence: [
      {
        path: "programs/task_registry/src/state/task_record.rs",
        marker: "pub domain: [u8; 32]",
      },
      {
        path: "programs/receipt_emitter/src/instructions/emit_receipt.rs",
        marker: "TaskDomainMismatch",
      },
      {
        path: "programs/receipt_emitter/src/instructions/emit_delegated_receipt.rs",
        marker: "TaskDomainMismatch",
      },
      {
        path: "crates/trust_substrate_litesvm_tests/tests/receipt_chain.rs",
        marker: "rejects_receipts_whose_domain_does_not_match_the_task",
      },
      {
        path: "tests/verification/protocol_workspace.test.ts",
        marker: "program docs reflect task-domain enforcement",
      },
    ],
  },
  {
    wave: "W5",
    item: "W5.1 on-chain rotation instruction with emergency path",
    status: "complete",
    evidence: [
      {
        path: "programs/identity_registry/src/instructions/rotate_authority.rs",
        marker: "AuthorityRotationUnlockTooSoon",
      },
      {
        path: "programs/identity_registry/src/instructions/finalize_authority_rotation.rs",
        marker: "AUTHORITY_ROTATION_MODE_NORMAL",
      },
      {
        path: "programs/identity_registry/src/instructions/initialize_guardian_set.rs",
        marker: "GuardianSetInitialized",
      },
      {
        path: "programs/identity_registry/src/instructions/emergency_rotate_authority.rs",
        marker: "AUTHORITY_ROTATION_MODE_EMERGENCY",
      },
      {
        path: "programs/identity_registry/src/state/guardian_set.rs",
        marker: "pub struct GuardianSet",
      },
      {
        path: "crates/trust_substrate_litesvm_tests/tests/identity_rotation.rs",
        marker:
          "emergency_rotation_swaps_authority_and_clears_pending_rotation",
      },
      {
        path: "tests/identity_rotation.ts",
        marker:
          "requires guardian threshold and authorized signers for emergency rotation",
      },
    ],
  },
  {
    wave: "W5",
    item: "W5.2 SDK and indexer hooks",
    status: "complete",
    evidence: [
      {
        path: "packages/sdk/src/client.ts",
        marker: "emergencyRotateAuthority",
      },
      { path: "packages/sdk/src/rotation.ts", marker: "configureGuardianSet" },
      {
        path: "packages/indexer/src/local-durable-indexer.ts",
        marker: "getAuthorityHistory",
      },
      {
        path: "tests/indexer/analytics.test.ts",
        marker: "getAuthorityHistory returns ordered rotation markers",
      },
      {
        path: "tests/sdk/trust_substrate_sdk.test.ts",
        marker: "models emergency guardian rotation with sdk identity helpers",
      },
      {
        path: "docs/plans/hardening-plan.md",
        marker: "identity.emergencyRotateAuthority",
      },
    ],
  },
  {
    wave: "W6",
    item: "W6.1 tiered identities and identity bonding",
    status: "complete",
    evidence: [
      {
        path: "programs/identity_registry/src/state/agent_identity.rs",
        marker: "pub tier: u8",
      },
      {
        path: "programs/identity_registry/src/state/identity_bond.rs",
        marker: "pub struct IdentityBond",
      },
      {
        path: "programs/identity_registry/src/instructions/deposit_identity_bond.rs",
        marker: "IDENTITY_BOND_LAMPORTS",
      },
      {
        path: "programs/identity_registry/src/instructions/withdraw_identity_bond.rs",
        marker: "IdentityHasOpenChallenges",
      },
      {
        path: "programs/receipt_emitter/src/instructions/emit_audit_receipt.rs",
        marker: "IdentityBondRequired",
      },
      {
        path: "crates/trust_substrate_litesvm_tests/tests/sybil_gating.rs",
        marker: "tier0_identities_cannot_emit_audit_receipts_until_bonded",
      },
    ],
  },
  {
    wave: "W6",
    item: "W6.2 permissionless attester registry with bonded tiers",
    status: "complete",
    evidence: [
      {
        path: "programs/attester_registry/src/instructions/register_attester.rs",
        marker: "AttesterRegistered",
      },
      {
        path: "programs/attester_registry/src/instructions/set_attester_tier.rs",
        marker: "AttesterTierUpdated",
      },
      {
        path: "programs/attester_registry/src/state/attester_record.rs",
        marker: "effective_tier",
      },
      {
        path: "crates/trust_substrate_litesvm_tests/tests/provenance_and_attesters.rs",
        marker: "attester_registry_requires_identity_bond_and_supports_tier_updates",
      },
      {
        path: "packages/indexer/src/local-durable-indexer.ts",
        marker: "getAttesterRecords",
      },
      {
        path: "tests/indexer/analytics.test.ts",
        marker: "attestedOnly leaderboard filters unattested agents",
      },
    ],
  },
  {
    wave: "W7",
    item: "W7.1 versioned runtime attestation",
    status: "complete",
    evidence: [
      {
        path: "programs/identity_registry/src/instructions/append_runtime_attestation.rs",
        marker: "RuntimeAttestationAppended",
      },
      {
        path: "programs/identity_registry/src/state/runtime_attestation.rs",
        marker: "valid_from_slot",
      },
      {
        path: "crates/trust_substrate_litesvm_tests/tests/provenance_and_attesters.rs",
        marker: "runtime_attestations_append_versioned_history",
      },
      {
        path: "packages/sdk/src/runtime-attestation.ts",
        marker: "resolveRuntimeAtSlot",
      },
      {
        path: "tests/sdk/provenance.test.ts",
        marker: "resolveRuntimeAtSlot returns the active runtime version",
      },
    ],
  },
  {
    wave: "W7",
    item: "W7.2 signed execution steps",
    status: "complete",
    evidence: [
      {
        path: "packages/sdk/src/execution-record.ts",
        marker: "verifyExecutionRecord",
      },
      {
        path: "tests/sdk/provenance.test.ts",
        marker:
          "verifyExecutionRecord separates signed, unsigned, and forged steps",
      },
    ],
  },
  {
    wave: "W7",
    item: "W7.3 cost / effort fields",
    status: "complete",
    evidence: [
      {
        path: "packages/sdk/src/reputation.ts",
        marker: "weightByCost",
      },
      {
        path: "tests/sdk/provenance.test.ts",
        marker: "deriveReputation can weight completions by execution cost",
      },
    ],
  },
  {
    wave: "W8",
    item: "W8.1 rewrite docs to distinguish enforced vs convention",
    status: "complete",
    evidence: [
      {
        path: "docs/architecture.md",
        marker: "Scope tags used in this document:",
      },
      {
        path: "docs/programs.md",
        marker:
          "Unless noted otherwise, every account, instruction signature, and behavior guarantee in this document is [on-chain].",
      },
      {
        path: "docs/off-chain-storage.md",
        marker:
          "[indexer] A consumer that trusts only the chain reconstructs state as follows:",
      },
      {
        path: "docs/security.md",
        marker:
          "[on-chain] Only the identity authority can create identity-scoped state",
      },
      {
        path: "docs/threat-model.md",
        marker: "| #23 | only `ReceiptCommitted` event emitted | W0.4 |",
      },
      {
        path: "tests/audit/doc_boundaries.test.ts",
        marker: "threat model maps all 23 findings to workstreams",
      },
    ],
  },
  {
    wave: "W8",
    item: "W8.2 mark SDK helpers that are not on-chain equivalents",
    status: "complete",
    evidence: [
      {
        path: "packages/sdk/src/challenge.ts",
        marker: "[sdk] This module builds receipt payloads.",
      },
      {
        path: "packages/sdk/src/commit-reveal.ts",
        marker: "[sdk] This module builds receipt payloads.",
      },
      {
        path: "packages/sdk/src/data-availability.ts",
        marker: "[sdk] This module builds receipt payloads.",
      },
      {
        path: "packages/sdk/src/challenge.ts",
        marker: "@deprecated Use buildUnansweredChallengePayload",
      },
      {
        path: "tests/sdk/challenge.test.ts",
        marker: "createUnansweredChallengeDispute",
      },
    ],
  },
  {
    wave: "W8",
    item: "W8.3 README truthing",
    status: "complete",
    evidence: [
      { path: "README.md", marker: "Slashing is not automatic." },
      { path: "README.md", marker: "SDK-enforced at submit time" },
      { path: "README.md", marker: "must re-verify them during replay" },
      {
        path: "tests/audit/readme_truthing.test.ts",
        marker: "README truths the current slashing and replay guarantees",
      },
    ],
  },
] as const;

const PLAN = readFileSync(PLAN_PATH, "utf8");
const SCOREBOARD_DOC = readFileSync(SCOREBOARD_PATH, "utf8");
const SCOREBOARD_DOC_ROWS = SCOREBOARD_DOC.split("\n")
  .filter((line) => line.startsWith("|"))
  .map((line) =>
    line
      .split("|")
      .slice(1, -1)
      .map((cell) => cell.trim())
  );

function hasScoreboardRow(
  wave: ScoreboardItem["wave"],
  item: string,
  status: ScoreStatus
) {
  return SCOREBOARD_DOC_ROWS.some(
    (row) => row[0] === wave && row[1] === item && row[2] === status
  );
}

const COMPLETED_WAVES = [
  "W0",
  "W1",
  "W2",
  "W3",
  "W4",
  "W5",
  "W6",
  "W7",
  "W8",
] as const;

test("hardening scoreboard covers completed W0-W8 items exactly once", () => {
  const items = SCOREBOARD.map((entry) => `${entry.wave}:${entry.item}`);
  deepStrictEqual(items, [
    "W0:W0.1 validate receipt chain on-chain",
    "W0:W0.2 canonical domain registry",
    "W0:W0.3 repurpose policy_root and history_root",
    "W0:W0.4 emit events on every state change",
    "W0:W0.5 replace init_if_needed with explicit guards",
    "W1:W1.1 split self-emit vs audit-emit",
    "W1:W1.2 response window + timeout primitive",
    "W2:W2.1 incremental checkpoint from actual receipts",
    "W2:W2.2 restrict caller-supplied root instead of removing it",
    "W3:W3.1 separate adjudication from slashing",
    "W3:W3.2 bind slash to verdict with authority mode opt-in",
    "W3:W3.3 protocol treasury",
    "W4:W4.1 permissionless reputation projection with verdict-gated disputes",
    "W4:W4.2 task-domain scoped reputation flow",
    "W5:W5.1 on-chain rotation instruction with emergency path",
    "W5:W5.2 SDK and indexer hooks",
    "W6:W6.1 tiered identities and identity bonding",
    "W6:W6.2 permissionless attester registry with bonded tiers",
    "W7:W7.1 versioned runtime attestation",
    "W7:W7.2 signed execution steps",
    "W7:W7.3 cost / effort fields",
    "W8:W8.1 rewrite docs to distinguish enforced vs convention",
    "W8:W8.2 mark SDK helpers that are not on-chain equivalents",
    "W8:W8.3 README truthing",
  ]);
});

test("hardening scoreboard is readable in docs and anchored to the plan", () => {
  for (const wave of COMPLETED_WAVES) {
    ok(
      PLAN.includes(`- [x] ${wave}`),
      `${wave} should be checked in the hardening plan summary`
    );
  }

  ok(PLAN.includes("### W0.1 Validate receipt chain on-chain"));
  ok(
    PLAN.includes(
      "### W1.1 Split receipt emission into self-emit vs audit-emit"
    )
  );
  ok(PLAN.includes("### W2.1 Incremental checkpoint from actual receipts"));
  ok(PLAN.includes("### W3.1 Separate adjudication from slashing"));
  ok(
    PLAN.includes(
      "### W3.2 Bind slash to verdict, keep authority path as opt-in tier"
    )
  );
  ok(PLAN.includes("### W3.3 Protocol treasury"));
  ok(PLAN.includes("### W4.1 Remove self-application"));
  ok(PLAN.includes("### W4.2 Scope domain per identity-task"));
  ok(
    PLAN.includes(
      "### W5.1 On-chain rotation instruction (with emergency path)"
    )
  );
  ok(PLAN.includes("### W5.2 SDK and indexer hooks"));
  ok(PLAN.includes("### W6.1 Tiered identities (not binary bonded)"));
  ok(
    PLAN.includes(
      "### W6.2 Permissionless attester registry with bonded tiers"
    )
  );
  ok(PLAN.includes("### W7.1 Versioned runtime attestation"));
  ok(PLAN.includes("### W7.2 Signed execution steps"));
  ok(PLAN.includes("### W7.3 Cost / effort fields"));
  ok(
    PLAN.includes("### W8.1 Rewrite docs to distinguish enforced vs convention")
  );
  ok(
    PLAN.includes("### W8.2 Mark SDK helpers that are NOT on-chain equivalents")
  );
  ok(PLAN.includes("### W8.3 README truthing"));

  ok(SCOREBOARD_DOC.includes("# Hardening Plan Scoreboard"));
  ok(
    hasScoreboardRow("W0", "W0.1 validate receipt chain on-chain", "complete")
  );
  ok(
    hasScoreboardRow(
      "W1",
      "W1.2 response window + timeout primitive",
      "complete"
    )
  );
  ok(
    hasScoreboardRow(
      "W2",
      "W2.2 restrict caller-supplied root instead of removing it",
      "complete"
    )
  );
  ok(
    hasScoreboardRow(
      "W3",
      "W3.1 separate adjudication from slashing",
      "complete"
    )
  );
  ok(
    hasScoreboardRow(
      "W3",
      "W3.2 bind slash to verdict with authority mode opt-in",
      "complete"
    )
  );
  ok(
    hasScoreboardRow(
      "W4",
      "W4.1 permissionless reputation projection with verdict-gated disputes",
      "complete"
    )
  );
  ok(
    hasScoreboardRow(
      "W4",
      "W4.2 task-domain scoped reputation flow",
      "complete"
    )
  );
  ok(hasScoreboardRow("W3", "W3.3 protocol treasury", "complete"));
  ok(
    hasScoreboardRow(
      "W5",
      "W5.1 on-chain rotation instruction with emergency path",
      "complete"
    )
  );
  ok(hasScoreboardRow("W5", "W5.2 SDK and indexer hooks", "complete"));
  ok(
    hasScoreboardRow(
      "W6",
      "W6.1 tiered identities and identity bonding",
      "complete"
    )
  );
  ok(
    hasScoreboardRow(
      "W6",
      "W6.2 permissionless attester registry with bonded tiers",
      "complete"
    )
  );
  ok(
    hasScoreboardRow("W7", "W7.1 versioned runtime attestation", "complete")
  );
  ok(hasScoreboardRow("W7", "W7.2 signed execution steps", "complete"));
  ok(hasScoreboardRow("W7", "W7.3 cost / effort fields", "complete"));
  ok(
    hasScoreboardRow(
      "W8",
      "W8.1 rewrite docs to distinguish enforced vs convention",
      "complete"
    )
  );
  ok(
    hasScoreboardRow(
      "W8",
      "W8.2 mark SDK helpers that are not on-chain equivalents",
      "complete"
    )
  );
  ok(hasScoreboardRow("W8", "W8.3 README truthing", "complete"));
});

test("completed scoreboard rows have concrete file evidence", () => {
  for (const item of SCOREBOARD) {
    if (item.status !== "complete") continue;

    for (const evidence of item.evidence) {
      const absolutePath = join(REPO_ROOT, evidence.path);
      const source = readFileSync(absolutePath, "utf8");
      ok(
        source.includes(evidence.marker ?? ""),
        `${evidence.path} missing ${evidence.marker ?? "marker"}`
      );
    }
  }
});

test("missing scoreboard rows declare explicit gaps", () => {
  const missing = SCOREBOARD.filter((item) => item.status === "missing");

  strictEqual(missing.length, 0);
  for (const item of missing) {
    ok(item.gap && item.gap.length > 0, `${item.item} gap missing`);
    strictEqual(item.evidence.length, 0);
  }
});

test("W0.5 has no init_if_needed surface left in program sources", () => {
  const programRoot = join(REPO_ROOT, "programs");
  const stack = [programRoot];
  const matches: string[] = [];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;

    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(path);
        continue;
      }

      if (!entry.name.endsWith(".rs")) continue;
      const contents = readFileSync(path, "utf8");
      if (contents.includes("init_if_needed")) {
        matches.push(path);
      }
    }
  }

  deepStrictEqual(matches, []);
});
