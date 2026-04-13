import test from "node:test";
import { deepStrictEqual, ok, strictEqual } from "node:assert/strict";
import {
  LocalDurableIndexer,
  type LocalReceiptRecord,
} from "../../packages/indexer/src/index.js";

const receipt = (
  overrides: Partial<LocalReceiptRecord> & {
    receiptId: string;
    slot: number;
    taskId: string;
    actorId: string;
    kind: string;
  }
): LocalReceiptRecord => ({
  domain: "ops",
  payload: {},
  ...overrides,
});

test("getAgentProfile aggregates domains, kinds, models, tools", () => {
  const indexer = new LocalDurableIndexer();
  indexer.ingest([
    receipt({
      receiptId: "r1",
      slot: 1,
      taskId: "t1",
      actorId: "agent-a",
      kind: "assignment",
      payload: { model: "claude-opus-4-6", tool: "grep" },
    }),
    receipt({
      receiptId: "r2",
      slot: 2,
      taskId: "t1",
      actorId: "agent-a",
      kind: "handoff",
      domain: "ops",
      payload: { toAgentId: "agent-b" },
    }),
    receipt({
      receiptId: "r3",
      slot: 3,
      taskId: "t1",
      actorId: "agent-a",
      kind: "completion",
      domain: "research",
      payload: { model: "claude-opus-4-6", tool: "grep" },
    }),
  ]);

  const profile = indexer.getAgentProfile("agent-a");
  strictEqual(profile.receiptCount, 3);
  deepStrictEqual(profile.handoffPartners, ["agent-b"]);
  strictEqual(profile.modelUsage["claude-opus-4-6"], 2);
  strictEqual(profile.toolUsage["grep"], 2);
  strictEqual(profile.domains.ops, 2);
  strictEqual(profile.domains.research, 1);
  strictEqual(profile.kinds.handoff, 1);
});

test("getAgentLeaderboard ranks by weighted score", () => {
  const indexer = new LocalDurableIndexer();
  indexer.ingest([
    receipt({
      receiptId: "r1",
      slot: 1,
      taskId: "t1",
      actorId: "agent-a",
      kind: "completion",
    }),
    receipt({
      receiptId: "r2",
      slot: 2,
      taskId: "t2",
      actorId: "agent-b",
      kind: "dispute",
    }),
    receipt({
      receiptId: "r3",
      slot: 3,
      taskId: "t3",
      actorId: "agent-b",
      kind: "completion",
    }),
  ]);

  const board = indexer.getAgentLeaderboard();
  strictEqual(board[0].agentId, "agent-a");
  strictEqual(board[0].score, 5);
  strictEqual(board[1].agentId, "agent-b");
  strictEqual(board[1].score, 1);
});

test("attestedOnly leaderboard filters unattested agents", () => {
  const indexer = new LocalDurableIndexer();
  indexer.ingest([
    receipt({
      receiptId: "r1",
      slot: 1,
      taskId: "t1",
      actorId: "agent-a",
      kind: "completion",
    }),
    receipt({
      receiptId: "r2",
      slot: 2,
      taskId: "t1",
      actorId: "agent-b",
      kind: "completion",
    }),
    receipt({
      receiptId: "r3",
      slot: 3,
      taskId: "t1",
      actorId: "attester",
      kind: "attestation",
      payload: { target: "agent-a", kind: "kyc" },
    }),
  ]);

  const board = indexer.getAgentLeaderboard({ attestedOnly: true });
  strictEqual(board.length, 1);
  strictEqual(board[0].agentId, "agent-a");
  strictEqual(board[0].attestations, 1);
});

test("getAttestations returns attestations targeting an agent", () => {
  const indexer = new LocalDurableIndexer();
  indexer.ingest([
    receipt({
      receiptId: "r1",
      slot: 1,
      taskId: "t1",
      actorId: "attester-a",
      kind: "attestation",
      payload: {
        target: "agent-a",
        kind: "review",
        evidenceUri: "ipfs://review",
        evidenceHash: "hash-a",
      },
    }),
    receipt({
      receiptId: "r2",
      slot: 2,
      taskId: "t2",
      actorId: "attester-b",
      kind: "attestation",
      payload: {
        target: "agent-b",
        kind: "review",
        evidenceHash: "hash-b",
      },
    }),
  ]);

  const attestations = indexer.getAttestations("agent-a");

  strictEqual(attestations.length, 1);
  strictEqual(attestations[0].targetId, "agent-a");
  strictEqual(attestations[0].attesterId, "attester-a");
  strictEqual(attestations[0].evidenceUri, "ipfs://review");
});

test("getAuthorityHistory returns ordered rotation markers", () => {
  const indexer = new LocalDurableIndexer();
  indexer.ingest([
    receipt({
      receiptId: "r1",
      slot: 3,
      taskId: "t1",
      actorId: "agent-a",
      kind: "handoff",
      payload: {
        type: "trust-substrate.authority_rotated",
        previousAuthority: "old-authority",
        newAuthority: "new-authority",
      },
    }),
    receipt({
      receiptId: "r2",
      slot: 1,
      taskId: "t1",
      actorId: "agent-a",
      kind: "assignment",
      payload: { note: "not a rotation" },
    }),
  ]);

  const history = indexer.getAuthorityHistory("agent-a");

  strictEqual(history.length, 1);
  strictEqual(history[0].receiptId, "r1");
  strictEqual(history[0].previousAuthority, "old-authority");
  strictEqual(history[0].newAuthority, "new-authority");
});

test("getToolQualityStats computes per-tool success rate", () => {
  const indexer = new LocalDurableIndexer();
  indexer.ingest([
    receipt({
      receiptId: "r1",
      slot: 1,
      taskId: "t1",
      actorId: "agent-a",
      kind: "completion",
      payload: { tool: "grep" },
    }),
    receipt({
      receiptId: "r2",
      slot: 2,
      taskId: "t2",
      actorId: "agent-a",
      kind: "dispute",
      payload: { tool: "grep" },
    }),
    receipt({
      receiptId: "r3",
      slot: 3,
      taskId: "t3",
      actorId: "agent-a",
      kind: "completion",
      payload: { tool: "edit" },
    }),
  ]);

  const stats = indexer.getToolQualityStats("agent-a");
  const byTool = Object.fromEntries(stats.map((stat) => [stat.tool, stat]));
  strictEqual(byTool.grep.attempts, 2);
  strictEqual(byTool.grep.completions, 1);
  strictEqual(byTool.grep.disputes, 1);
  strictEqual(byTool.grep.successRate, 0.5);
  strictEqual(byTool.edit.successRate, 1);
});

test("getAgentTraceBundle projects file edit receipts", () => {
  const indexer = new LocalDurableIndexer();
  indexer.ingest([
    receipt({
      receiptId: "r1",
      slot: 1,
      taskId: "t1",
      actorId: "agent-a",
      kind: "file_edit",
      payload: { path: "src/a.ts", afterHash: "aa" },
    }),
    receipt({
      receiptId: "r2",
      slot: 2,
      taskId: "t1",
      actorId: "agent-a",
      kind: "assignment",
      payload: { note: "unrelated" },
    }),
    receipt({
      receiptId: "r3",
      slot: 3,
      taskId: "t1",
      actorId: "agent-b",
      kind: "completion",
      payload: { path: "src/b.ts" },
    }),
  ]);

  const bundle = indexer.getAgentTraceBundle("t1");
  strictEqual(bundle.version, "0.1.0");
  strictEqual(bundle.taskId, "t1");
  deepStrictEqual(bundle.agentIds, ["agent-a", "agent-b"]);
  strictEqual(bundle.edits.length, 2);
  ok(
    bundle.edits.every(
      (edit) => typeof edit.path === "string" && edit.path.length > 0
    )
  );
});

test("tracks expired unrevealed commit receipts", () => {
  const indexer = new LocalDurableIndexer();
  indexer.ingest([
    receipt({
      receiptId: "commit-1",
      slot: 5,
      taskId: "t1",
      actorId: "agent-a",
      kind: "assignment",
      payload: {
        commitMarker: true,
        commitHash: "hash-a",
        revealDeadlineSlot: 10,
      },
    }),
    receipt({
      receiptId: "commit-2",
      slot: 6,
      taskId: "t2",
      actorId: "agent-b",
      kind: "assignment",
      payload: {
        commitMarker: true,
        commitHash: "hash-b",
        revealDeadlineSlot: 10,
      },
    }),
    receipt({
      receiptId: "reveal-2",
      slot: 8,
      taskId: "t2",
      actorId: "agent-b",
      kind: "completion",
      payload: {
        revealMarker: true,
        commitReceiptId: "commit-2",
        commitHash: "hash-b",
      },
    }),
  ]);

  const expired = indexer.getExpiredCommitments(11);

  strictEqual(expired.length, 1);
  strictEqual(expired[0].commitReceiptId, "commit-1");
  strictEqual(expired[0].expired, true);
  strictEqual(expired[0].revealed, false);
});

test("tracks unanswered availability challenges", () => {
  const indexer = new LocalDurableIndexer();
  indexer.ingest([
    receipt({
      receiptId: "challenge-1",
      slot: 10,
      taskId: "t1",
      actorId: "agent-reviewer",
      kind: "challenge",
      payload: {
        challengeTarget: "receipt-target",
        deadlineSlot: 20,
      },
    }),
    receipt({
      receiptId: "challenge-2",
      slot: 11,
      taskId: "t1",
      actorId: "agent-reviewer",
      kind: "challenge",
      payload: {
        challengeTarget: "receipt-target-2",
        deadlineSlot: 20,
      },
    }),
    receipt({
      receiptId: "response-2",
      slot: 12,
      taskId: "t1",
      actorId: "agent-a",
      kind: "challenge_response",
      payload: {
        challengeReceiptId: "challenge-2",
        evidenceHash: "hash",
      },
    }),
  ]);

  const unanswered = indexer.getUnansweredChallenges(21);

  strictEqual(indexer.isChallengeUnansweredAfter("challenge-1", 21), true);
  strictEqual(indexer.isChallengeUnansweredAfter("challenge-2", 21), false);
  strictEqual(unanswered.length, 1);
  strictEqual(unanswered[0].challengeReceiptId, "challenge-1");
  strictEqual(unanswered[0].expired, true);
});
