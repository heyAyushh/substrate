import test from "node:test";
import { deepStrictEqual, ok, strictEqual } from "node:assert/strict";
import { resolve } from "node:path";

import {
  createSolanaRpc,
  type Address,
} from "@solana/kit";
import {
  createSubstrateExtension,
  type PiExtensionHost,
} from "../../packages/pi-extension/dist/index.js";

const RPC_URL = process.env.SUBSTRATE_RPC_URL ?? "http://127.0.0.1:8899";
const RPC_SUBSCRIPTIONS_URL =
  process.env.SUBSTRATE_RPC_SUBSCRIPTIONS_URL ?? "ws://127.0.0.1:8900";
const SHOULD_RUN = process.env.SUBSTRATE_E2E === "1";
const KEYPAIR_PATH = process.env.SUBSTRATE_KEYPAIR;
const DEFAULT_BLOB_DIR = resolve(process.cwd(), ".pi/substrate-blobs");

type HandlerMap = Map<string, Array<(event: unknown, context: unknown) => unknown>>;

const createStubHost = () => {
  const handlers: HandlerMap = new Map();
  const host = {
    on: (event: string, handler: (event: unknown, context: unknown) => unknown) => {
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

test(
  "pi extension lands a completion receipt on surfpool",
  { skip: !SHOULD_RUN },
  async () => {
    ok(KEYPAIR_PATH, "SUBSTRATE_KEYPAIR must point to the funded Surfpool keypair");

    let receiptAddress: Address | undefined;
    let receiptKind: string | undefined;
    let commitKinds: string[] = [];

    const first = createSubstrateExtension({
      sessionId: `e2e-${Date.now()}`,
      config: {
        rpcUrl: RPC_URL,
        rpcSubscriptionsUrl: RPC_SUBSCRIPTIONS_URL,
        keypairPath: KEYPAIR_PATH,
        identityLabel: "pi-local-agent",
        taskTitle: "pi coding session",
        domain: "general",
        blobDir: DEFAULT_BLOB_DIR,
        autoProvisionIdentity: true,
      },
      onCommitted: (result) => {
        receiptAddress = result.onchain.receiptAddress;
        receiptKind = result.receipt.kind;
        commitKinds = result.onchain.operations.map((operation) => operation.kind);
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

    strictEqual(firstReady.identity.label, "pi-local-agent");
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

    const rpc = createSolanaRpc(RPC_URL);
    const receiptAccount = await rpc.getAccountInfo(receiptAddress).send();
    ok(receiptAccount.value, "receipt PDA must exist on Surfpool");

    const second = createSubstrateExtension({
      sessionId: `e2e-repeat-${Date.now()}`,
      config: {
        rpcUrl: RPC_URL,
        rpcSubscriptionsUrl: RPC_SUBSCRIPTIONS_URL,
        keypairPath: KEYPAIR_PATH,
        identityLabel: "pi-local-agent",
        taskTitle: "pi coding session",
        domain: "general",
        blobDir: DEFAULT_BLOB_DIR,
        autoProvisionIdentity: true,
      },
    });

    const secondReady = await second.ready;
    strictEqual(secondReady.identity.identityId, firstReady.identity.identityId);
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
  }
);
