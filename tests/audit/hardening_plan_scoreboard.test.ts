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
  readonly wave: "W0" | "W1" | "W2";
  readonly item: string;
  readonly status: ScoreStatus;
  readonly evidence: readonly { readonly path: string; readonly marker?: string }[];
  readonly gap?: string;
};

const SCOREBOARD: readonly ScoreboardItem[] = [
  {
    wave: "W0",
    item: "W0.1 validate receipt chain on-chain",
    status: "complete",
    evidence: [
      { path: "programs/task_registry/src/state/task_record.rs", marker: "last_receipt" },
      {
        path: "programs/receipt_emitter/src/instructions/emit_receipt.rs",
        marker: "ReceiptChainBroken",
      },
      {
        path: "programs/receipt_emitter/src/instructions/emit_delegated_receipt.rs",
        marker: "ReceiptSequenceNotMonotonic",
      },
      { path: "crates/trust_substrate_litesvm_tests/tests/receipt_chain.rs", marker: "ReceiptChainBroken" },
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
      { path: "tests/reputation_domains.ts", marker: "deprecated domain still validates receipts" },
    ],
  },
  {
    wave: "W0",
    item: "W0.3 repurpose policy_root and history_root",
    status: "complete",
    evidence: [
      { path: "programs/identity_registry/src/state/agent_identity.rs", marker: "policy_root" },
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
      { path: "programs/agent_stake/src/lib.rs", marker: "StakeUnstakeFinalized" },
      { path: "programs/proof_verifier/src/events.rs", marker: "CheckpointReceiptAppended" },
      { path: "programs/task_registry/src/events.rs", marker: "TaskStatusSynced" },
      { path: "programs/delegation_engine/src/events.rs", marker: "DelegationRevoked" },
      { path: "tests/trust_substrate.ts", marker: "DelegationCreated and DelegationRevoked events" },
      { path: "tests/agent_stake_events.ts", marker: "StakeUnstakeFinalized" },
      { path: "tests/proof_verifier_events.ts", marker: "checkpointReceiptAppended" },
    ],
  },
  {
    wave: "W0",
    item: "W0.5 replace init_if_needed with explicit guards",
    status: "complete",
    evidence: [
      { path: "programs/agent_stake/src/instructions/slash.rs", marker: "already_applied_handler" },
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
      { path: "programs/receipt_emitter/src/instructions/emit_receipt.rs", marker: "ReceiptKindNotSelfEmittable" },
      { path: "programs/receipt_emitter/src/instructions/emit_delegated_receipt.rs", marker: "ReceiptKindNotSelfEmittable" },
      { path: "programs/receipt_emitter/src/instructions/emit_audit_receipt.rs", marker: "ReceiptKindNotAuditable" },
      { path: "programs/receipt_emitter/src/state/receipt_record.rs", marker: "auditor_identity" },
      { path: "programs/receipt_emitter/src/events.rs", marker: "AuditReceiptCommitted" },
      { path: "crates/trust_substrate_litesvm_tests/tests/audit_receipts.rs", marker: "tracks_audit_receipts_without_advancing_the_task_chain" },
      { path: "tests/audit_receipts.ts", marker: "allows a reviewer identity to challenge another agent receipt" },
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
      { path: "programs/proof_verifier/src/instructions/initialize_checkpoint.rs", marker: "CheckpointCreated" },
      {
        path: "programs/proof_verifier/src/instructions/append_receipt_to_checkpoint.rs",
        marker: "CheckpointReceiptAppended",
      },
      { path: "programs/proof_verifier/src/instructions/rotate_checkpoint.rs", marker: "CheckpointRotated" },
      { path: "programs/proof_verifier/src/instructions/verify_receipt_inclusion.rs", marker: "InclusionVerified" },
      { path: "crates/trust_substrate_litesvm_tests/tests/proof_verifier.rs", marker: "append_receipt_to_checkpoint" },
      { path: "crates/trust_substrate_litesvm_tests/tests/protocol_flow.rs", marker: "history_root" },
      { path: "tests/proof_verifier_events.ts", marker: "checkpointReceiptAppended" },
      { path: "tests/trust_substrate.ts", marker: "appendReceiptToCheckpoint()" },
    ],
  },
  {
    wave: "W2",
    item: "W2.2 restrict caller-supplied root instead of removing it",
    status: "missing",
    evidence: [],
    gap: "No restricted caller-supplied root path or governance-gated checkpoint_import instruction exists yet.",
  },
] as const;

const PLAN = readFileSync(PLAN_PATH, "utf8");
const SCOREBOARD_DOC = readFileSync(SCOREBOARD_PATH, "utf8");

test("hardening scoreboard covers W0-W2 exactly once", () => {
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
  ]);
});

test("hardening scoreboard is readable in docs and anchored to the plan", () => {
  ok(PLAN.includes("### W0.1 Validate receipt chain on-chain"));
  ok(PLAN.includes("### W1.1 Split receipt emission into self-emit vs audit-emit"));
  ok(PLAN.includes("### W2.1 Incremental checkpoint from actual receipts"));

  ok(SCOREBOARD_DOC.includes("# Hardening Plan Scoreboard"));
  ok(SCOREBOARD_DOC.includes("| W0 | W0.1 validate receipt chain on-chain | complete |"));
  ok(SCOREBOARD_DOC.includes("| W1 | W1.2 response window + timeout primitive | complete |"));
  ok(SCOREBOARD_DOC.includes("| W2 | W2.2 restrict caller-supplied root instead of removing it | missing |"));
});

test("completed scoreboard rows have concrete file evidence", () => {
  for (const item of SCOREBOARD) {
    if (item.status !== "complete") continue;

    for (const evidence of item.evidence) {
      const absolutePath = join(REPO_ROOT, evidence.path);
      const source = readFileSync(absolutePath, "utf8");
      ok(source.includes(evidence.marker ?? ""), `${evidence.path} missing ${evidence.marker ?? "marker"}`);
    }
  }
});

test("missing scoreboard rows declare explicit gaps", () => {
  const missing = SCOREBOARD.filter((item) => item.status === "missing");

  strictEqual(missing.length, 1);
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
