import { hashCanonical, stableSerialize } from "./canonical.js";
import { OnchainMerkleTree } from "./onchain-merkle.js";

export type ExecutionStepKind =
  | "tool_call"
  | "command"
  | "file_edit"
  | "external_call"
  | "reasoning"
  | "subagent_handoff"
  | "mcp_call";

export interface ExecutionStep {
  readonly seq: number;
  readonly kind: ExecutionStepKind;
  readonly startedAt: string;
  readonly endedAt?: string;
  readonly payload: Record<string, unknown>;
  readonly model?: string;
  readonly tool?: string;
}

export interface ExecutionRecord {
  readonly recordId: string;
  readonly identityId: string;
  readonly taskId: string;
  readonly steps: ReadonlyArray<ExecutionStep>;
}

export interface ExecutionRecordHash {
  readonly root: Buffer;
  readonly leaves: ReadonlyArray<Buffer>;
}

export function canonicalExecutionRecord(record: ExecutionRecord): string {
  return stableSerialize(record);
}

export function hashStep(step: ExecutionStep): string {
  return hashCanonical(step);
}

export function hashExecutionRecord(
  record: ExecutionRecord
): ExecutionRecordHash {
  if (record.steps.length === 0) {
    throw new Error("ExecutionRecord must contain at least one step");
  }

  const leaves = record.steps.map((step) => Buffer.from(hashStep(step), "hex"));
  const tree = new OnchainMerkleTree(leaves);
  return { root: tree.root, leaves };
}
