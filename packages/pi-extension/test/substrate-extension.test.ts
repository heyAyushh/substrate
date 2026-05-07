import test from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert/strict";

import type { Address, TransactionSigner } from "@solana/kit";
import {
  CHALLENGE_MARKER,
  UNANSWERED_CHALLENGE_MARKER,
  buildUnansweredChallengePayload,
  createReceipt,
  createIdentity,
  withPayloadHash,
  type ReceiptIndexRecord,
  type ReceiptRecord,
} from "@trust-substrate/sdk";

import { createLiveCommandHandlers } from "../src/substrate-extension.js";
import type { BootstrapResult } from "../src/session-bootstrap.js";

const buildBootstrap = (): BootstrapResult => {
  const authority = {
    address: "Auth111111111111111111111111111111111111111" as Address,
  } as TransactionSigner;
  return {
    authority,
    identity: {
      identityId: "identity-live",
      authority: authority.address,
      label: "pi-live-agent",
      policyRoot: "0x00",
      historyRoot: "0x00",
    },
    identityAddress: "Idnt111111111111111111111111111111111111111" as Address,
    task: {
      taskId: "task-live",
      identityId: "identity-live",
      title: "live pi session",
      domain: "coding",
      subtasks: [],
    },
    taskAddress: "Task111111111111111111111111111111111111111" as Address,
    domainCatalogAddress:
      "Dcat111111111111111111111111111111111111111" as Address,
    reputationAddress: "Repu111111111111111111111111111111111111111" as Address,
    operations: [],
  };
};

test("live command handlers deposit stake on Surfpool", async () => {
  const bootstrap = buildBootstrap();
  const calls: Array<{ method: string; amount?: bigint }> = [];
  const handlers = createLiveCommandHandlers({
    bridge: {
      indexer: {
        getTaskHistory: () => [],
        ingest: () => undefined,
      },
    } as never,
    client: {
      ensureStake: async () => {
        calls.push({ method: "ensureStake" });
        return {
          address: "Stake11111111111111111111111111111111111111" as Address,
          kind: "initialize_stake",
          slot: 1,
        };
      },
      stake: async ({ amount }: { amount: bigint }) => {
        calls.push({ method: "stake", amount });
        return {
          address: "Stake11111111111111111111111111111111111111" as Address,
          kind: "stake",
          slot: 2,
          signature: "sig-stake",
        };
      },
    } as never,
    bindings: bootstrap,
  });

  const signature = await handlers.stake?.(5000n);

  strictEqual(signature, "sig-stake");
  deepStrictEqual(calls, [
    { method: "ensureStake" },
    { method: "stake", amount: 5000n },
  ]);
});

test("live challenge commands emit a real challenge receipt", async () => {
  const bootstrap = buildBootstrap();
  const reviewer = createIdentity({
    authority: bootstrap.authority.address,
    label: `${bootstrap.identity.label}-reviewer`,
  });
  const emittedReceipts: ReceiptRecord[] = [];
  const ingestedReceipts: Array<{
    receiptId: string;
    slot: number;
    taskId: string;
    actorId: string;
    kind: string;
    domain: string;
    payload: Readonly<Record<string, unknown>>;
    sequence?: number;
  }> = [];
  const reviewerIdentityCalls: string[] = [];
  const reviewerBondCalls: Address[] = [];
  const targetBindingCalls: string[] = [];
  const auditBindingCalls: Array<{
    auditorIdentity: Address;
    targetReceipt: Address;
    kind: "challenge" | "dispute";
    round: number;
  }> = [];
  const auditEmissionCalls: Array<{
    auditorIdentity: Address;
    identityBond: Address;
    targetIdentity: Address;
    targetReceipt: Address;
    round: number;
    deadlineSlot: number | bigint;
  }> = [];
  const handlers = createLiveCommandHandlers({
    bridge: {
      indexer: {
        ingest: (receipts: ReadonlyArray<ReceiptIndexRecord>) => {
          ingestedReceipts.push(...receipts);
        },
        getTaskHistory: () => [
          {
            receiptId: "receipt-1",
            slot: 120,
            taskId: bootstrap.task.taskId,
            actorId: bootstrap.identity.identityId,
            kind: "completion",
            domain: bootstrap.task.domain,
            payload: {},
            sequence: 7,
            dedupeKey: "receipt-1:120",
          },
        ],
      },
    } as never,
    client: {
      ensureIdentity: async ({ identity }: { identity: { label: string } }) => {
        reviewerIdentityCalls.push(identity.label);
        return {
          address: "Rvwr111111111111111111111111111111111111111" as Address,
          kind: "create_identity",
          slot: 100,
        };
      },
      ensureIdentityBond: async ({ identity }: { identity: Address }) => {
        reviewerBondCalls.push(identity);
        return {
          address: "Bond111111111111111111111111111111111111111" as Address,
          kind: "deposit_identity_bond",
          slot: 101,
        };
      },
      bindReceipt: async ({ receipt }: { receipt: ReceiptRecord }) => {
        targetBindingCalls.push(receipt.receiptId);
        return {
          address: "RcptT11111111111111111111111111111111111111" as Address,
          receiptId: new Uint8Array(32),
          previousReceipt: new Uint8Array(32),
          payloadHash: new Uint8Array(32),
          domain: new Uint8Array(32),
        };
      },
      bindAuditReceipt: async ({
        auditorIdentity,
        targetReceipt,
        kind,
        round,
      }: {
        auditorIdentity: Address;
        targetReceipt: Address;
        kind: "challenge" | "dispute";
        round: number;
      }) => {
        auditBindingCalls.push({
          auditorIdentity,
          targetReceipt,
          kind,
          round,
        });
        return {
          address: "Acrh111111111111111111111111111111111111111" as Address,
          receiptId: new Uint8Array(32),
          previousReceipt: new Uint8Array(32),
          payloadHash: new Uint8Array(32),
          domain: new Uint8Array(32),
        };
      },
      emitAuditReceipt: async ({
        auditorIdentity,
        identityBond,
        targetIdentity,
        targetReceipt,
        round,
        deadlineSlot,
        receipt,
      }: {
        auditorIdentity: Address;
        identityBond: Address;
        targetIdentity: Address;
        targetReceipt: Address;
        round: number;
        deadlineSlot: number | bigint;
        receipt: ReceiptRecord;
      }) => {
        emittedReceipts.push(receipt);
        auditEmissionCalls.push({
          auditorIdentity,
          identityBond,
          targetIdentity,
          targetReceipt,
          round,
          deadlineSlot,
        });
        return {
          address: "Arcp111111111111111111111111111111111111111" as Address,
          kind: "emit_audit_receipt",
          slot: 121,
          signature: "sig-challenge",
        };
      },
    } as never,
    bindings: bootstrap,
  });

  const signature = await handlers.challenge?.("receipt-1");
  const challengeReceipt = emittedReceipts[0]!;

  strictEqual(signature, "sig-challenge");
  strictEqual(challengeReceipt.kind, "challenge");
  strictEqual(challengeReceipt.actorId, reviewer.identityId);
  strictEqual(challengeReceipt.auditorId, reviewer.identityId);
  strictEqual(challengeReceipt.targetReceiptId, "receipt-1");
  strictEqual(challengeReceipt.previousReceiptId, "receipt-1");
  strictEqual(challengeReceipt.round, 0);
  strictEqual(challengeReceipt.sequence, 8);
  strictEqual(challengeReceipt.payload.type, CHALLENGE_MARKER);
  strictEqual(challengeReceipt.payload.challengeTarget, "receipt-1");
  strictEqual(challengeReceipt.payload.deadlineSlot, 160);
  strictEqual(challengeReceipt.payload.auditRound, 0);
  strictEqual(typeof challengeReceipt.payload.payloadHash, "string");
  strictEqual((challengeReceipt.payload.payloadHash as string).length, 64);
  const canonicalChallengeReceipt = createReceipt({
    actorId: challengeReceipt.actorId,
    kind: challengeReceipt.kind,
    taskId: challengeReceipt.taskId,
    sequence: challengeReceipt.sequence,
    previousReceiptId: challengeReceipt.previousReceiptId,
    payload: challengeReceipt.payload,
  });
  strictEqual(challengeReceipt.receiptId, canonicalChallengeReceipt.receiptId);
  strictEqual(challengeReceipt.hash, canonicalChallengeReceipt.hash);
  deepStrictEqual(reviewerIdentityCalls, ["pi-live-agent-reviewer"]);
  deepStrictEqual(reviewerBondCalls, [
    "Rvwr111111111111111111111111111111111111111" as Address,
  ]);
  deepStrictEqual(targetBindingCalls, ["receipt-1"]);
  deepStrictEqual(auditEmissionCalls, [
    {
      auditorIdentity: "Rvwr111111111111111111111111111111111111111" as Address,
      identityBond: "Bond111111111111111111111111111111111111111" as Address,
      targetIdentity: "Idnt111111111111111111111111111111111111111" as Address,
      targetReceipt: "RcptT11111111111111111111111111111111111111" as Address,
      round: 0,
      deadlineSlot: 160,
    },
  ]);
  deepStrictEqual(ingestedReceipts, [
    {
      receiptId: challengeReceipt.receiptId,
      slot: 121,
      taskId: bootstrap.task.taskId,
      actorId: reviewer.identityId,
      kind: "challenge",
      domain: bootstrap.task.domain,
      payload: { ...challengeReceipt.payload },
      sequence: 8,
    },
  ]);
});

test("live dispute commands fall back to manual audit disputes before the challenge deadline", async () => {
  const bootstrap = buildBootstrap();
  const reviewer = createIdentity({
    authority: bootstrap.authority.address,
    label: `${bootstrap.identity.label}-reviewer`,
  });
  const emittedReceipts: ReceiptRecord[] = [];
  const ingestedReceipts: Array<{
    receiptId: string;
    slot: number;
    taskId: string;
    actorId: string;
    kind: string;
    domain: string;
    payload: Readonly<Record<string, unknown>>;
    sequence?: number;
  }> = [];
  const reviewerIdentityCalls: string[] = [];
  const reviewerBondCalls: Address[] = [];
  const targetBindingCalls: string[] = [];
  const auditBindingCalls: Array<{
    auditorIdentity: Address;
    targetReceipt: Address;
    kind: "challenge" | "dispute";
    round: number;
  }> = [];
  const finalizedChallenges: Array<{
    challenge: Address;
    targetReceipt: Address;
    targetIdentity: Address;
    auditorIdentity: Address;
    round: number;
  }> = [];
  const expectedDisputeReceipt = buildUnansweredChallengePayload({
    actorId: reviewer.identityId,
    taskId: bootstrap.task.taskId,
    sequence: 9,
    previousReceiptId: "challenge-1",
    domain: bootstrap.task.domain,
    challengeReceiptId: "challenge-1",
    targetReceiptId: "receipt-1",
  });
  const handlers = createLiveCommandHandlers({
    bridge: {
      indexer: {
        ingest: (receipts: ReadonlyArray<ReceiptIndexRecord>) => {
          ingestedReceipts.push(...receipts);
        },
        getTaskHistory: () => [
          {
            receiptId: "receipt-1",
            slot: 120,
            taskId: bootstrap.task.taskId,
            actorId: bootstrap.identity.identityId,
            kind: "completion",
            domain: bootstrap.task.domain,
            payload: {},
            sequence: 7,
            dedupeKey: "receipt-1:120",
          },
          {
            receiptId: "challenge-1",
            slot: 121,
            taskId: bootstrap.task.taskId,
            actorId: reviewer.identityId,
            kind: "challenge",
            domain: bootstrap.task.domain,
            payload: {
              type: CHALLENGE_MARKER,
              challengeTarget: "receipt-1",
              deadlineSlot: 200,
              auditRound: 0,
            },
            sequence: 8,
            dedupeKey: "challenge-1:121",
          },
        ],
        getChallengeRounds: () => [
          {
            challengeReceiptId: "challenge-1",
            answered: false,
          },
        ],
      },
    } as never,
    client: {
      getCurrentSlot: async () => 150,
      ensureIdentity: async ({ identity }: { identity: { label: string } }) => {
        reviewerIdentityCalls.push(identity.label);
        return {
          address: "Rvwr111111111111111111111111111111111111111" as Address,
          kind: "create_identity",
          slot: 100,
        };
      },
      ensureIdentityBond: async ({ identity }: { identity: Address }) => {
        reviewerBondCalls.push(identity);
        return {
          address: "Bond111111111111111111111111111111111111111" as Address,
          kind: "deposit_identity_bond",
          slot: 101,
        };
      },
      bindReceipt: async ({ receipt }: { receipt: ReceiptRecord }) => {
        targetBindingCalls.push(receipt.receiptId);
        if (receipt.receiptId === "receipt-1") {
          return {
            address: "RcptT11111111111111111111111111111111111111" as Address,
            receiptId: new Uint8Array(32),
            previousReceipt: new Uint8Array(32),
            payloadHash: new Uint8Array(32),
            domain: new Uint8Array(32),
          };
        }
        throw new Error(`unexpected bindReceipt target ${receipt.receiptId}`);
      },
      bindAuditReceipt: async ({
        auditorIdentity,
        targetReceipt,
        kind,
        round,
      }: {
        auditorIdentity: Address;
        targetReceipt: Address;
        kind: "challenge" | "dispute";
        round: number;
      }) => {
        auditBindingCalls.push({
          auditorIdentity,
          targetReceipt,
          kind,
          round,
        });
        return {
          address: "Acrh111111111111111111111111111111111111111" as Address,
          receiptId: new Uint8Array(32),
          previousReceipt: new Uint8Array(32),
          payloadHash: new Uint8Array(32),
          domain: new Uint8Array(32),
        };
      },
      emitAuditReceipt: async ({ receipt }: { receipt: ReceiptRecord }) => {
        emittedReceipts.push(receipt);
        return {
          address: "Adsp111111111111111111111111111111111111111" as Address,
          kind: "emit_audit_receipt",
          slot: 121,
          signature: "sig-dispute",
        };
      },
      finalizeUnansweredChallenge: async ({
        challenge,
        targetReceipt,
        targetIdentity,
        auditorIdentity,
        round,
      }: {
        challenge: Address;
        targetReceipt: Address;
        targetIdentity: Address;
        auditorIdentity: Address;
        round: number;
      }) => {
        finalizedChallenges.push({
          challenge,
          targetReceipt,
          targetIdentity,
          auditorIdentity,
          round,
        });
        return {
          address: "Fnlz111111111111111111111111111111111111111" as Address,
          kind: "finalize_unanswered_challenge",
          slot: 122,
          signature: "sig-finalize",
        };
      },
    } as never,
    bindings: bootstrap,
  });

  const signature = await handlers.dispute?.("receipt-1");
  const disputeReceipt = emittedReceipts[0]!;

  strictEqual(signature, "sig-dispute");
  strictEqual(finalizedChallenges.length, 0);
  strictEqual(disputeReceipt.kind, "dispute");
  strictEqual(disputeReceipt.actorId, reviewer.identityId);
  strictEqual(disputeReceipt.auditorId, reviewer.identityId);
  strictEqual(disputeReceipt.targetReceiptId, "receipt-1");
  strictEqual(disputeReceipt.round, 0);
  strictEqual(disputeReceipt.payload.type, UNANSWERED_CHALLENGE_MARKER);
  strictEqual(disputeReceipt.payload.challengeReceiptId, "challenge-1");
  strictEqual(disputeReceipt.payload.targetReceiptId, "receipt-1");
  strictEqual(typeof disputeReceipt.payload.payloadHash, "string");
  strictEqual((disputeReceipt.payload.payloadHash as string).length, 64);
  const canonicalDisputeReceipt = createReceipt({
    actorId: disputeReceipt.actorId,
    kind: disputeReceipt.kind,
    taskId: disputeReceipt.taskId,
    sequence: disputeReceipt.sequence,
    previousReceiptId: disputeReceipt.previousReceiptId,
    payload: disputeReceipt.payload,
  });
  strictEqual(disputeReceipt.receiptId, canonicalDisputeReceipt.receiptId);
  strictEqual(disputeReceipt.hash, canonicalDisputeReceipt.hash);
  deepStrictEqual(reviewerIdentityCalls, ["pi-live-agent-reviewer"]);
  deepStrictEqual(reviewerBondCalls, [
    "Rvwr111111111111111111111111111111111111111" as Address,
  ]);
  deepStrictEqual(targetBindingCalls, ["receipt-1"]);
  deepStrictEqual(ingestedReceipts, [
    {
      receiptId: disputeReceipt.receiptId,
      slot: 121,
      taskId: bootstrap.task.taskId,
      actorId: reviewer.identityId,
      kind: "dispute",
      domain: bootstrap.task.domain,
      payload: { ...disputeReceipt.payload },
      sequence: 9,
    },
  ]);
});

test("live dispute commands finalize unanswered challenges after the deadline elapses", async () => {
  const bootstrap = buildBootstrap();
  const reviewer = createIdentity({
    authority: bootstrap.authority.address,
    label: `${bootstrap.identity.label}-reviewer`,
  });
  const emittedReceipts: ReceiptRecord[] = [];
  const ingestedReceipts: Array<{
    receiptId: string;
    slot: number;
    taskId: string;
    actorId: string;
    kind: string;
    domain: string;
    payload: Readonly<Record<string, unknown>>;
    sequence?: number;
  }> = [];
  const auditBindingCalls: Array<{
    auditorIdentity: Address;
    targetReceipt: Address;
    kind: "challenge" | "dispute";
    round: number;
  }> = [];
  const finalizedChallenges: Array<{
    challenge: Address;
    targetReceipt: Address;
    targetIdentity: Address;
    auditorIdentity: Address;
    round: number;
  }> = [];
  const expectedDisputeReceipt = buildUnansweredChallengePayload({
    actorId: reviewer.identityId,
    taskId: bootstrap.task.taskId,
    sequence: 9,
    previousReceiptId: "challenge-1",
    domain: bootstrap.task.domain,
    challengeReceiptId: "challenge-1",
    targetReceiptId: "receipt-1",
  });
  const handlers = createLiveCommandHandlers({
    bridge: {
      indexer: {
        ingest: (receipts: ReadonlyArray<ReceiptIndexRecord>) => {
          ingestedReceipts.push(...receipts);
        },
        getTaskHistory: () => [
          {
            receiptId: "receipt-1",
            slot: 120,
            taskId: bootstrap.task.taskId,
            actorId: bootstrap.identity.identityId,
            kind: "completion",
            domain: bootstrap.task.domain,
            payload: {},
            sequence: 7,
            dedupeKey: "receipt-1:120",
          },
          {
            receiptId: "challenge-1",
            slot: 121,
            taskId: bootstrap.task.taskId,
            actorId: reviewer.identityId,
            kind: "challenge",
            domain: bootstrap.task.domain,
            payload: {
              type: CHALLENGE_MARKER,
              challengeTarget: "receipt-1",
              deadlineSlot: 140,
              auditRound: 0,
            },
            sequence: 8,
            dedupeKey: "challenge-1:121",
          },
        ],
        getChallengeRounds: () => [
          {
            challengeReceiptId: "challenge-1",
            answered: false,
          },
        ],
      },
    } as never,
    client: {
      getCurrentSlot: async () => 160,
      ensureIdentity: async () => ({
        address: "Rvwr111111111111111111111111111111111111111" as Address,
        kind: "create_identity",
        slot: 100,
      }),
      ensureIdentityBond: async () => ({
        address: "Bond111111111111111111111111111111111111111" as Address,
        kind: "deposit_identity_bond",
        slot: 101,
      }),
      bindReceipt: async ({ receipt }: { receipt: ReceiptRecord }) => {
        if (receipt.receiptId === "receipt-1") {
          return {
            address: "RcptT11111111111111111111111111111111111111" as Address,
            receiptId: new Uint8Array(32),
            previousReceipt: new Uint8Array(32),
            payloadHash: new Uint8Array(32),
            domain: new Uint8Array(32),
          };
        }
        throw new Error(`unexpected bindReceipt target ${receipt.receiptId}`);
      },
      bindAuditReceipt: async ({
        auditorIdentity,
        targetReceipt,
        kind,
        round,
      }: {
        auditorIdentity: Address;
        targetReceipt: Address;
        kind: "challenge" | "dispute";
        round: number;
      }) => {
        auditBindingCalls.push({
          auditorIdentity,
          targetReceipt,
          kind,
          round,
        });
        return {
          address: "Acrh111111111111111111111111111111111111111" as Address,
          receiptId: new Uint8Array(32),
          previousReceipt: new Uint8Array(32),
          payloadHash: new Uint8Array(32),
          domain: new Uint8Array(32),
        };
      },
      emitAuditReceipt: async ({ receipt }: { receipt: ReceiptRecord }) => {
        emittedReceipts.push(receipt);
        return {
          address: "Adsp111111111111111111111111111111111111111" as Address,
          kind: "emit_audit_receipt",
          slot: 121,
          signature: "sig-dispute",
        };
      },
      finalizeUnansweredChallenge: async ({
        challenge,
        targetReceipt,
        targetIdentity,
        auditorIdentity,
        round,
      }: {
        challenge: Address;
        targetReceipt: Address;
        targetIdentity: Address;
        auditorIdentity: Address;
        round: number;
      }) => {
        finalizedChallenges.push({
          challenge,
          targetReceipt,
          targetIdentity,
          auditorIdentity,
          round,
        });
        return {
          address: "Fnlz111111111111111111111111111111111111111" as Address,
          kind: "finalize_unanswered_challenge",
          slot: 122,
          signature: "sig-finalize",
        };
      },
    } as never,
    bindings: bootstrap,
  });

  const signature = await handlers.dispute?.("receipt-1");
  const canonicalFinalizedDisputeReceipt = createReceipt({
    actorId: expectedDisputeReceipt.actorId,
    kind: expectedDisputeReceipt.kind,
    taskId: expectedDisputeReceipt.taskId,
    sequence: expectedDisputeReceipt.sequence,
    previousReceiptId: expectedDisputeReceipt.previousReceiptId,
    payload: withPayloadHash({
      ...expectedDisputeReceipt.payload,
      auditRound: 0,
    }),
  });

  strictEqual(signature, "sig-finalize");
  strictEqual(emittedReceipts.length, 0);
  deepStrictEqual(finalizedChallenges, [
    {
      challenge: "Acrh111111111111111111111111111111111111111" as Address,
      targetReceipt: "RcptT11111111111111111111111111111111111111" as Address,
      targetIdentity: "Idnt111111111111111111111111111111111111111" as Address,
      auditorIdentity: "Rvwr111111111111111111111111111111111111111" as Address,
      round: 0,
    },
  ]);
  deepStrictEqual(auditBindingCalls, [
    {
      auditorIdentity: "Rvwr111111111111111111111111111111111111111" as Address,
      targetReceipt: "RcptT11111111111111111111111111111111111111" as Address,
      kind: "challenge",
      round: 0,
    },
  ]);
  deepStrictEqual(ingestedReceipts, [
    {
      receiptId: canonicalFinalizedDisputeReceipt.receiptId,
      slot: 122,
      taskId: bootstrap.task.taskId,
      actorId: reviewer.identityId,
      kind: "dispute",
      domain: bootstrap.task.domain,
      payload: { ...canonicalFinalizedDisputeReceipt.payload },
      sequence: 9,
    },
  ]);
});

test("live dispute commands fall back to manual disputes without open challenges", async () => {
  const bootstrap = buildBootstrap();
  const reviewer = createIdentity({
    authority: bootstrap.authority.address,
    label: `${bootstrap.identity.label}-reviewer`,
  });
  const emittedReceipts: ReceiptRecord[] = [];
  const auditBindingCalls: Array<{
    auditorIdentity: Address;
    targetReceipt: Address;
    kind: "challenge" | "dispute";
    round: number;
  }> = [];
  const targetBindingCalls: string[] = [];
  const handlers = createLiveCommandHandlers({
    bridge: {
      indexer: {
        ingest: () => undefined,
        getTaskHistory: () => [
          {
            receiptId: "receipt-1",
            slot: 120,
            taskId: bootstrap.task.taskId,
            actorId: bootstrap.identity.identityId,
            kind: "completion",
            domain: bootstrap.task.domain,
            payload: {},
            sequence: 7,
            dedupeKey: "receipt-1:120",
          },
        ],
        getChallengeRounds: () => [],
      },
    } as never,
    client: {
      getCurrentSlot: async () => 150,
      ensureIdentity: async () => ({
        address: "Rvwr111111111111111111111111111111111111111" as Address,
        kind: "create_identity",
        slot: 100,
      }),
      ensureIdentityBond: async () => ({
        address: "Bond111111111111111111111111111111111111111" as Address,
        kind: "deposit_identity_bond",
        slot: 101,
      }),
      bindReceipt: async ({ receipt }: { receipt: ReceiptRecord }) => {
        targetBindingCalls.push(receipt.receiptId);
        return {
          address: "RcptT11111111111111111111111111111111111111" as Address,
          receiptId: new Uint8Array(32),
          previousReceipt: new Uint8Array(32),
          payloadHash: new Uint8Array(32),
          domain: new Uint8Array(32),
        };
      },
      bindAuditReceipt: async ({
        auditorIdentity,
        targetReceipt,
        kind,
        round,
      }: {
        auditorIdentity: Address;
        targetReceipt: Address;
        kind: "challenge" | "dispute";
        round: number;
      }) => {
        auditBindingCalls.push({
          auditorIdentity,
          targetReceipt,
          kind,
          round,
        });
        return {
          address: "Acrh111111111111111111111111111111111111111" as Address,
          receiptId: new Uint8Array(32),
          previousReceipt: new Uint8Array(32),
          payloadHash: new Uint8Array(32),
          domain: new Uint8Array(32),
        };
      },
      emitAuditReceipt: async ({ receipt }: { receipt: ReceiptRecord }) => {
        emittedReceipts.push(receipt);
        return {
          address: "Rcpt111111111111111111111111111111111111111" as Address,
          kind: "emit_audit_receipt",
          slot: 121,
          signature: "sig-dispute-manual",
        };
      },
    } as never,
    bindings: bootstrap,
  });

  const signature = await handlers.dispute?.("receipt-1");
  const disputeReceipt = emittedReceipts[0]!;

  strictEqual(signature, "sig-dispute-manual");
  strictEqual(disputeReceipt.kind, "dispute");
  strictEqual(disputeReceipt.actorId, reviewer.identityId);
  strictEqual(disputeReceipt.auditorId, reviewer.identityId);
  strictEqual(disputeReceipt.targetReceiptId, "receipt-1");
  strictEqual(disputeReceipt.round, 0);
  strictEqual(disputeReceipt.payload.type, "trust-substrate.manual_dispute");
  strictEqual(disputeReceipt.payload.targetReceiptId, "receipt-1");
  strictEqual(typeof disputeReceipt.payload.payloadHash, "string");
  strictEqual((disputeReceipt.payload.payloadHash as string).length, 64);
  deepStrictEqual(targetBindingCalls, ["receipt-1"]);
});
