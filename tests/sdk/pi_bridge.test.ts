import test from "node:test";
import { generateKeyPairSync } from "node:crypto";
import { ok, strictEqual } from "node:assert/strict";
import { address, generateKeyPairSigner, type Instruction } from "@solana/kit";
import { LocalDurableIndexer } from "@trust-substrate/indexer";
import {
  PiToolStreamBridge,
  TrustSubstrateClient,
  TrustSubstrateOnchainClient,
  type OnchainTransactionDispatcher,
  type PiToolCall,
} from "../../packages/sdk/src/index.js";

const MEMO_PROGRAM_ADDRESS = address(
  "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr",
);

test("bridges pi tool calls into signed execution steps, on-chain ops, and indexer state", async () => {
  const authority = await generateKeyPairSigner();
  const slashAuthority = await generateKeyPairSigner();
  const runtimeAuthority = generateKeyPairSync("ed25519").privateKey;
  const deterministicClient = new TrustSubstrateClient();
  const localIdentity = deterministicClient.identity.create({
    authority: authority.address,
    label: "planner",
  });
  const localTask = deterministicClient.task.create({
    identityId: localIdentity.identityId,
    title: "Land adapter bridge",
    domain: "coding",
    subtasks: ["adapt pi stream", "commit receipt"],
  });
  const toolCalls: PiToolCall[] = [
    {
      tool: "read",
      args: { path: "src/bridge.ts" },
      startedAt: "2026-04-17T00:00:01Z",
    },
    {
      tool: "edit",
      args: { path: "src/bridge.ts", patch: "@@ -1 +1 @@" },
      startedAt: "2026-04-17T00:00:02Z",
      endedAt: "2026-04-17T00:00:03Z",
      model: "gpt-5.4",
    },
  ];
  const sentInstructions: Instruction[] = [];
  const dispatcher: OnchainTransactionDispatcher = {
    send: async (instructions) => {
      sentInstructions.push(...instructions);
      return { slot: 222 };
    },
  };
  const onchain = new TrustSubstrateOnchainClient(dispatcher);
  const identityBinding = await onchain.bindIdentity({
    authority,
    identity: localIdentity,
  });
  const taskBinding = await onchain.bindTask({
    identity: identityBinding.address,
    task: localTask,
  });
  const bridge = new PiToolStreamBridge({
    onchain,
    indexer: new LocalDurableIndexer(),
  });

  const result = await bridge.commit({
    authority,
    identity: localIdentity,
    identityAddress: identityBinding.address,
    task: localTask,
    taskAddress: taskBinding.address,
    domainCatalogAddress: await onchain.getDomainCatalogAddress(),
    recordId: "rec-pi-1",
    kind: "completion",
    sequence: 1,
    toolCalls,
    runtimeAuthority,
    stake: {
      slashAuthority: slashAuthority.address,
      trustMode: 1,
      depositLamports: 750_000n,
      slashAuthorityId: "arbiter-agent",
      ownerId: authority.address,
    },
  });

  strictEqual(result.execution.record.steps.length, 2);
  strictEqual(result.execution.record.steps[0].kind, "tool_call");
  strictEqual(result.execution.record.steps[1].kind, "file_edit");
  const verification = result.execution.verification;
  ok(verification);
  if (!verification) {
    throw new Error("expected execution verification to be present");
  }
  strictEqual(verification.signedSteps.length, 2);
  const protocolInstructions = sentInstructions.filter(
    (instruction) => instruction.programAddress !== MEMO_PROGRAM_ADDRESS,
  );
  const memoInstructions = sentInstructions.filter(
    (instruction) => instruction.programAddress === MEMO_PROGRAM_ADDRESS,
  );
  strictEqual(protocolInstructions.length, 4);
  strictEqual(memoInstructions.length, 4);
  strictEqual(result.onchain.operations.length, 4);
  strictEqual(result.onchain.operations[0].kind, "initialize_stake");
  strictEqual(
    result.onchain.operations[0].address,
    result.onchain.stakeAddress,
  );
  strictEqual(result.onchain.operations[1].kind, "stake");
  strictEqual(result.onchain.operations[2].kind, "emit_receipt");
  strictEqual(
    result.onchain.operations[2].address,
    result.onchain.receiptAddress,
  );
  strictEqual(result.onchain.operations[3].kind, "sync_task_status");

  const graph = bridge.indexer.getExecutionGraph();
  strictEqual(graph.receipts.length, 1);
  strictEqual(graph.receipts[0].slot, 222);
  strictEqual(graph.receipts[0].kind, "completion");

  const stakeState = bridge.indexer.getStakeState(localIdentity.identityId);
  strictEqual(stakeState.activeLamports, "750000");
  ok(result.receipt.payload.payloadHash);
});
