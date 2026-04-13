import test from "node:test";
import { strictEqual } from "node:assert/strict";
import {
  createChallengeReceipt,
  createChallengeResponseReceipt,
  createUnansweredChallengeDispute,
  deriveReputation,
} from "../../packages/sdk/src/index.js";

const CHALLENGE_DEADLINE_SLOT = 50;

test("challenge receipts use a zero-weight challenge kind", () => {
  const challenge = createChallengeReceipt({
    actorId: "agent-reviewer",
    taskId: "task-1",
    sequence: 1,
    domain: "availability",
    targetReceiptId: "receipt-target",
    deadlineSlot: CHALLENGE_DEADLINE_SLOT,
  });

  strictEqual(challenge.kind, "challenge");
  strictEqual(challenge.payload.challengeTarget, "receipt-target");
  strictEqual(challenge.payload.deadlineSlot, CHALLENGE_DEADLINE_SLOT);
  strictEqual(deriveReputation([challenge]).overall, 0);
});

test("challenge responses bind back to the challenge receipt", () => {
  const response = createChallengeResponseReceipt({
    actorId: "agent-a",
    taskId: "task-1",
    sequence: 2,
    domain: "availability",
    challengeReceiptId: "challenge-1",
    evidenceHash: "evidence-hash",
    evidenceUri: "ipfs://evidence",
  });

  strictEqual(response.kind, "challenge_response");
  strictEqual(response.payload.challengeReceiptId, "challenge-1");
  strictEqual(response.payload.evidenceUri, "ipfs://evidence");
});

test("unanswered challenge disputes carry a dispute-equivalent penalty", () => {
  const dispute = createUnansweredChallengeDispute({
    actorId: "agent-reviewer",
    taskId: "task-1",
    sequence: 3,
    domain: "availability",
    challengeReceiptId: "challenge-1",
    targetReceiptId: "receipt-target",
  });

  const reputation = deriveReputation([dispute]);

  strictEqual(dispute.kind, "dispute");
  strictEqual(dispute.payload.challengeReceiptId, "challenge-1");
  strictEqual(reputation.overall, -4);
});
