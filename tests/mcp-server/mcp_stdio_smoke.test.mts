import test from "node:test";
import { deepStrictEqual, ok, strictEqual } from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
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
];
const EXPECTED_RECEIPT_COUNT = 3;
const EXPECTED_TASK_COUNT = 1;
const EXPECTED_AGENT_COUNT = 2;
const EXPECTED_ALPHA_RECEIPT_COUNT = 2;
const EXPECTED_TASK_RECEIPT_COUNT = 3;
const EXPECTED_HANDOFF_COUNT = 1;

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
      tools.tools.every(
        (tool) =>
          tool.annotations?.readOnlyHint === true &&
          tool.annotations?.destructiveHint === false,
      ),
    );

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
