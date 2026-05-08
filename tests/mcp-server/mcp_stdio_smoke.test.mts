import test from "node:test";
import { deepStrictEqual, ok, strictEqual } from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage } from "node:http";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  address,
  generateKeyPairSigner,
  getAddressEncoder,
  getCompiledTransactionMessageDecoder,
  getTransactionDecoder,
  type Address,
} from "@solana/kit";
import type { LocalReceiptRecord } from "@trust-substrate/indexer";

const require = createRequire(import.meta.url);
const { LocalDurableIndexer } =
  require("@trust-substrate/indexer") as typeof import("@trust-substrate/indexer");

const SNAPSHOT_RELATIVE_PATH = "snapshots/indexer.json";
const SERVER_ENTRYPOINT = fileURLToPath(
  new URL("../../../dist/index.js", import.meta.url),
);
const CLIENT_MODULE_URL = new URL(
  "../../../node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js",
  import.meta.url,
).href;
const STDIO_TRANSPORT_MODULE_URL = new URL(
  "../../../node_modules/@modelcontextprotocol/sdk/dist/esm/client/stdio.js",
  import.meta.url,
).href;
const PACKAGE_ROOT = dirname(dirname(SERVER_ENTRYPOINT));
const SKILL_PATH = fileURLToPath(
  new URL("../../../skills/trust-substrate-mcp/SKILL.md", import.meta.url),
);
const OPENAI_AGENT_PATH = fileURLToPath(
  new URL(
    "../../../skills/trust-substrate-mcp/agents/openai.yaml",
    import.meta.url,
  ),
);
const EXPECTED_TOOLS = [
  "trust_substrate_agent_profile",
  "trust_substrate_domain_summary",
  "trust_substrate_snapshot_summary",
  "trust_substrate_task_trace",
  "trust_substrate_write_status",
];
const EXPECTED_WRITE_TOOLS = [
  "trust_substrate_attester_write",
  "trust_substrate_checkpoint_write",
  "trust_substrate_delegation_write",
  "trust_substrate_dispute_write",
  "trust_substrate_identity_write",
  "trust_substrate_receipt_write",
  "trust_substrate_reputation_write",
  "trust_substrate_stake_write",
  "trust_substrate_task_write",
];
const EXPECTED_RECEIPT_COUNT = 3;
const EXPECTED_TASK_COUNT = 1;
const EXPECTED_AGENT_COUNT = 2;
const EXPECTED_ALPHA_RECEIPT_COUNT = 2;
const EXPECTED_TASK_RECEIPT_COUNT = 3;
const EXPECTED_HANDOFF_COUNT = 1;
const MOCK_SIGNATURE =
  "1111111111111111111111111111111111111111111111111111111111111111";
const TASK_HEAD_SEQUENCE = 7n;
const TASK_NEXT_SEQUENCE = TASK_HEAD_SEQUENCE + 1n;
const RECEIPT_SEQUENCE_OFFSET = 8 + 32 + 1;
const RECEIPT_PREVIOUS_RECEIPT_OFFSET = RECEIPT_SEQUENCE_OFFSET + 8 + 32;
const RECEIPT_PREVIOUS_RECEIPT_LENGTH = 32;
const ADDRESS_ENCODER = getAddressEncoder();
const RECEIPT_EMITTER_PROGRAM_ADDRESS = address(
  "FR2iXdHVBWbzkdn5qQdWEuyLWWaB2zR9ipRLTA8rGvJk",
);
const TASK_REGISTRY_PROGRAM_ADDRESS = address(
  "E16iDriWzHDTyX6irMhoGwnfWLDBMiTZeW67gZJiLwt4",
);
const TEST_KEYPAIR_BYTES = [
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22,
  23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 121, 181, 86, 46, 143, 230, 84, 249,
  64, 120, 177, 18, 232, 169, 139, 167, 144, 31, 133, 58, 230, 149, 190, 215,
  224, 227, 145, 11, 173, 4, 150, 100,
];
const TEST_SIGNER_ADDRESS = "9C6hybhQ6Aycep9jaUnP6uL9ZYvDjUp1aSkFWPUFJtpj";

type StructuredResult = {
  readonly receiptCount?: unknown;
  readonly taskCount?: unknown;
  readonly agentCount?: unknown;
  readonly agent?: {
    readonly agentId?: unknown;
    readonly receiptCount?: unknown;
  };
  readonly taskId?: unknown;
  readonly receipts?: readonly unknown[];
  readonly handoffs?: readonly unknown[];
};

type ToolMetadata = {
  readonly name: string;
  readonly annotations?: {
    readonly readOnlyHint?: boolean;
    readonly destructiveHint?: boolean;
    readonly openWorldHint?: boolean;
  };
};

type ToolCallResult = {
  readonly structuredContent?: Record<string, unknown>;
  readonly isError?: boolean;
};

type McpClient = {
  connect(transport: unknown): Promise<void>;
  listTools(): Promise<{ readonly tools: readonly ToolMetadata[] }>;
  callTool(input: {
    readonly name: string;
    readonly arguments?: Record<string, unknown>;
  }): Promise<ToolCallResult>;
  close(): Promise<void>;
};

type ClientConstructor = new (
  clientInfo: { readonly name: string; readonly version: string },
  options: { readonly capabilities: Record<string, unknown> },
) => McpClient;

type StdioTransportConstructor = new (input: {
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd: string;
  readonly env: Record<string, string>;
  readonly stderr: "pipe";
}) => unknown;

const { runMcpProtocolWriteTool } = (await import(
  pathToFileURL(join(PACKAGE_ROOT, "dist/write-tools.js")).href
)) as typeof import("../../packages/mcp-server/src/write-tools.js");
const { getTaskRecordEncoder } = (await import(
  pathToFileURL(
    join(
      PACKAGE_ROOT,
      "../program-clients/dist/generated/task_registry/accounts/taskRecord.js",
    ),
  ).href
)) as {
  readonly getTaskRecordEncoder: () => {
    encode(input: unknown): Uint8Array;
  };
};

const createReceipt = (
  overrides: Partial<LocalReceiptRecord> & {
    readonly receiptId: string;
    readonly slot: number;
    readonly taskId: string;
    readonly actorId: string;
    readonly kind: string;
  },
): LocalReceiptRecord => ({
  domain: "society",
  payload: {},
  ...overrides,
});

const createSmokeSnapshot = (projectRoot: string): void => {
  const indexer = new LocalDurableIndexer();
  indexer.ingest([
    createReceipt({
      receiptId: "assign-1",
      slot: 10,
      taskId: "task-1",
      actorId: "agent-alpha",
      kind: "assignment",
      payload: { model: "smoke-model", tool: "planner" },
    }),
    createReceipt({
      receiptId: "handoff-1",
      slot: 20,
      taskId: "task-1",
      actorId: "agent-alpha",
      kind: "handoff",
      payload: { toAgentId: "agent-beta", tool: "router" },
    }),
    createReceipt({
      receiptId: "complete-1",
      slot: 30,
      taskId: "task-1",
      actorId: "agent-beta",
      kind: "completion",
      payload: { outcome: "accepted", tool: "builder" },
    }),
  ]);

  const snapshotPath = join(projectRoot, SNAPSHOT_RELATIVE_PATH);
  mkdirSync(dirname(snapshotPath), { recursive: true });
  indexer.saveSnapshot(snapshotPath);
};

const zeroBytes32 = (): Uint8Array => new Uint8Array(32);

const readRequestBody = async (request: IncomingMessage): Promise<string> => {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
};

const createTaskHeadRpcServer = async (input: {
  readonly taskAddress: Address;
  readonly identityAddress: Address;
  readonly lastReceipt: Address;
  readonly lastSequence: bigint;
}) => {
  const transactions: string[] = [];
  const taskData = getTaskRecordEncoder().encode({
    identity: input.identityAddress,
    taskId: zeroBytes32(),
    domain: zeroBytes32(),
    subtaskRoot: zeroBytes32(),
    subtaskCount: 0,
    status: 0,
    completedCount: 0,
    disputedCount: 0,
    resolvedCount: 0,
    lastReceipt: input.lastReceipt,
    lastSequence: input.lastSequence,
    bump: 255,
  });
  const server = createServer(async (request, response) => {
    const body = JSON.parse(await readRequestBody(request)) as {
      readonly id: string | number;
      readonly method: string;
      readonly params?: readonly unknown[];
    };
    const accountValue =
      body.params?.[0] === input.taskAddress
        ? {
            data: [Buffer.from(taskData).toString("base64"), "base64"],
            executable: false,
            lamports: 1,
            owner: TASK_REGISTRY_PROGRAM_ADDRESS,
            rentEpoch: 0,
            space: taskData.length,
          }
        : null;
    const resultByMethod: Record<string, unknown> = {
      getAccountInfo: { context: { slot: 1 }, value: accountValue },
      getLatestBlockhash: {
        context: { slot: 1 },
        value: {
          blockhash: "11111111111111111111111111111111",
          lastValidBlockHeight: 999_999,
        },
      },
      getSignatureStatuses: {
        context: { slot: 2 },
        value: [
          {
            confirmationStatus: "processed",
            confirmations: 1,
            err: null,
            slot: 2,
          },
        ],
      },
      getSlot: 2,
    };
    if (body.method === "sendTransaction") {
      const transaction = body.params?.[0];
      if (typeof transaction === "string") transactions.push(transaction);
      resultByMethod.sendTransaction = MOCK_SIGNATURE;
    }
    response.setHeader("content-type", "application/json");
    response.end(
      JSON.stringify({
        jsonrpc: "2.0",
        id: body.id,
        result: resultByMethod[body.method],
      }),
    );
  });
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
  const addressInfo = server.address();
  if (!addressInfo || typeof addressInfo === "string") {
    throw new Error("Mock RPC server did not expose a TCP address");
  }
  return {
    rpcUrl: `http://127.0.0.1:${addressInfo.port}`,
    rpcSubscriptionsUrl: `ws://127.0.0.1:${addressInfo.port}`,
    transactions,
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    },
  };
};

const decodeReceiptInstructionData = (wireTransaction: string) => {
  const transaction = getTransactionDecoder().decode(
    Buffer.from(wireTransaction, "base64"),
  );
  const message = getCompiledTransactionMessageDecoder().decode(
    transaction.messageBytes,
  ) as unknown as {
    readonly instructions: readonly {
      readonly programAddressIndex: number;
      readonly data: Uint8Array;
    }[];
    readonly staticAccounts: readonly Address[];
  };
  const receiptInstruction = message.instructions.find(
    (instruction) =>
      message.staticAccounts[instruction.programAddressIndex] ===
      RECEIPT_EMITTER_PROGRAM_ADDRESS,
  );
  if (!receiptInstruction) {
    throw new Error(
      "Missing emit_receipt instruction in submitted transaction",
    );
  }
  const data = receiptInstruction.data;
  return {
    sequence: new DataView(
      data.buffer,
      data.byteOffset + RECEIPT_SEQUENCE_OFFSET,
      8,
    ).getBigUint64(0, true),
    previousReceipt: data.slice(
      RECEIPT_PREVIOUS_RECEIPT_OFFSET,
      RECEIPT_PREVIOUS_RECEIPT_OFFSET + RECEIPT_PREVIOUS_RECEIPT_LENGTH,
    ),
  };
};

test("stdio MCP server exposes Trust Substrate tools and handles real calls", async () => {
  const [{ Client }, { StdioClientTransport }] = await Promise.all([
    import(CLIENT_MODULE_URL) as Promise<{
      readonly Client: ClientConstructor;
    }>,
    import(STDIO_TRANSPORT_MODULE_URL) as Promise<{
      readonly StdioClientTransport: StdioTransportConstructor;
    }>,
  ]);
  const projectRoot = mkdtempSync(join(tmpdir(), "trust-mcp-stdio-"));
  createSmokeSnapshot(projectRoot);

  const client = new Client(
    { name: "trust-substrate-mcp-smoke", version: "0.0.0" },
    { capabilities: {} },
  );
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [SERVER_ENTRYPOINT],
    cwd: PACKAGE_ROOT,
    env: {
      PATH: process.env.PATH ?? "",
      NODE_NO_WARNINGS: "1",
      TRUST_SUBSTRATE_PROJECT_ROOT: projectRoot,
      TRUST_SUBSTRATE_SNAPSHOT_PATH: SNAPSHOT_RELATIVE_PATH,
    },
    stderr: "pipe",
  });

  try {
    await client.connect(transport);

    const tools = await client.listTools();
    deepStrictEqual(
      tools.tools.map((tool) => tool.name).sort(),
      EXPECTED_TOOLS,
    );
    ok(
      tools.tools
        .filter((tool) => tool.name !== "trust_substrate_write_status")
        .every(
          (tool) =>
            tool.annotations?.readOnlyHint === true &&
            tool.annotations?.destructiveHint === false &&
            tool.annotations?.openWorldHint === false,
        ),
    );
    const statusTool = tools.tools.find(
      (tool) => tool.name === "trust_substrate_write_status",
    );
    strictEqual(statusTool?.annotations?.readOnlyHint, true);
    strictEqual(statusTool?.annotations?.openWorldHint, false);

    const summary = await client.callTool({
      name: "trust_substrate_snapshot_summary",
      arguments: { response_format: "json" },
    });
    const summaryContent = summary.structuredContent as StructuredResult;
    strictEqual(summaryContent.receiptCount, EXPECTED_RECEIPT_COUNT);
    strictEqual(summaryContent.taskCount, EXPECTED_TASK_COUNT);
    strictEqual(summaryContent.agentCount, EXPECTED_AGENT_COUNT);

    const profile = await client.callTool({
      name: "trust_substrate_agent_profile",
      arguments: { agent_id: "agent-alpha", response_format: "json" },
    });
    const profileContent = profile.structuredContent as StructuredResult;
    strictEqual(profileContent.agent?.agentId, "agent-alpha");
    strictEqual(
      profileContent.agent?.receiptCount,
      EXPECTED_ALPHA_RECEIPT_COUNT,
    );

    const trace = await client.callTool({
      name: "trust_substrate_task_trace",
      arguments: { task_id: "task-1", response_format: "json" },
    });
    const traceContent = trace.structuredContent as StructuredResult;
    strictEqual(traceContent.taskId, "task-1");
    strictEqual(traceContent.receipts?.length, EXPECTED_TASK_RECEIPT_COUNT);
    strictEqual(traceContent.handoffs?.length, EXPECTED_HANDOFF_COUNT);

    const blocked = await client.callTool({
      name: "trust_substrate_snapshot_summary",
      arguments: { snapshot_path: "../outside.json", response_format: "json" },
    });
    strictEqual(blocked.isError, true);
  } finally {
    await client.close();
  }
});

test("stdio MCP server hides write tools until write mode is enabled", async () => {
  const [{ Client }, { StdioClientTransport }] = await Promise.all([
    import(CLIENT_MODULE_URL) as Promise<{
      readonly Client: ClientConstructor;
    }>,
    import(STDIO_TRANSPORT_MODULE_URL) as Promise<{
      readonly StdioClientTransport: StdioTransportConstructor;
    }>,
  ]);
  const projectRoot = mkdtempSync(join(tmpdir(), "trust-mcp-no-write-"));
  createSmokeSnapshot(projectRoot);
  const client = new Client(
    { name: "trust-substrate-mcp-no-write", version: "0.0.0" },
    { capabilities: {} },
  );
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [SERVER_ENTRYPOINT],
    cwd: PACKAGE_ROOT,
    env: {
      PATH: process.env.PATH ?? "",
      NODE_NO_WARNINGS: "1",
      TRUST_SUBSTRATE_PROJECT_ROOT: projectRoot,
      TRUST_SUBSTRATE_SNAPSHOT_PATH: SNAPSHOT_RELATIVE_PATH,
    },
    stderr: "pipe",
  });

  try {
    await client.connect(transport);
    const tools = await client.listTools();
    for (const toolName of EXPECTED_WRITE_TOOLS) {
      ok(
        !tools.tools.some((tool) => tool.name === toolName),
        `${toolName} must be hidden without write mode`,
      );
    }
    const status = await client.callTool({
      name: "trust_substrate_write_status",
      arguments: { response_format: "json" },
    });
    strictEqual(status.structuredContent?.enabled, false);
    strictEqual(status.structuredContent?.ready, false);
  } finally {
    await client.close();
  }
});

test("stdio MCP write tools preview by default and require explicit submit confirmation", async () => {
  const [{ Client }, { StdioClientTransport }] = await Promise.all([
    import(CLIENT_MODULE_URL) as Promise<{
      readonly Client: ClientConstructor;
    }>,
    import(STDIO_TRANSPORT_MODULE_URL) as Promise<{
      readonly StdioClientTransport: StdioTransportConstructor;
    }>,
  ]);
  const projectRoot = mkdtempSync(join(tmpdir(), "trust-mcp-write-"));
  const keypairPath = join(projectRoot, "id.json");
  writeFileSync(keypairPath, JSON.stringify(TEST_KEYPAIR_BYTES));
  createSmokeSnapshot(projectRoot);
  const client = new Client(
    { name: "trust-substrate-mcp-write", version: "0.0.0" },
    { capabilities: {} },
  );
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [SERVER_ENTRYPOINT],
    cwd: PACKAGE_ROOT,
    env: {
      PATH: process.env.PATH ?? "",
      NODE_NO_WARNINGS: "1",
      TRUST_SUBSTRATE_PROJECT_ROOT: projectRoot,
      TRUST_SUBSTRATE_SNAPSHOT_PATH: SNAPSHOT_RELATIVE_PATH,
      TRUST_SUBSTRATE_MCP_ENABLE_WRITES: "1",
      SUBSTRATE_KEYPAIR: keypairPath,
      SUBSTRATE_RPC_URL: "http://127.0.0.1:8899",
      SUBSTRATE_RPC_SUBSCRIPTIONS_URL: "ws://127.0.0.1:8900",
    },
    stderr: "pipe",
  });

  try {
    await client.connect(transport);
    const tools = await client.listTools();
    for (const toolName of EXPECTED_WRITE_TOOLS) {
      ok(
        tools.tools.some((tool) => tool.name === toolName),
        `${toolName} must be registered in write mode`,
      );
    }
    const identityTool = tools.tools.find(
      (tool) => tool.name === "trust_substrate_identity_write",
    );
    strictEqual(identityTool?.annotations?.readOnlyHint, false);
    strictEqual(identityTool?.annotations?.openWorldHint, true);

    const status = await client.callTool({
      name: "trust_substrate_write_status",
      arguments: { response_format: "json" },
    });
    strictEqual(status.structuredContent?.enabled, true);
    strictEqual(status.structuredContent?.ready, true);
    strictEqual(status.structuredContent?.signerAddress, TEST_SIGNER_ADDRESS);
    ok(
      !JSON.stringify(status.structuredContent).includes(
        TEST_KEYPAIR_BYTES.join(","),
      ),
    );

    const preview = await client.callTool({
      name: "trust_substrate_identity_write",
      arguments: {
        action: "ensure_identity",
        identity_label: "smoke-agent",
        response_format: "json",
      },
    });
    strictEqual(preview.structuredContent?.mode, "preview");
    strictEqual(preview.structuredContent?.submitted, false);
    strictEqual(preview.structuredContent?.signer, TEST_SIGNER_ADDRESS);

    const refusedSubmit = await client.callTool({
      name: "trust_substrate_identity_write",
      arguments: {
        action: "ensure_identity",
        mode: "submit",
        identity_label: "smoke-agent",
        response_format: "json",
      },
    });
    strictEqual(refusedSubmit.structuredContent?.mode, "preview");
    strictEqual(refusedSubmit.structuredContent?.submitted, false);
    strictEqual(refusedSubmit.structuredContent?.submitRefused, true);
  } finally {
    await client.close();
  }
});

test("MCP receipt submit without sequence uses the on-chain task head", async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), "trust-mcp-receipt-"));
  const keypairPath = join(projectRoot, "id.json");
  writeFileSync(keypairPath, JSON.stringify(TEST_KEYPAIR_BYTES));
  const identity = await generateKeyPairSigner();
  const task = await generateKeyPairSigner();
  const domainCatalog = await generateKeyPairSigner();
  const lastReceipt = await generateKeyPairSigner();
  const rpc = await createTaskHeadRpcServer({
    taskAddress: task.address,
    identityAddress: identity.address,
    lastReceipt: lastReceipt.address,
    lastSequence: TASK_HEAD_SEQUENCE,
  });

  try {
    const result = await runMcpProtocolWriteTool(
      "receipt",
      {
        action: "emit_receipt",
        mode: "submit",
        confirm: true,
        identity: identity.address,
        task: task.address,
        domain_catalog: domainCatalog.address,
        actor_id: TEST_SIGNER_ADDRESS,
        receipt_kind: "completion",
        task_id: "mcp-task",
        payload: {
          domain: "general",
          payloadHash:
            "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        },
      },
      {
        TRUST_SUBSTRATE_MCP_ENABLE_WRITES: "1",
        SUBSTRATE_KEYPAIR: keypairPath,
        SUBSTRATE_RPC_URL: rpc.rpcUrl,
        SUBSTRATE_RPC_SUBSCRIPTIONS_URL: rpc.rpcSubscriptionsUrl,
        SUBSTRATE_COMMITMENT: "processed",
      },
    );

    strictEqual(result.submitted, true);
    strictEqual(rpc.transactions.length, 1);
    const receiptData = decodeReceiptInstructionData(rpc.transactions[0]!);
    strictEqual(receiptData.sequence, TASK_NEXT_SEQUENCE);
    deepStrictEqual(
      Array.from(receiptData.previousReceipt),
      Array.from(ADDRESS_ENCODER.encode(lastReceipt.address)),
    );
  } finally {
    await rpc.close();
  }
});

test("MCP receipt preview refuses to invent a receipt sequence", async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), "trust-mcp-preview-"));
  const keypairPath = join(projectRoot, "id.json");
  writeFileSync(keypairPath, JSON.stringify(TEST_KEYPAIR_BYTES));
  const identity = await generateKeyPairSigner();
  const task = await generateKeyPairSigner();
  const domainCatalog = await generateKeyPairSigner();

  const result = await runMcpProtocolWriteTool(
    "receipt",
    {
      action: "emit_receipt",
      mode: "preview",
      confirm: false,
      identity: identity.address,
      task: task.address,
      domain_catalog: domainCatalog.address,
      actor_id: TEST_SIGNER_ADDRESS,
      receipt_kind: "completion",
      task_id: "mcp-task",
      payload: {
        domain: "general",
        payloadHash:
          "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      },
    },
    {
      TRUST_SUBSTRATE_MCP_ENABLE_WRITES: "1",
      SUBSTRATE_KEYPAIR: keypairPath,
      SUBSTRATE_RPC_URL: "http://127.0.0.1:8899",
      SUBSTRATE_RPC_SUBSCRIPTIONS_URL: "ws://127.0.0.1:8900",
    },
  ).catch((error: unknown) => error);

  ok(result instanceof Error);
  ok(result.message.includes("sequence is required in preview mode"));
});

test("bundled skill metadata points agents at the MCP server workflow", () => {
  const skill = readFileSync(SKILL_PATH, "utf8");
  const agentConfig = readFileSync(OPENAI_AGENT_PATH, "utf8");

  ok(skill.includes("name: trust-substrate-mcp"));
  ok(skill.includes("pnpm --filter @trust-substrate/mcp-server build"));
  ok(skill.includes("node packages/mcp-server/dist/index.js"));
  ok(skill.includes("TRUST_SUBSTRATE_PROJECT_ROOT"));
  ok(skill.includes("TRUST_SUBSTRATE_SNAPSHOT_PATH"));

  for (const toolName of EXPECTED_TOOLS) {
    ok(skill.includes(toolName), `skill mentions ${toolName}`);
  }

  ok(agentConfig.includes('display_name: "Trust Substrate MCP"'));
  ok(agentConfig.includes("$trust-substrate-mcp"));
});
