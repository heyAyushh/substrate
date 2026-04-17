import test from "node:test";
import { deepStrictEqual, ok, strictEqual } from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  SqliteDurableIndexer,
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

test("sqlite durable indexer restores snapshot and analytics across reopen", () => {
  const dir = mkdtempSync(join(tmpdir(), "sqlite-indexer-"));
  const path = join(dir, "indexer.sqlite");

  try {
    const original = new SqliteDurableIndexer({ path });
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
    original.ingestIdentityStates([
      {
        identityId: "agent-a",
        tier: "bonded",
        openTaskCount: 1,
        openChallengeCount: 0,
        activeStake: true,
      },
    ]);
    original.ingestAttesterRecords([
      {
        identityId: "agent-a",
        category: "builder",
        selfDeclaredTier: 2,
        effectiveTier: 2,
      },
    ]);
    const expected = original.snapshot();
    original.close();

    ok(existsSync(path), "sqlite db should exist on disk");

    const restored = new SqliteDurableIndexer({ path });
    deepStrictEqual(restored.snapshot(), expected);
    deepStrictEqual(
      restored.getExecutionGraph().tasks["task-1"]?.agentIds,
      ["agent-a", "agent-b"]
    );
    strictEqual(restored.getAuthorityHistory("agent-a").length, 1);
    strictEqual(restored.getIdentityStates()[0]?.tier, "bonded");
    strictEqual(restored.getAttesterRecords()[0]?.category, "builder");

    const replay = restored.ingest(sampleReceipts());
    strictEqual(replay.accepted, 0);
    strictEqual(replay.duplicates, 3);
    restored.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("sqlite durable indexer reset starts from an empty store", () => {
  const dir = mkdtempSync(join(tmpdir(), "sqlite-indexer-reset-"));
  const path = join(dir, "indexer.sqlite");

  try {
    const original = new SqliteDurableIndexer({ path });
    original.ingest(sampleReceipts());
    original.close();

    const reset = new SqliteDurableIndexer({ path, reset: true });
    strictEqual(reset.snapshot().receipts.length, 0);
    reset.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
