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
  ok(bundle.edits.every((edit) => typeof edit.path === "string" && edit.path.length > 0));
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
