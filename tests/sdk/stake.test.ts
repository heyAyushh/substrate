import test from "node:test";
import { deepStrictEqual, strictEqual, throws } from "node:assert/strict";
import {
  STAKE_EVENT_MARKER,
  TrustSubstrateClient,
  createStakeEvent,
  deriveStakeState,
  extractStakeEventsFromReceipt,
} from "../../packages/sdk/src/index.js";

test("derives stake state from ordered receipt payload events", () => {
  const identityId = "agent-builder";
  const events = [
    createStakeEvent({
      kind: "initialized",
      identityId,
      ownerId: "owner-wallet",
      slashAuthorityId: "arbiter-wallet",
    }),
    createStakeEvent({
      kind: "deposited",
      identityId,
      amountLamports: 1_000_000n,
    }),
    createStakeEvent({
      kind: "unstake_requested",
      identityId,
      amountLamports: 250_000n,
      unlocksAtSlot: 50,
    }),
    createStakeEvent({
      kind: "unstake_finalized",
      identityId,
      amountLamports: 250_000n,
    }),
    createStakeEvent({
      kind: "slashed",
      identityId,
      amountLamports: 100_000n,
      disputeReceiptId: "dispute-resolution-receipt",
    }),
  ];

  const state = deriveStakeState(identityId, events);

  strictEqual(state.identityId, identityId);
  strictEqual(state.ownerId, "owner-wallet");
  strictEqual(state.slashAuthorityId, "arbiter-wallet");
  strictEqual(state.activeLamports, 650_000n);
  strictEqual(state.pendingUnstakeLamports, 0n);
  strictEqual(state.slashedLamports, 100_000n);
  deepStrictEqual(state.slashReceiptIds, ["dispute-resolution-receipt"]);
});

test("rejects invalid stake amounts before they enter receipt payloads", () => {
  throws(
    () =>
      createStakeEvent({
        kind: "deposited",
        identityId: "agent-builder",
        amountLamports: 0n,
      }),
    /positive/i,
  );

  throws(
    () =>
      createStakeEvent({
        kind: "slashed",
        identityId: "agent-builder",
        amountLamports: "-1",
      }),
    /positive/i,
  );
});

test("extracts stake payload events and dispute resolution slashing", () => {
  const client = new TrustSubstrateClient();
  const stakeEvent = client.stake.createEvent({
    kind: "deposited",
    identityId: "agent-builder",
    amountLamports: "500000",
  });
  const receipt = client.receipt.create({
    actorId: "arbiter-agent",
    kind: "dispute_resolved",
    taskId: "task-1",
    sequence: 1,
    payload: {
      domain: "coding",
      stakeEvents: [stakeEvent],
      resolution: {
        outcome: "agent_lost",
        slashedAgentId: "agent-builder",
        slashAmountLamports: "125000",
      },
    },
  });

  const extracted = client.stake.extractEvents(receipt);

  strictEqual(extracted.length, 2);
  strictEqual(extracted[0].type, STAKE_EVENT_MARKER);
  strictEqual(extracted[0].kind, "deposited");
  strictEqual(extracted[1].kind, "slashed");
  strictEqual(extracted[1].identityId, "agent-builder");
  strictEqual(extracted[1].amountLamports, "125000");
  strictEqual(extracted[1].disputeReceiptId, receipt.receiptId);
  strictEqual(
    deriveStakeState("agent-builder", extracted).activeLamports,
    375_000n,
  );
});
