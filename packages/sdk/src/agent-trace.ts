import { hashCanonical, sha256Hex, stableSerialize } from "./canonical.js";
import type { ExecutionRecord, ExecutionStep } from "./execution-record.js";

export const AGENT_TRACE_VERSION = "0.1.0" as const;
export const TRUST_SUBSTRATE_AGENT_TRACE_METADATA_KEY =
  "dev.trust-substrate" as const;

export type AgentTraceContributorType = "human" | "ai" | "mixed" | "unknown";
export type AgentTraceVcsType = "git" | "jj" | "hg" | "svn";

export interface AgentTraceContributor {
  readonly type: AgentTraceContributorType;
  readonly model_id?: string;
}

export interface AgentTraceRelatedResource {
  readonly type: string;
  readonly url: string;
}

export interface AgentTraceRange {
  readonly start_line: number;
  readonly end_line: number;
  readonly content_hash?: string;
  readonly contributor?: AgentTraceContributor;
}

export interface AgentTraceConversation {
  readonly url?: string;
  readonly contributor?: AgentTraceContributor;
  readonly ranges: ReadonlyArray<AgentTraceRange>;
  readonly related?: ReadonlyArray<AgentTraceRelatedResource>;
}

export interface AgentTraceFile {
  readonly path: string;
  readonly conversations: ReadonlyArray<AgentTraceConversation>;
}

export interface AgentTraceVcs {
  readonly type: AgentTraceVcsType;
  readonly revision: string;
}

export interface AgentTraceTool {
  readonly name: string;
  readonly version?: string;
}

export interface TrustSubstrateAgentTraceMetadata {
  readonly taskId: string;
  readonly agentIds: ReadonlyArray<string>;
  readonly executionRecordId?: string;
  readonly traceHash?: string;
  readonly receiptIds?: ReadonlyArray<string>;
  readonly steps?: ReadonlyArray<TrustSubstrateAgentTraceStepMetadata>;
}

export interface TrustSubstrateAgentTraceStepMetadata {
  readonly seq: number;
  readonly path: string;
  readonly startedAt: string;
  readonly endedAt?: string;
  readonly beforeHash?: string;
  readonly afterHash?: string;
  readonly diff?: string;
}

export interface AgentTraceMetadata {
  readonly [TRUST_SUBSTRATE_AGENT_TRACE_METADATA_KEY]?: TrustSubstrateAgentTraceMetadata;
  readonly [key: string]: unknown;
}

export interface AgentTraceRecord {
  readonly version: typeof AGENT_TRACE_VERSION;
  readonly id: string;
  readonly timestamp: string;
  readonly vcs?: AgentTraceVcs;
  readonly tool?: AgentTraceTool;
  readonly files: ReadonlyArray<AgentTraceFile>;
  readonly metadata?: AgentTraceMetadata;
}

export type AgentTraceBundle = AgentTraceRecord;
export type AgentTraceFileEdit = TrustSubstrateAgentTraceStepMetadata;

export interface ExecutionRecordToAgentTraceOptions {
  readonly timestamp?: string;
  readonly vcs?: AgentTraceVcs;
  readonly tool?: AgentTraceTool;
}

export function canonicalAgentTrace(record: AgentTraceRecord): string {
  return stableSerialize(record);
}

export function hashAgentTrace(record: AgentTraceRecord): string {
  return hashCanonical(record);
}

/**
 * One-way export of an ExecutionRecord to cursor/agent-trace v0.1.0.
 * Only `file_edit` steps become Agent Trace ranges; Trust Substrate-specific
 * sequence, hash, and diff data stays in namespaced metadata for receipt
 * binding.
 */
export function executionRecordToAgentTrace(
  record: ExecutionRecord,
  options: ExecutionRecordToAgentTraceOptions = {},
): AgentTraceRecord {
  const fileEditSteps = record.steps.filter(
    (step) => step.kind === "file_edit",
  );
  const steps = fileEditSteps.map(toStepMetadata);
  const trace: AgentTraceRecord = {
    version: AGENT_TRACE_VERSION,
    id: uuidFromText(record.recordId),
    timestamp: options.timestamp ?? firstStepTimestamp(record.steps),
    vcs: options.vcs,
    tool: options.tool,
    files: toAgentTraceFiles(fileEditSteps),
    metadata: {
      [TRUST_SUBSTRATE_AGENT_TRACE_METADATA_KEY]: {
        taskId: record.taskId,
        agentIds: [record.identityId],
        executionRecordId: record.recordId,
        steps,
      },
    },
  };

  return withTraceHash(trace);
}

export function uuidFromText(text: string): string {
  const hex = sha256Hex(`agent-trace:${text}`);
  const bytes = hex.slice(0, 32).split("");
  bytes[12] = "5";
  bytes[16] = ((Number.parseInt(bytes[16], 16) & 0x3) | 0x8).toString(16);
  const uuidHex = bytes.join("");
  return [
    uuidHex.slice(0, 8),
    uuidHex.slice(8, 12),
    uuidHex.slice(12, 16),
    uuidHex.slice(16, 20),
    uuidHex.slice(20, 32),
  ].join("-");
}

function toAgentTraceFiles(
  fileEditSteps: ReadonlyArray<ExecutionStep>,
): AgentTraceFile[] {
  const conversationsByPath = new Map<string, AgentTraceConversation[]>();

  for (const step of fileEditSteps) {
    const payload = step.payload ?? {};
    const path = asString(payload.path) ?? asString(payload.file) ?? "";
    if (path.length === 0) {
      continue;
    }
    const conversation: AgentTraceConversation = {
      url: asString(payload.conversationUrl),
      contributor: {
        type: "ai",
        model_id: step.model ?? asString(payload.model),
      },
      ranges: [toAgentTraceRange(step)],
      related: relatedResources(payload),
    };
    conversationsByPath.set(path, [
      ...(conversationsByPath.get(path) ?? []),
      conversation,
    ]);
  }

  return [...conversationsByPath.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([path, conversations]) => ({ path, conversations }));
}

function toAgentTraceRange(step: ExecutionStep): AgentTraceRange {
  const payload = step.payload ?? {};
  const startLine = positiveInteger(payload.startLine) ?? 1;
  const endLine = positiveInteger(payload.endLine) ?? startLine;

  return {
    start_line: startLine,
    end_line: Math.max(startLine, endLine),
    content_hash: asString(payload.contentHash) ?? asString(payload.afterHash),
  };
}

function toStepMetadata(
  step: ExecutionStep,
): TrustSubstrateAgentTraceStepMetadata {
  const payload = step.payload ?? {};
  return {
    seq: step.seq,
    path: asString(payload.path) ?? asString(payload.file) ?? "",
    startedAt: step.startedAt,
    endedAt: step.endedAt,
    beforeHash: asString(payload.beforeHash),
    afterHash: asString(payload.afterHash),
    diff: asString(payload.diff),
  };
}

function relatedResources(
  payload: Record<string, unknown>,
): AgentTraceRelatedResource[] | undefined {
  const related = [
    relatedResource("session", asString(payload.sessionUrl)),
    relatedResource("prompt", asString(payload.promptUrl)),
    relatedResource("receipt", asString(payload.receiptUrl)),
  ].filter((resource): resource is AgentTraceRelatedResource =>
    Boolean(resource),
  );
  return related.length > 0 ? related : undefined;
}

function relatedResource(
  type: string,
  url: string | undefined,
): AgentTraceRelatedResource | undefined {
  return url ? { type, url } : undefined;
}

function withTraceHash(record: AgentTraceRecord): AgentTraceRecord {
  const metadata = record.metadata?.[TRUST_SUBSTRATE_AGENT_TRACE_METADATA_KEY];
  if (!metadata) {
    return record;
  }

  const traceWithoutHash: AgentTraceRecord = {
    ...record,
    metadata: {
      ...record.metadata,
      [TRUST_SUBSTRATE_AGENT_TRACE_METADATA_KEY]: {
        ...metadata,
        traceHash: undefined,
      },
    },
  };

  return {
    ...record,
    metadata: {
      ...record.metadata,
      [TRUST_SUBSTRATE_AGENT_TRACE_METADATA_KEY]: {
        ...metadata,
        traceHash: hashAgentTrace(traceWithoutHash),
      },
    },
  };
}

function firstStepTimestamp(steps: ReadonlyArray<ExecutionStep>): string {
  return steps[0]?.startedAt ?? "1970-01-01T00:00:00.000Z";
}

function positiveInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value > 0
    ? value
    : undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
