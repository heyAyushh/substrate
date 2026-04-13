import test from "node:test";
import { ok, rejects, strictEqual, throws } from "node:assert/strict";
import {
  createChallengeReceipt,
  createChallengeResponseReceipt,
  createCommitReceipt,
  createDisputeReceipt,
  createReceiptFromExecution,
  createRevealReceipt,
  createStakeEvent,
  createUnansweredChallengeDispute,
  createVerifiedReceiptFromExecution,
  DataAvailabilityError,
  deriveReputation,
  deriveStakeState,
  extractStakeEventsFromReceipt,
  hashExecutionRecord,
  TrustSubstrateClient,
  type ExecutionRecord,
  type ReceiptRecord,
} from "../../packages/sdk/src/index.js";
import { hashCanonical } from "../../packages/sdk/src/canonical.js";

const client = new TrustSubstrateClient();

const makeRecord = (taskId: string, identityId: string): ExecutionRecord => ({
  recordId: `rec-${taskId}`,
  identityId,
  taskId,
  steps: [
    {
      seq: 1,
      kind: "tool_call",
      startedAt: "2026-04-13T00:00:01Z",
      payload: { tool: "grep", args: ["trust"] },
    },
    {
      seq: 2,
      kind: "file_edit",
      startedAt: "2026-04-13T00:00:02Z",
      payload: { path: "src/a.ts", afterHash: "after" },
    },
  ],
});

test("E2E #1: DA proof rejects an unreachable blob at submit time", async () => {
  const builder = client.identity.create({
    authority: "wallet-builder",
    label: "builder",
  });
  const task = client.task.create({
    identityId: builder.identityId,
    title: "produce-evidence",
  });
  const record = makeRecord(task.taskId, builder.identityId);

  await rejects(
    () =>
      createVerifiedReceiptFromExecution({
        record,
        kind: "completion",
        domain: "research",
        actorId: builder.identityId,
        sequence: 1,
        storage: {
          uri: "memory://missing",
          verify: true,
          hash: hashCanonical(record),
          fetcher: async () => {
            throw new Error("blob gone");
          },
        },
      }),
    (error: unknown) => {
      const err = error as DataAvailabilityError;
      strictEqual(err.name, "DataAvailabilityError");
      strictEqual(err.reason, "unreachable");
      return true;
    }
  );
});

test("E2E #2: unanswered challenge turns into a slash via dispute_resolved", () => {
  const builder = client.identity.create({
    authority: "wallet-builder",
    label: "builder",
  });
  const reviewer = client.identity.create({
    authority: "wallet-reviewer",
    label: "reviewer",
  });
  const task = client.task.create({
    identityId: builder.identityId,
    title: "audit-evidence",
  });
  const record = makeRecord(task.taskId, builder.identityId);

  const completion = createReceiptFromExecution({
    record,
    kind: "completion",
    domain: "research",
    actorId: builder.identityId,
    sequence: 1,
  });
  const challenge = createChallengeReceipt({
    actorId: reviewer.identityId,
    taskId: task.taskId,
    sequence: 2,
    domain: "research",
    targetReceiptId: completion.receiptId,
    deadlineSlot: 100,
  });
  const dispute = createUnansweredChallengeDispute({
    actorId: reviewer.identityId,
    taskId: task.taskId,
    sequence: 3,
    domain: "research",
    challengeReceiptId: challenge.receiptId,
    targetReceiptId: completion.receiptId,
  });
  const resolution = createDisputeReceipt({
    actorId: reviewer.identityId,
    sequence: 4,
    domain: "research",
    targetReceiptId: dispute.receiptId,
    record,
    stepSeq: 2,
    evidenceHash: "ev-hash",
    resolution: { outcome: "agent_lost", slashAmount: 100_000n },
  });

  const initStake = createStakeEvent({
    kind: "initialized",
    identityId: builder.identityId,
    ownerId: "owner-wallet",
    slashAuthorityId: "arbiter-wallet",
  });
  const deposit = createStakeEvent({
    kind: "deposited",
    identityId: builder.identityId,
    amountLamports: 1_000_000n,
  });
  const stakeInitReceipt: ReceiptRecord = {
    ...completion,
    payload: { ...completion.payload, stakeEvents: [initStake, deposit] },
  };

  const slashResolution: ReceiptRecord = {
    ...resolution,
    payload: {
      ...resolution.payload,
      resolution: {
        outcome: "agent_lost",
        slashedAgentId: builder.identityId,
        slashAmountLamports: "100000",
      },
    },
  };

  const events = [
    ...extractStakeEventsFromReceipt(stakeInitReceipt),
    ...extractStakeEventsFromReceipt(slashResolution),
  ];
  const state = deriveStakeState(builder.identityId, events);

  strictEqual(state.activeLamports, 900_000n);
  strictEqual(state.slashedLamports, 100_000n);
  ok(state.slashReceiptIds.includes(resolution.receiptId));
});

test("E2E #3a: commit-reveal happy path does not penalize the committer", () => {
  const agent = client.identity.create({
    authority: "wallet-a",
    label: "bidder",
  });
  const task = client.task.create({
    identityId: agent.identityId,
    title: "sealed-bid",
  });
  const sealed = { bid: 42, memo: "sealed" };

  const commit = createCommitReceipt({
    actorId: agent.identityId,
    taskId: task.taskId,
    sequence: 1,
    domain: "auction",
    payload: sealed,
    revealDeadlineSlot: 100,
  });
  const reveal = createRevealReceipt({
    actorId: agent.identityId,
    taskId: task.taskId,
    sequence: 2,
    domain: "auction",
    commitReceiptId: commit.receiptId,
    commitHash: commit.payload.commitHash as string,
    payload: sealed,
  });

  const profile = deriveReputation([commit, reveal], { currentSlot: 200 });
  strictEqual(profile.byKind.dispute, 0);
});

test("E2E #3b: unrevealed commit past deadline is treated as a dispute", () => {
  const agent = client.identity.create({
    authority: "wallet-a",
    label: "bidder",
  });
  const task = client.task.create({
    identityId: agent.identityId,
    title: "sealed-bid",
  });
  const commit = createCommitReceipt({
    actorId: agent.identityId,
    taskId: task.taskId,
    sequence: 1,
    domain: "auction",
    payload: { bid: 42 },
    revealDeadlineSlot: 10,
  });

  const before = deriveReputation([commit], { currentSlot: 10 });
  const after = deriveReputation([commit], { currentSlot: 11 });
  ok(after.overall < before.overall);
  strictEqual(after.byKind.dispute, 1);
});

test("E2E #3c: mismatched reveal is rejected at submit time", () => {
  const agent = client.identity.create({
    authority: "wallet-a",
    label: "bidder",
  });
  const task = client.task.create({
    identityId: agent.identityId,
    title: "sealed-bid",
  });
  const commit = createCommitReceipt({
    actorId: agent.identityId,
    taskId: task.taskId,
    sequence: 1,
    domain: "auction",
    payload: { bid: 42 },
  });

  throws(() =>
    createRevealReceipt({
      actorId: agent.identityId,
      taskId: task.taskId,
      sequence: 2,
      domain: "auction",
      commitReceiptId: commit.receiptId,
      commitHash: commit.payload.commitHash as string,
      payload: { bid: 9999 },
    })
  );
});

test("E2E #4: challenge followed by a response does not produce a dispute", () => {
  const builder = client.identity.create({
    authority: "wallet-builder",
    label: "builder",
  });
  const reviewer = client.identity.create({
    authority: "wallet-reviewer",
    label: "reviewer",
  });
  const task = client.task.create({
    identityId: builder.identityId,
    title: "answer-challenge",
  });
  const record = makeRecord(task.taskId, builder.identityId);
  const completion = createReceiptFromExecution({
    record,
    kind: "completion",
    domain: "research",
    actorId: builder.identityId,
    sequence: 1,
  });
  const challenge = createChallengeReceipt({
    actorId: reviewer.identityId,
    taskId: task.taskId,
    sequence: 2,
    domain: "research",
    targetReceiptId: completion.receiptId,
    deadlineSlot: 100,
  });
  const response = createChallengeResponseReceipt({
    actorId: builder.identityId,
    taskId: task.taskId,
    sequence: 3,
    domain: "research",
    challengeReceiptId: challenge.receiptId,
    evidenceHash: "ev-hash",
  });

  const profile = deriveReputation([completion, challenge, response], {
    currentSlot: 101,
  });
  strictEqual(profile.byKind.dispute, 0);
  ok(profile.overall > 0);
});

test("E2E #5: stake lifecycle — deposit, unstake request, finalize", () => {
  const agent = client.identity.create({
    authority: "wallet-builder",
    label: "builder",
  });
  const events = [
    createStakeEvent({
      kind: "initialized",
      identityId: agent.identityId,
      ownerId: "owner",
      slashAuthorityId: "arbiter",
    }),
    createStakeEvent({
      kind: "deposited",
      identityId: agent.identityId,
      amountLamports: 1_000_000n,
    }),
    createStakeEvent({
      kind: "unstake_requested",
      identityId: agent.identityId,
      amountLamports: 250_000n,
      unlocksAtSlot: 50,
    }),
    createStakeEvent({
      kind: "unstake_finalized",
      identityId: agent.identityId,
      amountLamports: 250_000n,
    }),
  ];

  const state = deriveStakeState(agent.identityId, events);
  strictEqual(state.activeLamports, 750_000n);
  strictEqual(state.pendingUnstakeLamports, 0n);
  strictEqual(state.unstakeUnlocksAtSlot, undefined);
  strictEqual(state.slashedLamports, 0n);
});

test("E2E #6: dispute receipt binds to the exact step of an execution record", () => {
  const builder = client.identity.create({
    authority: "wallet-builder",
    label: "builder",
  });
  const task = client.task.create({
    identityId: builder.identityId,
    title: "step-binding",
  });
  const record = makeRecord(task.taskId, builder.identityId);
  const completion = createReceiptFromExecution({
    record,
    kind: "completion",
    domain: "research",
    actorId: builder.identityId,
    sequence: 1,
  });
  const dispute = createDisputeReceipt({
    actorId: "reviewer",
    sequence: 2,
    domain: "research",
    targetReceiptId: completion.receiptId,
    record,
    stepSeq: 2,
    evidenceHash: "ev",
  });

  strictEqual(dispute.payload.stepSeq, 2);
  strictEqual(
    completion.payload.payloadHash,
    hashExecutionRecord(record).root.toString("hex")
  );
});
