import test from "node:test";
import { ok, strictEqual, throws } from "node:assert/strict";
import {
  createCommitReceipt,
  createRevealReceipt,
  deriveReputation,
} from "../../packages/sdk/src/index.js";

const payload = { bid: 42, memo: "sealed" };

test("commit receipt embeds canonical hash of the sealed payload", () => {
  const commit = createCommitReceipt({
    actorId: "agent-a",
    taskId: "task-1",
    sequence: 1,
    domain: "auction",
    payload,
    revealDeadlineSlot: 1000,
  });

  strictEqual(commit.payload.commitMarker, true);
  strictEqual(typeof commit.payload.commitHash, "string");
  strictEqual(commit.payload.revealDeadlineSlot, 1000);
});

test("matching reveal produces a receipt bound to the commit", () => {
  const commit = createCommitReceipt({
    actorId: "agent-a",
    taskId: "task-1",
    sequence: 1,
    domain: "auction",
    payload,
  });

  const reveal = createRevealReceipt({
    actorId: "agent-a",
    taskId: "task-1",
    sequence: 2,
    domain: "auction",
    commitReceiptId: commit.receiptId,
    commitHash: commit.payload.commitHash as string,
    payload,
  });

  strictEqual(reveal.payload.revealMarker, true);
  strictEqual(reveal.payload.commitReceiptId, commit.receiptId);
  strictEqual(reveal.payload.commitHash, commit.payload.commitHash);
  ok(reveal.payload.reveal);
});

test("mismatched reveal is rejected", () => {
  const commit = createCommitReceipt({
    actorId: "agent-a",
    taskId: "task-1",
    sequence: 1,
    domain: "auction",
    payload,
  });

  throws(() =>
    createRevealReceipt({
      actorId: "agent-a",
      taskId: "task-1",
      sequence: 2,
      domain: "auction",
      commitReceiptId: commit.receiptId,
      commitHash: commit.payload.commitHash as string,
      payload: { bid: 99 },
    })
  );
});

test("expired unrevealed commits penalize derived reputation", () => {
  const commit = createCommitReceipt({
    actorId: "agent-a",
    taskId: "task-1",
    sequence: 1,
    domain: "auction",
    payload,
    revealDeadlineSlot: 10,
  });

  const beforeDeadline = deriveReputation([commit], { currentSlot: 10 });
  const afterDeadline = deriveReputation([commit], { currentSlot: 11 });

  strictEqual(beforeDeadline.overall, 1);
  strictEqual(afterDeadline.overall, -3);
  strictEqual(afterDeadline.byKind.dispute, 1);
});

test("revealed commits are not penalized after the deadline", () => {
  const commit = createCommitReceipt({
    actorId: "agent-a",
    taskId: "task-1",
    sequence: 1,
    domain: "auction",
    payload,
    revealDeadlineSlot: 10,
  });
  const reveal = createRevealReceipt({
    actorId: "agent-a",
    taskId: "task-1",
    sequence: 2,
    domain: "auction",
    commitReceiptId: commit.receiptId,
    commitHash: commit.payload.commitHash as string,
    payload,
  });

  const reputation = deriveReputation([commit, reveal], { currentSlot: 11 });

  strictEqual(reputation.overall, 6);
  strictEqual(reputation.byKind.dispute, 0);
});
