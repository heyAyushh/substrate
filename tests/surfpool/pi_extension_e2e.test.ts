import { deepStrictEqual, ok, strictEqual } from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { createSolanaRpc, type Address } from "@solana/kit";
import { SqliteDurableIndexer } from "../../packages/indexer/dist/index.js";
import {
  createSubstrateExtension,
  type PiExtensionHost,
} from "../../packages/pi-extension/dist/index.js";
import {
  TrustSubstrateOnchainClient,
  buildUnansweredChallengePayload,
  createChallengeReceipt,
  createIdentity,
  createReceipt,
  createKitTransactionDispatcher,
  withPayloadHash,
} from "../../packages/sdk/dist/index.js";

const RPC_URL = process.env.SUBSTRATE_RPC_URL ?? "http://127.0.0.1:8899";
const RPC_SUBSCRIPTIONS_URL =
  process.env.SUBSTRATE_RPC_SUBSCRIPTIONS_URL ?? "ws://127.0.0.1:8900";
const KEYPAIR_PATH =
  process.env.SUBSTRATE_KEYPAIR ??
  process.env.ANCHOR_WALLET ??
  join(homedir(), ".config/solana/id.json");
const DEFAULT_BLOB_DIR = resolve(process.cwd(), ".pi/substrate-blobs");
const CHALLENGE_DEADLINE_SLOTS = 40;

const advanceToSlot = async (
  client: TrustSubstrateOnchainClient,
  rpc: ReturnType<typeof createSolanaRpc>,
  airdropAddress: Address,
  minimumSlot: number
): Promise<void> => {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const currentSlot = await client.getCurrentSlot();
    if (currentSlot >= minimumSlot) {
      return;
    }

    await rpc.requestAirdrop(airdropAddress, 1n).send();
  }
  throw new Error(`Timed out waiting for slot ${minimumSlot}`);
};

type HandlerMap = Map<
  string,
  Array<(event: unknown, context: unknown) => unknown>
>;

const createStubHost = () => {
  const handlers: HandlerMap = new Map();
  const host = {
    on: (
      event: string,
      handler: (event: unknown, context: unknown) => unknown
    ) => {
      const existing = handlers.get(event) ?? [];
      existing.push(handler);
      handlers.set(event, existing);
    },
  } as PiExtensionHost;

  const emit = async (event: string, payload: unknown) => {
    const registered = handlers.get(event) ?? [];
    for (const handler of registered) {
      await handler(payload, undefined);
    }
  };

  return { host, emit };
};

describe("pi_extension_e2e", () => {
  it("lands a completion receipt on surfpool", async () => {
    ok(
      KEYPAIR_PATH,
      "SUBSTRATE_KEYPAIR or ANCHOR_WALLET must point to a funded Surfpool keypair"
    );
    const tempDir = mkdtempSync(join(tmpdir(), "pi-extension-e2e-"));
    const indexDbPath = join(tempDir, "indexer.sqlite");
    const runSuffix = Date.now().toString();
    const identityLabel = `pi-local-agent-${runSuffix}`;
    const taskTitle = `pi coding session ${runSuffix}`;

    try {
      let receiptAddress: Address | undefined;
      let receiptId: string | undefined;
      let receiptKind: string | undefined;
      let receiptSlot: number | undefined;
      let commitKinds: string[] = [];

      const first = createSubstrateExtension({
        sessionId: `e2e-${Date.now()}`,
        config: {
          rpcUrl: RPC_URL,
          rpcSubscriptionsUrl: RPC_SUBSCRIPTIONS_URL,
          keypairPath: KEYPAIR_PATH,
          identityLabel,
          taskTitle,
          domain: "general",
          blobDir: DEFAULT_BLOB_DIR,
          indexDbPath,
          autoProvisionIdentity: true,
        },
        onCommitted: (result) => {
          receiptAddress = result.onchain.receiptAddress;
          receiptId = result.receipt.receiptId;
          receiptKind = result.receipt.kind;
          receiptSlot = result.indexedReceipt.slot;
          commitKinds = result.onchain.operations.map(
            (operation) => operation.kind
          );
        },
      });
      const firstHost = createStubHost();
      first.attach(firstHost.host);

      const firstReady = await first.ready;
      await firstHost.emit("turn_start", { type: "turn_start", turnIndex: 0 });
      await firstHost.emit("tool_call", {
        type: "tool_call",
        toolCallId: "call-1",
        toolName: "read",
        input: { path: "README.md" },
      });
      await firstHost.emit("tool_execution_end", {
        type: "tool_execution_end",
        toolCallId: "call-1",
      });
      await firstHost.emit("turn_end", { type: "turn_end", turnIndex: 0 });

      strictEqual(firstReady.identity.label, identityLabel);
      deepStrictEqual(
        firstReady.operations.map(({ kind }) => kind),
        [
          "initialize_domain_catalog",
          "register_domain",
          "initialize_cpi_authority",
          "create_identity",
          "create_task",
        ]
      );
      deepStrictEqual(commitKinds, ["emit_receipt", "sync_task_status"]);
      strictEqual(receiptKind, "completion");
      ok(receiptAddress, "extension must report the committed receipt PDA");
      ok(receiptId, "completion receipt id must be available after commit");
      ok(
        typeof receiptSlot === "number",
        "completion receipt slot must be available after commit"
      );
      ok(existsSync(indexDbPath), "local sqlite index must exist after commit");
      const completionReceiptAddress = receiptAddress!;
      const completionReceiptId = receiptId!;
      const completionReceiptSlot = receiptSlot!;
      const challengeDeadlineSlot = completionReceiptSlot + CHALLENGE_DEADLINE_SLOTS;

      const rpc = createSolanaRpc(RPC_URL);
      const client = new TrustSubstrateOnchainClient(
        createKitTransactionDispatcher({
          rpcUrl: RPC_URL,
          rpcSubscriptionsUrl: RPC_SUBSCRIPTIONS_URL,
        })
      );
      const reviewerIdentity = createIdentity({
        authority: firstReady.authority.address,
        label: `${firstReady.identity.label}-reviewer`,
      });
      const reviewerBinding = await client.bindIdentity({
        authority: firstReady.authority,
        identity: reviewerIdentity,
      });
      const receiptAccount = await rpc
        .getAccountInfo(completionReceiptAddress)
        .send();
      ok(receiptAccount.value, "receipt PDA must exist on Surfpool");

      const stakeSignature = await first.stake?.(5_000n);
      ok(stakeSignature, "stake command must return the Surfpool signature");

      const challengeSignature = await first.challenge?.(completionReceiptId);
      ok(
        challengeSignature,
        "challenge command must return the Surfpool signature"
      );

      const challengeReceipt = createChallengeReceipt({
        actorId: reviewerIdentity.identityId,
        taskId: firstReady.task.taskId,
        sequence: 2,
        previousReceiptId: completionReceiptId,
        domain: firstReady.task.domain,
        targetReceiptId: completionReceiptId,
        deadlineSlot: challengeDeadlineSlot,
      });
      const canonicalChallengeReceipt = createReceipt({
        actorId: challengeReceipt.actorId,
        kind: challengeReceipt.kind,
        taskId: challengeReceipt.taskId,
        sequence: challengeReceipt.sequence,
        previousReceiptId: challengeReceipt.previousReceiptId,
        payload: withPayloadHash({
          ...challengeReceipt.payload,
          auditRound: 0,
        }),
      });

      const challengeBinding = await client.bindAuditReceipt({
        auditorIdentity: reviewerBinding.address,
        targetReceipt: completionReceiptAddress,
        kind: "challenge",
        round: 0,
      });
      const challengeAccount = await rpc
        .getAccountInfo(challengeBinding.address)
        .send();
      ok(
        challengeAccount.value,
        "challenge receipt PDA must exist after the live challenge command"
      );

      await advanceToSlot(
        client,
        rpc,
        firstReady.authority.address,
        challengeDeadlineSlot
      );

      const disputeSignature = await first.dispute?.(completionReceiptId);
      ok(
        disputeSignature,
        "dispute command must return the Surfpool signature"
      );

      const disputeReceipt = buildUnansweredChallengePayload({
        actorId: reviewerIdentity.identityId,
        taskId: firstReady.task.taskId,
        sequence: 3,
        previousReceiptId: canonicalChallengeReceipt.receiptId,
        domain: firstReady.task.domain,
        challengeReceiptId: canonicalChallengeReceipt.receiptId,
        targetReceiptId: completionReceiptId,
      });
      const canonicalDisputeReceipt = createReceipt({
        actorId: disputeReceipt.actorId,
        kind: disputeReceipt.kind,
        taskId: disputeReceipt.taskId,
        sequence: disputeReceipt.sequence,
        previousReceiptId: disputeReceipt.previousReceiptId,
        payload: withPayloadHash({
          ...disputeReceipt.payload,
          auditRound: 0,
        }),
      });
      const stakeBinding = await client.bindStake({
        identity: firstReady.identityAddress,
      });
      const disputeBinding = await client.bindAuditReceipt({
        auditorIdentity: reviewerBinding.address,
        targetReceipt: completionReceiptAddress,
        kind: "dispute",
        round: 0,
      });

      const stakeAccount = await rpc
        .getAccountInfo(stakeBinding.address)
        .send();
      ok(
        stakeAccount.value,
        "stake PDA must exist after the live stake command"
      );

      const disputeAccount = await rpc
        .getAccountInfo(disputeBinding.address)
        .send();
      ok(
        disputeAccount.value,
        "dispute receipt PDA must exist after the live dispute command"
      );

      const indexer = new SqliteDurableIndexer({ path: indexDbPath });
      try {
        const history = indexer.getTaskHistory(firstReady.task.taskId);
        deepStrictEqual(
          history.map(({ kind }) => kind),
          ["completion", "challenge", "dispute"]
        );
        strictEqual(history[1]?.receiptId, canonicalChallengeReceipt.receiptId);
        strictEqual(history[2]?.receiptId, canonicalDisputeReceipt.receiptId);
      } finally {
        indexer.close();
      }

      const second = createSubstrateExtension({
        sessionId: `e2e-repeat-${Date.now()}`,
        config: {
          rpcUrl: RPC_URL,
          rpcSubscriptionsUrl: RPC_SUBSCRIPTIONS_URL,
          keypairPath: KEYPAIR_PATH,
          identityLabel,
          taskTitle,
          domain: "general",
          blobDir: DEFAULT_BLOB_DIR,
          indexDbPath,
          autoProvisionIdentity: true,
        },
      });

      const secondReady = await second.ready;
      strictEqual(
        secondReady.identity.identityId,
        firstReady.identity.identityId
      );
      strictEqual(secondReady.task.taskId, firstReady.task.taskId);
      deepStrictEqual(
        secondReady.operations.map(({ kind, created }) => ({ kind, created })),
        [
          { kind: "initialize_domain_catalog", created: false },
          { kind: "register_domain", created: false },
          { kind: "initialize_cpi_authority", created: false },
          { kind: "create_identity", created: false },
          { kind: "create_task", created: false },
        ]
      );
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
