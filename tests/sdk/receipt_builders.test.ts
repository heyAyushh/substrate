import test from "node:test";
import { ok, strictEqual, throws } from "node:assert/strict";
import {
  createDisputeReceipt,
  createReceiptFromExecution,
  hashExecutionRecord,
  hashStep,
  type ExecutionRecord,
} from "../../packages/sdk/src/index.js";

const record: ExecutionRecord = {
  recordId: "rec-1",
  identityId: "identity-a",
  taskId: "task-1",
  steps: [
    {
      seq: 1,
      kind: "tool_call",
      startedAt: "2026-01-01T00:00:01Z",
      payload: { tool: "grep", args: ["-n"] },
    },
    {
      seq: 2,
      kind: "file_edit",
      startedAt: "2026-01-01T00:00:02Z",
      payload: { path: "src/a.ts" },
    },
  ],
};

test("createReceiptFromExecution embeds payloadHash from record root", () => {
  const receipt = createReceiptFromExecution({
    record,
    kind: "completion",
    domain: "research",
    actorId: "identity-a",
    sequence: 1,
  });

  strictEqual(receipt.kind, "completion");
  strictEqual(receipt.taskId, "task-1");
  strictEqual(receipt.domain, "research");
  strictEqual(receipt.payload.recordId, "rec-1");
  strictEqual(
    receipt.payload.payloadHash,
    hashExecutionRecord(record).root.toString("hex")
  );
});

test("createReceiptFromExecution carries the optional storage URI", () => {
  const receipt = createReceiptFromExecution({
    record,
    kind: "completion",
    domain: "research",
    actorId: "identity-a",
    sequence: 1,
    storage: { uri: "ipfs://cid", hash: "deadbeef" },
  });

  const storage = receipt.payload.storage as Record<string, string>;
  strictEqual(storage.uri, "ipfs://cid");
  strictEqual(storage.hash, "deadbeef");
});

test("createDisputeReceipt binds to the targeted step hash", () => {
  const receipt = createDisputeReceipt({
    actorId: "identity-b",
    sequence: 2,
    domain: "research",
    targetReceiptId: "receipt-target",
    record,
    stepSeq: 2,
    evidenceHash: "ev-hash",
  });

  strictEqual(receipt.kind, "dispute");
  strictEqual(receipt.payload.stepSeq, 2);
  strictEqual(receipt.payload.stepHash, hashStep(record.steps[1]));
  strictEqual(receipt.payload.targetReceiptId, "receipt-target");
});

test("createDisputeReceipt with resolution switches kind to dispute_resolved", () => {
  const receipt = createDisputeReceipt({
    actorId: "identity-b",
    sequence: 3,
    domain: "research",
    targetReceiptId: "receipt-target",
    record,
    stepSeq: 1,
    evidenceHash: "ev-hash",
    resolution: { outcome: "agent_lost", slashAmount: 1000n },
  });

  strictEqual(receipt.kind, "dispute_resolved");
  const resolution = receipt.payload.resolution as Record<string, string>;
  strictEqual(resolution.outcome, "agent_lost");
  strictEqual(resolution.slashAmount, "1000");
});

test("createDisputeReceipt rejects unknown step seq", () => {
  throws(() =>
    createDisputeReceipt({
      actorId: "identity-b",
      sequence: 1,
      domain: "research",
      targetReceiptId: "receipt-target",
      record,
      stepSeq: 99,
      evidenceHash: "ev",
    })
  );
});
