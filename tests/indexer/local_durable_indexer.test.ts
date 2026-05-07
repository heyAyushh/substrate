import test from "node:test";
import { deepStrictEqual, ok, strictEqual, throws } from "node:assert/strict";
import {
  LocalDurableIndexer,
  type LocalReceiptRecord,
} from "../../packages/indexer/src/index.js";

const createReceipt = (
  overrides: Partial<LocalReceiptRecord>,
): LocalReceiptRecord => ({
  receiptId: "receipt-1",
  slot: 1,
  taskId: "task-1",
  actorId: "agent-1",
  kind: "assignment",
  domain: "ops",
  payload: {},
  ...overrides,
});

test("idempotent writes do not duplicate indexed state", () => {
  const indexer = new LocalDurableIndexer();
  const receipt = createReceipt({ receiptId: "receipt-10", slot: 10 });

  const firstWrite = indexer.ingest([receipt]);
  const secondWrite = indexer.ingest([receipt]);

  strictEqual(firstWrite.accepted, 1);
  strictEqual(secondWrite.accepted, 0);
  strictEqual(indexer.getTaskHistory("task-1").length, 1);
  strictEqual(indexer.getAgentHistory("agent-1").length, 1);
});

test("backfill ordering reconstructs history by slot", () => {
  const indexer = new LocalDurableIndexer();

  indexer.ingest([
    createReceipt({ receiptId: "receipt-30", slot: 30, kind: "completion" }),
    createReceipt({ receiptId: "receipt-10", slot: 10, kind: "assignment" }),
    createReceipt({
      receiptId: "receipt-20",
      slot: 20,
      kind: "handoff",
      actorId: "agent-2",
      payload: { toAgentId: "agent-3" },
    }),
  ]);

  deepStrictEqual(
    indexer.getTaskHistory("task-1").map((receipt) => receipt.slot),
    [10, 20, 30],
  );
});

test("preserves explicit receipt sequences when indexing local history", () => {
  const indexer = new LocalDurableIndexer();

  indexer.ingest([
    {
      ...createReceipt({
        receiptId: "receipt-50",
        slot: 50,
        kind: "completion",
      }),
      sequence: 7,
    } as LocalReceiptRecord,
  ]);

  strictEqual(indexer.getTaskHistory("task-1")[0]?.sequence, 7);
});

test("flags mismatches against program-backed reputation accounts", () => {
  const indexer = new LocalDurableIndexer();
  indexer.ingest([
    createReceipt({
      receiptId: "receipt-60",
      slot: 60,
      actorId: "agent-a",
      domain: "ops",
      kind: "completion",
    }),
  ]);
  indexer.ingestProgramReputations([
    {
      identityId: "agent-a",
      domain: "ops",
      completed: "2",
      disputed: "0",
      resolved: "0",
      attested: "0",
      weightedCompleted: "2",
      weightedDisputed: "0",
      weightedResolved: "0",
      weightedAttested: "0",
      reviewerWeightSum: "2",
      slashPenaltySum: "0",
      lastAppliedSlot: "60",
    },
  ]);

  deepStrictEqual(indexer.getReputationReplayMismatches(), [
    {
      identityId: "agent-a",
      domain: "ops",
      scope: "legacy_receipt_replay",
      field: "completed",
      replayedValue: "1",
      programValue: "2",
    },
  ]);
});

test("flags weighted reputation and stale last-applied slot mismatches", () => {
  const indexer = new LocalDurableIndexer();
  indexer.ingest([
    createReceipt({
      receiptId: "receipt-61",
      slot: 61,
      actorId: "agent-a",
      domain: "ops",
      kind: "completion",
    }),
  ]);
  indexer.ingestProgramReputations([
    {
      identityId: "agent-a",
      domain: "ops",
      completed: "1",
      disputed: "0",
      resolved: "0",
      attested: "0",
      weightedCompleted: "0",
      weightedDisputed: "0",
      weightedResolved: "0",
      weightedAttested: "0",
      reviewerWeightSum: "0",
      slashPenaltySum: "0",
      lastAppliedSlot: "60",
    },
  ]);

  deepStrictEqual(indexer.getReputationReplayMismatches(), [
    {
      identityId: "agent-a",
      domain: "ops",
      scope: "weighted_reputation_minimum",
      field: "weightedCompleted",
      replayedValue: "1",
      programValue: "0",
    },
    {
      identityId: "agent-a",
      domain: "ops",
      scope: "last_applied_slot_replay",
      field: "lastAppliedSlot",
      replayedValue: "61",
      programValue: "60",
    },
  ]);
});

test("replays dispute resolutions without clearing negative verdict history", () => {
  const indexer = new LocalDurableIndexer();
  indexer.ingest([
    createReceipt({
      receiptId: "dispute-1",
      slot: 10,
      actorId: "agent-a",
      domain: "ops",
      kind: "dispute",
    }),
    createReceipt({
      receiptId: "resolution-1",
      slot: 20,
      actorId: "agent-a",
      domain: "ops",
      kind: "dispute_resolved",
      payload: { resolution: { outcome: "agent_lost" } },
    }),
    createReceipt({
      receiptId: "dispute-2",
      slot: 30,
      actorId: "agent-a",
      domain: "ops",
      kind: "dispute",
    }),
    createReceipt({
      receiptId: "resolution-2",
      slot: 40,
      actorId: "agent-a",
      domain: "ops",
      kind: "dispute_resolved",
      payload: { resolution: { outcome: "no_fault" } },
    }),
  ]);
  indexer.ingestProgramReputations([
    {
      identityId: "agent-a",
      domain: "ops",
      completed: "0",
      disputed: "2",
      resolved: "1",
      attested: "0",
      weightedCompleted: "0",
      weightedDisputed: "2",
      weightedResolved: "1",
      weightedAttested: "0",
      reviewerWeightSum: "3",
      slashPenaltySum: "0",
      lastAppliedSlot: "40",
    },
  ]);

  deepStrictEqual(indexer.getReputationReplayMismatches(), []);
});

test("reconstructs the execution graph from task and agent history", () => {
  const indexer = new LocalDurableIndexer();

  indexer.ingest([
    createReceipt({
      receiptId: "receipt-11",
      slot: 11,
      kind: "assignment",
      actorId: "agent-a",
      domain: "coordination",
    }),
    createReceipt({
      receiptId: "receipt-12",
      slot: 12,
      kind: "handoff",
      actorId: "agent-a",
      domain: "coordination",
      payload: { toAgentId: "agent-b" },
    }),
    createReceipt({
      receiptId: "receipt-13",
      slot: 13,
      kind: "completion",
      actorId: "agent-b",
      domain: "coordination",
    }),
  ]);

  const graph = indexer.getExecutionGraph();

  strictEqual(graph.receipts.length, 3);
  strictEqual(graph.tasks["task-1"].receipts.length, 3);
  deepStrictEqual(graph.tasks["task-1"].agents, ["agent-a", "agent-b"]);
  deepStrictEqual(graph.agents["agent-a"].taskIds, ["task-1"]);
  deepStrictEqual(graph.agents["agent-b"].taskIds, ["task-1"]);
});

test("exposes a full handoff chain for a task", () => {
  const indexer = new LocalDurableIndexer();

  indexer.ingest([
    createReceipt({
      receiptId: "receipt-21",
      slot: 21,
      kind: "handoff",
      actorId: "agent-a",
      payload: { toAgentId: "agent-b" },
    }),
    createReceipt({
      receiptId: "receipt-22",
      slot: 22,
      kind: "handoff",
      actorId: "agent-b",
      payload: { toAgentId: "agent-c" },
    }),
    createReceipt({
      receiptId: "receipt-23",
      slot: 23,
      kind: "completion",
      actorId: "agent-c",
    }),
  ]);

  deepStrictEqual(indexer.getHandoffChain("task-1"), [
    {
      receiptId: "receipt-21",
      slot: 21,
      fromAgentId: "agent-a",
      toAgentId: "agent-b",
      taskId: "task-1",
    },
    {
      receiptId: "receipt-22",
      slot: 22,
      fromAgentId: "agent-b",
      toAgentId: "agent-c",
      taskId: "task-1",
    },
  ]);
});

test("reconstructs a planner-alpha-beta delegated handoff chain", () => {
  const indexer = new LocalDurableIndexer();

  indexer.ingest([
    createReceipt({
      receiptId: "receipt-31",
      slot: 31,
      kind: "handoff",
      actorId: "planner",
      payload: { toAgentId: "alpha" },
    }),
    createReceipt({
      receiptId: "receipt-32",
      slot: 32,
      kind: "handoff",
      actorId: "alpha",
      payload: { toAgentId: "beta" },
    }),
    createReceipt({
      receiptId: "receipt-33",
      slot: 33,
      kind: "completion",
      actorId: "beta",
    }),
  ]);

  deepStrictEqual(indexer.getHandoffChain("task-1"), [
    {
      receiptId: "receipt-31",
      slot: 31,
      fromAgentId: "planner",
      toAgentId: "alpha",
      taskId: "task-1",
    },
    {
      receiptId: "receipt-32",
      slot: 32,
      fromAgentId: "alpha",
      toAgentId: "beta",
      taskId: "task-1",
    },
  ]);
});

test("derives task inheritance lineages from the handoff chain", () => {
  const indexer = new LocalDurableIndexer();

  indexer.ingest([
    createReceipt({
      receiptId: "receipt-51",
      slot: 51,
      kind: "assignment",
      actorId: "planner",
    }),
    createReceipt({
      receiptId: "receipt-52",
      slot: 52,
      kind: "handoff",
      actorId: "planner",
      payload: { toAgentId: "alpha" },
    }),
    createReceipt({
      receiptId: "receipt-53",
      slot: 53,
      kind: "handoff",
      actorId: "alpha",
      payload: { toAgentId: "beta" },
    }),
    createReceipt({
      receiptId: "receipt-54",
      slot: 54,
      kind: "completion",
      actorId: "beta",
    }),
  ]);

  const inheritance = indexer.getTaskInheritance("task-1");

  deepStrictEqual(inheritance.rootAgentIds, ["planner"]);
  deepStrictEqual(inheritance.lineageByAgent.planner, ["planner"]);
  deepStrictEqual(inheritance.lineageByAgent.alpha, ["planner", "alpha"]);
  deepStrictEqual(inheritance.lineageByAgent.beta, [
    "planner",
    "alpha",
    "beta",
  ]);
  strictEqual(inheritance.depthByAgent.beta, 2);
  deepStrictEqual(inheritance.completionLineageByReceipt["receipt-54"], [
    "planner",
    "alpha",
    "beta",
  ]);
});

test("rejects conflicting duplicate replays for the same receipt id and slot", () => {
  const indexer = new LocalDurableIndexer();
  const firstReceipt = createReceipt({
    receiptId: "receipt-99",
    slot: 99,
    payload: { attempt: 1 },
  });
  const conflictingReceipt = createReceipt({
    receiptId: "receipt-99",
    slot: 99,
    payload: { attempt: 2 },
  });

  indexer.ingest([firstReceipt]);

  throws(() => indexer.ingest([conflictingReceipt]), /duplicate/i);
  strictEqual(indexer.getTaskHistory("task-1").length, 1);
});

test("summarizes receipts by domain", () => {
  const indexer = new LocalDurableIndexer();

  indexer.ingest([
    createReceipt({
      receiptId: "receipt-41",
      slot: 41,
      domain: "ops",
      kind: "assignment",
    }),
    createReceipt({
      receiptId: "receipt-42",
      slot: 42,
      domain: "ops",
      kind: "handoff",
      actorId: "agent-2",
      payload: { toAgentId: "agent-3" },
    }),
    createReceipt({
      receiptId: "receipt-43",
      slot: 43,
      domain: "research",
      kind: "completion",
      actorId: "agent-3",
    }),
  ]);

  deepStrictEqual(indexer.getDomainSummary("ops"), {
    domain: "ops",
    receiptCount: 2,
    taskIds: ["task-1"],
    agentIds: ["agent-1", "agent-2"],
    handoffCount: 1,
    latestSlot: 42,
  });

  const allSummaries = indexer.getDomainSummaries();
  ok(allSummaries.some((summary) => summary.domain === "research"));
});
