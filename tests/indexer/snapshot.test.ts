import test from "node:test";
import { deepStrictEqual, strictEqual, throws } from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  LocalDurableIndexer,
  type LocalReceiptRecord,
} from "../../packages/indexer/src/index.js";

const sampleReceipts = (): LocalReceiptRecord[] => [
  {
    receiptId: "receipt-a",
    slot: 10,
    taskId: "task-1",
    actorId: "agent-a",
    kind: "assignment",
    domain: "ops",
    payload: { note: "kickoff" },
  },
  {
    receiptId: "receipt-b",
    slot: 20,
    taskId: "task-1",
    actorId: "agent-a",
    kind: "handoff",
    domain: "ops",
    payload: { toAgentId: "agent-b" },
  },
  {
    receiptId: "receipt-c",
    slot: 30,
    taskId: "task-1",
    actorId: "agent-b",
    kind: "completion",
    domain: "ops",
    payload: { outcome: "ok" },
  },
];

test("snapshot round-trip preserves execution graph", () => {
  const original = new LocalDurableIndexer();
  original.ingest(sampleReceipts());
  original.ingestAuthorityRotations([
    {
      eventId: "rotation-a",
      slot: 25,
      agentId: "agent-a",
      previousAuthority: "old-authority",
      newAuthority: "new-authority",
      mode: "normal",
    },
  ]);

  const snapshot = original.snapshot();
  strictEqual(snapshot.version, 2);
  strictEqual(snapshot.receipts.length, 3);
  strictEqual(snapshot.authorityRotations?.length, 1);

  const restored = LocalDurableIndexer.fromSnapshot(snapshot);
  deepStrictEqual(restored.getExecutionGraph(), original.getExecutionGraph());
  deepStrictEqual(
    restored.getHandoffChain("task-1"),
    original.getHandoffChain("task-1")
  );
  deepStrictEqual(
    restored.getAuthorityHistory("agent-a"),
    original.getAuthorityHistory("agent-a")
  );
});

test("saveSnapshot/loadSnapshot persist indexer state to disk", () => {
  const dir = mkdtempSync(join(tmpdir(), "indexer-snapshot-"));
  const path = join(dir, "snapshot.json");

  try {
    const original = new LocalDurableIndexer();
    original.ingest(sampleReceipts());
    original.saveSnapshot(path);

    const restored = LocalDurableIndexer.loadSnapshot(path);
    deepStrictEqual(restored.snapshot(), original.snapshot());
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("fromSnapshot rejects unsupported snapshot versions", () => {
  throws(
    () =>
      LocalDurableIndexer.fromSnapshot({
        version: 99 as 2,
        receipts: [],
      }),
    /unsupported snapshot version/i
  );
});

test("restored indexer accepts idempotent replay of the same receipts", () => {
  const original = new LocalDurableIndexer();
  original.ingest(sampleReceipts());

  const restored = LocalDurableIndexer.fromSnapshot(original.snapshot());
  const replay = restored.ingest(sampleReceipts());

  strictEqual(replay.accepted, 0);
  strictEqual(replay.duplicates, 3);
});
