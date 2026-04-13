import { hashCanonical, stableSerialize } from "./canonical.js";
import type { ExecutionRecord, ExecutionStep } from "./execution-record.js";

export const AGENT_TRACE_VERSION = "0.1.0" as const;

export interface AgentTraceFileEdit {
  readonly seq: number;
  readonly path: string;
  readonly startedAt: string;
  readonly endedAt?: string;
  readonly beforeHash?: string;
  readonly afterHash?: string;
  readonly diff?: string;
}

export interface AgentTraceBundle {
  readonly version: typeof AGENT_TRACE_VERSION;
  readonly traceId: string;
  readonly agentId: string;
  readonly taskId: string;
  readonly edits: ReadonlyArray<AgentTraceFileEdit>;
}

export function canonicalAgentTrace(bundle: AgentTraceBundle): string {
  return stableSerialize(bundle);
}

export function hashAgentTrace(bundle: AgentTraceBundle): string {
  return hashCanonical(bundle);
}

/**
 * One-way export of an ExecutionRecord to cursor/agent-trace v0.1.0.
 * Only `file_edit` steps survive the projection; other kinds (tool_call,
 * reasoning, etc.) are dropped because the spec only describes file edits.
 */
export function executionRecordToAgentTrace(
  record: ExecutionRecord
): AgentTraceBundle {
  const edits = record.steps
    .filter((step) => step.kind === "file_edit")
    .map(toFileEdit);

  return {
    version: AGENT_TRACE_VERSION,
    traceId: record.recordId,
    agentId: record.identityId,
    taskId: record.taskId,
    edits,
  };
}

function toFileEdit(step: ExecutionStep): AgentTraceFileEdit {
  const payload = step.payload ?? {};
  const path = asString(payload.path) ?? asString(payload.file) ?? "";
  return {
    seq: step.seq,
    path,
    startedAt: step.startedAt,
    endedAt: step.endedAt,
    beforeHash: asString(payload.beforeHash),
    afterHash: asString(payload.afterHash),
    diff: asString(payload.diff),
  };
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}
