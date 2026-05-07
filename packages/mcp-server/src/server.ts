import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  DEFAULT_LEADERBOARD_LIMIT,
  DEFAULT_RECEIPT_LIMIT,
  JSON_RESPONSE_FORMAT,
  MARKDOWN_RESPONSE_FORMAT,
  MAX_LEADERBOARD_LIMIT,
  MAX_RECEIPT_LIMIT,
  SERVER_NAME,
  SERVER_VERSION,
} from "./constants.js";
import {
  formatAgentProfile,
  formatDomainSummary,
  formatSnapshotSummary,
  formatTaskTrace,
  type ResponseFormat,
} from "./format.js";
import {
  createAgentProfile,
  createDomainSummary,
  createSnapshotSummary,
  createTaskTrace,
} from "./snapshot-tools.js";

type ToolPayload = Record<string, unknown>;

const ResponseFormatSchema = z
  .enum([MARKDOWN_RESPONSE_FORMAT, JSON_RESPONSE_FORMAT])
  .default(MARKDOWN_RESPONSE_FORMAT)
  .describe(
    "Output format: markdown for readable summaries or json for structured data",
  );

const SnapshotContextSchema = {
  project_root: z
    .string()
    .min(1)
    .optional()
    .describe(
      "Project root that bounds snapshot reads. Defaults to TRUST_SUBSTRATE_PROJECT_ROOT or the current working directory.",
    ),
  snapshot_path: z
    .string()
    .min(1)
    .optional()
    .describe(
      "Relative or absolute path to an indexer snapshot JSON file. Relative paths are resolved inside project_root.",
    ),
  response_format: ResponseFormatSchema,
};

const SnapshotSummaryInputSchema = z
  .object({
    ...SnapshotContextSchema,
    domain: z
      .string()
      .min(1)
      .optional()
      .describe("Optional domain filter for summary and leaderboard results."),
    current_slot: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe("Current slot used to score expired commitments."),
    include_tier0: z
      .boolean()
      .default(false)
      .describe("Include unbonded tier0 identities in leaderboard results."),
    leaderboard_limit: z
      .number()
      .int()
      .min(1)
      .max(MAX_LEADERBOARD_LIMIT)
      .default(DEFAULT_LEADERBOARD_LIMIT)
      .describe("Maximum leaderboard entries to return."),
  })
  .strict();

const AgentProfileInputSchema = z
  .object({
    ...SnapshotContextSchema,
    agent_id: z.string().min(1).describe("Identity or agent ID to inspect."),
  })
  .strict();

const TaskTraceInputSchema = z
  .object({
    ...SnapshotContextSchema,
    task_id: z
      .string()
      .min(1)
      .describe("Task ID whose receipts and handoff trace should be returned."),
    offset: z
      .number()
      .int()
      .min(0)
      .default(0)
      .describe("Number of task receipts to skip."),
    limit: z
      .number()
      .int()
      .min(1)
      .max(MAX_RECEIPT_LIMIT)
      .default(DEFAULT_RECEIPT_LIMIT)
      .describe("Maximum task receipts to return."),
  })
  .strict();

const DomainSummaryInputSchema = z
  .object({
    ...SnapshotContextSchema,
    domain: z
      .string()
      .min(1)
      .optional()
      .describe("Optional domain to inspect. Omit to list all domains."),
  })
  .strict();

type SnapshotSummaryToolInput = z.infer<typeof SnapshotSummaryInputSchema>;
type AgentProfileToolInput = z.infer<typeof AgentProfileInputSchema>;
type TaskTraceToolInput = z.infer<typeof TaskTraceInputSchema>;
type DomainSummaryToolInput = z.infer<typeof DomainSummaryInputSchema>;

export function createTrustSubstrateMcpServer(): McpServer {
  const server = new McpServer({
    name: SERVER_NAME,
    version: SERVER_VERSION,
  });

  server.registerTool(
    "trust_substrate_snapshot_summary",
    {
      title: "Trust Substrate Snapshot Summary",
      description:
        "Read a local Trust Substrate indexer snapshot and return receipt counts, domain summaries, stake state, identity state, attester records, and a ranked leaderboard. This tool only reads JSON snapshot files inside the configured project root.",
      inputSchema: SnapshotSummaryInputSchema.shape,
      annotations: readOnlyAnnotations(),
    },
    async (params: SnapshotSummaryToolInput) =>
      runReadOnlyTool(() => {
        const summary = createSnapshotSummary({
          projectRoot: params.project_root,
          snapshotPath: params.snapshot_path,
          domain: params.domain,
          currentSlot: params.current_slot,
          includeTier0: params.include_tier0,
          leaderboardLimit: params.leaderboard_limit,
        });
        return {
          payload: summary as unknown as ToolPayload,
          text: formatSnapshotSummary(summary, params.response_format),
        };
      }),
  );

  server.registerTool(
    "trust_substrate_agent_profile",
    {
      title: "Trust Substrate Agent Profile",
      description:
        "Read a local Trust Substrate indexer snapshot and return one agent's receipt profile, stake state, attestations, authority rotations, and tool quality stats. This tool only reads JSON snapshot files inside the configured project root.",
      inputSchema: AgentProfileInputSchema.shape,
      annotations: readOnlyAnnotations(),
    },
    async (params: AgentProfileToolInput) =>
      runReadOnlyTool(() => {
        const profile = createAgentProfile({
          projectRoot: params.project_root,
          snapshotPath: params.snapshot_path,
          agentId: params.agent_id,
        });
        return {
          payload: profile as unknown as ToolPayload,
          text: formatAgentProfile(profile, params.response_format),
        };
      }),
  );

  server.registerTool(
    "trust_substrate_task_trace",
    {
      title: "Trust Substrate Task Trace",
      description:
        "Read a local Trust Substrate indexer snapshot and return receipts, handoffs, and agent trace context for a task. Supports offset and limit pagination for task receipts. This tool only reads JSON snapshot files inside the configured project root.",
      inputSchema: TaskTraceInputSchema.shape,
      annotations: readOnlyAnnotations(),
    },
    async (params: TaskTraceToolInput) =>
      runReadOnlyTool(() => {
        const trace = createTaskTrace({
          projectRoot: params.project_root,
          snapshotPath: params.snapshot_path,
          taskId: params.task_id,
          offset: params.offset,
          limit: params.limit,
        });
        return {
          payload: trace as unknown as ToolPayload,
          text: formatTaskTrace(trace, params.response_format),
        };
      }),
  );

  server.registerTool(
    "trust_substrate_domain_summary",
    {
      title: "Trust Substrate Domain Summary",
      description:
        "Read a local Trust Substrate indexer snapshot and return one domain summary or all domain summaries. This tool only reads JSON snapshot files inside the configured project root.",
      inputSchema: DomainSummaryInputSchema.shape,
      annotations: readOnlyAnnotations(),
    },
    async (params: DomainSummaryToolInput) =>
      runReadOnlyTool(() => {
        const summary = createDomainSummary({
          projectRoot: params.project_root,
          snapshotPath: params.snapshot_path,
          domain: params.domain,
        });
        return {
          payload: summary as unknown as ToolPayload,
          text: formatDomainSummary(summary, params.response_format),
        };
      }),
  );

  return server;
}

function readOnlyAnnotations() {
  return {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  };
}

function runReadOnlyTool(
  action: () => { readonly payload: ToolPayload; readonly text: string },
) {
  try {
    const result = action();
    return {
      content: [{ type: "text" as const, text: result.text }],
      structuredContent: result.payload,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      isError: true,
      content: [{ type: "text" as const, text: `Error: ${message}` }],
    };
  }
}
