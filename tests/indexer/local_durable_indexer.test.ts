import test from "node:test";
import { deepStrictEqual, ok, strictEqual, throws } from "node:assert/strict";
import {
  LocalDurableIndexer,
  type LocalReceiptRecord,
} from "../../packages/indexer/src/index.js";

const createReceipt = (
  overrides: Partial<LocalReceiptRecord>
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
    [10, 20, 30]
  );
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
