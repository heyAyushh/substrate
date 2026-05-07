import test from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert/strict";

import type { Address, TransactionSigner } from "@solana/kit";
import type {
  IdentityRecord,
  PiBridgeCommitInput,
  PiBridgeCommitResult,
  PiToolStreamBridge,
  ReceiptIndexRecord,
  ReceiptIndexWriter,
  TaskRecord,
} from "@trust-substrate/sdk";

import { createTrustSubstrateExtension } from "../src/extension.js";
import { createSubstrateSessionCommitter } from "../src/session-commit.js";
import type { SubstrateBindings } from "../src/session-commit.js";

type Handlers = Map<string, Array<(event: unknown, ctx: unknown) => unknown>>;

const buildBindings = (): SubstrateBindings => {
  const authority = {
    address: "AAA11111111111111111111111111111111111111111" as Address,
  } as TransactionSigner;
  const identity: IdentityRecord = {
    identityId: "identity-e2e",
    authority: "AAA11111111111111111111111111111111111111111",
    label: "pi-local-agent",
    policyRoot: "0x00",
    historyRoot: "0x00",
  };
  const task: TaskRecord = {
    taskId: "task-e2e",
    identityId: "identity-e2e",
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
    reputationAddress:
      "REP11111111111111111111111111111111111111111" as Address,
  };
};

const createStubHost = () => {
  const handlers: Handlers = new Map();
  const on = (
    event: string,
    handler: (event: unknown, ctx: unknown) => unknown,
  ) => {
    const list = handlers.get(event) ?? [];
    list.push(handler);
    handlers.set(event, list);
  };
  const host = { on } as unknown as Parameters<
    ReturnType<typeof createTrustSubstrateExtension>
  >[0];
  const emit = async (event: string, payload: unknown) => {
    const list = handlers.get(event) ?? [];
    for (const handler of list) {
      await handler(payload, undefined);
    }
  };
  return { host, emit };
};

const buildStubBridge = (): {
  bridge: PiToolStreamBridge<ReceiptIndexWriter>;
  commits: PiBridgeCommitInput[];
  indexed: ReceiptIndexRecord[];
} => {
  const commits: PiBridgeCommitInput[] = [];
  const indexed: ReceiptIndexRecord[] = [];
  const indexer: ReceiptIndexWriter = {
    ingest(records) {
      for (const record of records) indexed.push(record);
    },
  };
  const bridge = {
    indexer,
    commit: async (
      input: PiBridgeCommitInput,
    ): Promise<PiBridgeCommitResult> => {
      commits.push(input);
      const receiptId = `rcpt-${input.recordId}`;
      const record: ReceiptIndexRecord = {
        receiptId,
        slot: commits.length,
        taskId: input.task.taskId,
        actorId: input.actorId ?? input.identity.identityId,
        kind: input.kind,
        domain: input.task.domain,
        payload: { recordId: input.recordId },
      };
      indexer.ingest([record]);
      return {
        execution: {
          record: {
            recordId: input.recordId,
            identityId: input.identity.identityId,
            taskId: input.task.taskId,
            steps: [],
          },
        },
        receipt: {
          receiptId,
          hash: "h",
          actorId: record.actorId,
          kind: input.kind,
          taskId: record.taskId,
          payload: record.payload,
          sequence: input.sequence,
          domain: record.domain,
        },
        indexedReceipt: record,
        onchain: {
          receiptAddress:
            `RCT${String(commits.length).padStart(41, "0")}` as Address,
          reputationAddress: input.reputationAddress,
          operations: [],
        },
        actionEnvelope: {
          schemaVersion: 1,
          agentId: record.actorId,
          identityAddress: input.identityAddress,
          taskAddress: input.taskAddress,
          tick: null,
          action: input.kind,
          args: { recordId: input.recordId, sequence: input.sequence },
          promptHash: null,
          responseHash: null,
          preStateHash: "a".repeat(64),
          postStateHash: "b".repeat(64),
          receiptAddress:
            `RCT${String(commits.length).padStart(41, "0")}` as Address,
          receiptPayloadHash: "p".repeat(64),
          txSignature: `tx-${commits.length}`,
          slot: commits.length,
          agentSignature: `tx-${commits.length}`,
          transcriptRoot: "c".repeat(64),
          leafHash: "d".repeat(64),
        },
      };
    },
  } as unknown as PiToolStreamBridge<ReceiptIndexWriter>;
  return { bridge, commits, indexed };
};

test("recorded AgentSession stream drives multi-turn commits through the extension", async () => {
  const bindings = buildBindings();
  const { bridge, commits, indexed } = buildStubBridge();
  const committer = createSubstrateSessionCommitter({
    bridge,
    bindings,
    sessionId: "session-e2e",
  });
  const handler = createTrustSubstrateExtension({ onTurnCommit: committer });
  const { host, emit } = createStubHost();
  handler(host);

  await emit("turn_start", { type: "turn_start", turnIndex: 0 });
  await emit("tool_call", {
    type: "tool_call",
    toolCallId: "t0-read",
    toolName: "read",
    input: { path: "src/a.ts" },
  });
  await emit("tool_execution_end", {
    type: "tool_execution_end",
    toolCallId: "t0-read",
  });
  await emit("tool_call", {
    type: "tool_call",
    toolCallId: "t0-ls",
    toolName: "ls",
    input: { path: "." },
  });
  await emit("tool_call", {
    type: "tool_call",
    toolCallId: "t0-edit",
    toolName: "edit",
    input: { path: "src/a.ts" },
  });
  await emit("tool_execution_end", {
    type: "tool_execution_end",
    toolCallId: "t0-edit",
  });
  await emit("turn_end", { type: "turn_end", turnIndex: 0 });

  await emit("turn_start", { type: "turn_start", turnIndex: 1 });
  await emit("tool_call", {
    type: "tool_call",
    toolCallId: "t1-bash",
    toolName: "bash",
    input: { command: "pnpm test" },
  });
  await emit("tool_execution_end", {
    type: "tool_execution_end",
    toolCallId: "t1-bash",
  });
  await emit("turn_end", { type: "turn_end", turnIndex: 1 });

  await emit("turn_start", { type: "turn_start", turnIndex: 2 });
  await emit("turn_end", { type: "turn_end", turnIndex: 2 });

  strictEqual(commits.length, 2);
  strictEqual(commits[0]?.recordId, "pi:session-e2e:turn-0");
  strictEqual(commits[0]?.sequence, 1);
  strictEqual(commits[0]?.toolCalls.length, 2);
  const turn0Tools = commits[0]!.toolCalls.map((call) => call.tool);
  deepStrictEqual(turn0Tools, ["read", "edit"]);

  strictEqual(commits[1]?.recordId, "pi:session-e2e:turn-1");
  strictEqual(commits[1]?.sequence, 2);
  strictEqual(commits[1]?.toolCalls.length, 1);
  strictEqual(commits[1]?.toolCalls[0]?.tool, "bash");

  strictEqual(indexed.length, 2);
  deepStrictEqual(
    indexed.map((r) => r.receiptId),
    ["rcpt-pi:session-e2e:turn-0", "rcpt-pi:session-e2e:turn-1"],
  );
});
