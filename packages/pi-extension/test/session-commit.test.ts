import test from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert/strict";

import type {
  Address,
  TransactionSigner,
} from "@solana/kit";
import type {
  IdentityRecord,
  PiBridgeCommitInput,
  PiBridgeCommitResult,
  PiToolStreamBridge,
  ReceiptIndexRecord,
  ReceiptIndexWriter,
  TaskRecord,
} from "@trust-substrate/sdk";

import {
  buildBridgeCommitInput,
  createSubstrateSessionCommitter,
  type SubstrateBindings,
} from "../src/session-commit.js";

const SESSION_ID = "session-test";

const buildBindings = (): SubstrateBindings => {
  const authority = {
    address: "AAA11111111111111111111111111111111111111111" as Address,
  } as TransactionSigner;
  const identity: IdentityRecord = {
    identityId: "identity-xyz",
    authority: "AAA11111111111111111111111111111111111111111",
    label: "pi-local-agent",
    policyRoot: "0x00",
    historyRoot: "0x00",
  };
  const task: TaskRecord = {
    taskId: "task-xyz",
    identityId: "identity-xyz",
    title: "pi coding session",
    domain: "general",
    subtasks: [],
  };
  return {
    authority,
    identity,
    identityAddress: "IDN11111111111111111111111111111111111111111" as Address,
    task,
    taskAddress: "TSK11111111111111111111111111111111111111111" as Address,
    domainCatalogAddress:
      "DMC11111111111111111111111111111111111111111" as Address,
  };
};

test("buildBridgeCommitInput shapes a completion-kind commit with turn-scoped recordId", () => {
  const bindings = buildBindings();
  const commit = buildBridgeCommitInput(
    { bridge: {} as PiToolStreamBridge<ReceiptIndexWriter>, bindings, sessionId: SESSION_ID },
    {
      turnIndex: 2,
      toolCalls: [
        {
          tool: "read",
          args: { path: "src/a.ts" },
          startedAt: "2026-04-17T00:00:01Z",
          endedAt: "2026-04-17T00:00:02Z",
        },
      ],
    }
  );

  strictEqual(commit.kind, "completion");
  strictEqual(commit.sequence, 3);
  strictEqual(commit.recordId, `pi:${SESSION_ID}:turn-2`);
  strictEqual(commit.identityAddress, bindings.identityAddress);
  strictEqual(commit.taskAddress, bindings.taskAddress);
  strictEqual(commit.domainCatalogAddress, bindings.domainCatalogAddress);
  deepStrictEqual(commit.payload, { sessionId: SESSION_ID, turnIndex: 2 });
  strictEqual(commit.toolCalls.length, 1);
});

test("buildBridgeCommitInput defaults sessionId to task.taskId and applies sequenceBase", () => {
  const bindings = buildBindings();
  const commit = buildBridgeCommitInput(
    {
      bridge: {} as PiToolStreamBridge<ReceiptIndexWriter>,
      bindings,
      sequenceBase: 10,
    },
    {
      turnIndex: 0,
      toolCalls: [
        {
          tool: "bash",
          args: { command: "pnpm test" },
          startedAt: "2026-04-17T00:00:01Z",
        },
      ],
    }
  );
  strictEqual(commit.recordId, `pi:${bindings.task.taskId}:turn-0`);
  strictEqual(commit.sequence, 11);
});

test("createSubstrateSessionCommitter commits each turn via the bridge and invokes onCommitted", async () => {
  const bindings = buildBindings();
  const committed: PiBridgeCommitInput[] = [];
  const stubResult: PiBridgeCommitResult = {
    execution: { record: { recordId: "r", identityId: "i", taskId: "t", steps: [] } },
    receipt: {
      receiptId: "rcpt-1",
      hash: "h",
      actorId: "a",
      kind: "completion",
      taskId: "task-xyz",
      payload: {},
      sequence: 1,
      domain: "general",
    },
    indexedReceipt: {
      receiptId: "rcpt-1",
      slot: 42,
      taskId: "task-xyz",
      actorId: "a",
      kind: "completion",
      domain: "general",
      payload: {},
    } as ReceiptIndexRecord,
    onchain: {
      receiptAddress: "RCT11111111111111111111111111111111111111111" as Address,
      operations: [],
    },
  };
  const bridge = {
    commit: async (input: PiBridgeCommitInput): Promise<PiBridgeCommitResult> => {
      committed.push(input);
      return stubResult;
    },
  } as unknown as PiToolStreamBridge<ReceiptIndexWriter>;

  const callbacks: PiBridgeCommitResult[] = [];
  const handler = createSubstrateSessionCommitter({
    bridge,
    bindings,
    sessionId: SESSION_ID,
    onCommitted: (result) => {
      callbacks.push(result);
    },
  });

  await handler({
    turnIndex: 0,
    toolCalls: [
      {
        tool: "read",
        args: { path: "src/a.ts" },
        startedAt: "2026-04-17T00:00:01Z",
      },
    ],
  });

  strictEqual(committed.length, 1);
  strictEqual(committed[0]?.recordId, `pi:${SESSION_ID}:turn-0`);
  strictEqual(committed[0]?.sequence, 1);
  strictEqual(callbacks.length, 1);
  strictEqual(callbacks[0]?.receipt.receiptId, "rcpt-1");
});
