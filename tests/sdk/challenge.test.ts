import test from "node:test";
import { strictEqual } from "node:assert/strict";
import { generateKeyPairSigner, type Instruction, address } from "@solana/kit";
import {
  buildUnansweredChallengePayload,
  createChallengeReceipt,
  createChallengeResponseReceipt,
  createUnansweredChallengeDispute,
  TrustSubstrateOnchainClient,
  type OnchainTransactionDispatcher,
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
  strictEqual(typeof challenge.payload.payloadHash, "string");
  strictEqual((challenge.payload.payloadHash as string).length, 64);
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
  strictEqual(typeof response.payload.payloadHash, "string");
  strictEqual((response.payload.payloadHash as string).length, 64);
});

test("challenge responses derive the on-chain challenge-response account", async () => {
  const authority = await generateKeyPairSigner();
  const challenge = address("11111111111111111111111111111111");
  const targetIdentity = address("SysvarC1ock11111111111111111111111111111111");
  const sentInstructions: Instruction[] = [];
  const dispatcher: OnchainTransactionDispatcher = {
    send: async (instructions) => {
      sentInstructions.push(...instructions);
      return { slot: 123, signature: "challenge-response-signature" };
    },
  };
  const onchain = new TrustSubstrateOnchainClient(dispatcher);
  const receipt = createChallengeResponseReceipt({
    actorId: authority.address,
    taskId: "task-1",
    sequence: 2,
    domain: "availability",
    challengeReceiptId: "challenge-1",
    evidenceHash: "evidence-hash",
    evidenceUri: "ipfs://evidence",
  });

  const binding = await onchain.bindChallengeResponse({ challenge });
  const response = await onchain.emitChallengeResponse({
    authority,
    identity: authority.address,
    targetIdentity,
    challenge,
    receipt,
  });

  strictEqual(sentInstructions.length, 1);
  strictEqual(response.kind, "emit_challenge_response");
  strictEqual(response.address, binding.address);
});

test("unanswered challenge disputes carry a dispute-equivalent penalty", () => {
  const input = {
    actorId: "agent-reviewer",
    taskId: "task-1",
    sequence: 3,
    domain: "availability",
    challengeReceiptId: "challenge-1",
    targetReceiptId: "receipt-target",
  };
  const dispute = buildUnansweredChallengePayload(input);
  const deprecatedShim = createUnansweredChallengeDispute(input);

  const reputation = deriveReputation([dispute]);

  strictEqual(dispute.kind, "dispute");
  strictEqual(dispute.payload.challengeReceiptId, "challenge-1");
  strictEqual(typeof dispute.payload.payloadHash, "string");
  strictEqual((dispute.payload.payloadHash as string).length, 64);
  strictEqual(deprecatedShim.hash, dispute.hash);
  strictEqual(reputation.overall, -4);
});
