import type { KeyObject } from "node:crypto";

import {
  signExecutionStep,
  verifyExecutionRecord,
  type ExecutionRecord,
  type ExecutionRecordVerification,
  type ExecutionStep,
  type ExecutionStepKind,
} from "./execution-record.js";

export type PiToolName = "read" | "write" | "edit" | "bash";

export interface PiToolCall {
  readonly tool: PiToolName;
  readonly args: Readonly<Record<string, unknown>>;
  readonly startedAt: string;
  readonly endedAt?: string;
  readonly model?: string;
}

export interface AdaptPiToolCallsInput {
  readonly recordId: string;
  readonly identityId: string;
  readonly taskId: string;
  readonly toolCalls: ReadonlyArray<PiToolCall>;
}

export interface SignedPiToolCalls extends Omit<
  AdaptPiToolCallsInput,
  "toolCalls"
> {
  readonly runtimeAuthority: KeyObject;
  readonly toolCalls: ReadonlyArray<PiToolCall>;
}

export interface AdaptedSignedPiToolCalls {
  readonly record: ExecutionRecord;
  readonly runtimeAuthority: string;
  readonly verification: ExecutionRecordVerification;
}

export const PI_TOOL_TO_STEP_KIND: Readonly<
  Record<PiToolName, ExecutionStepKind>
> = Object.freeze({
  read: "tool_call",
  write: "file_edit",
  edit: "file_edit",
  bash: "command",
});

const toStep = (seq: number, toolCall: PiToolCall): ExecutionStep => ({
  seq,
  kind: PI_TOOL_TO_STEP_KIND[toolCall.tool],
  startedAt: toolCall.startedAt,
  endedAt: toolCall.endedAt,
  model: toolCall.model,
  tool: toolCall.tool,
  payload: {
    ...toolCall.args,
    tool: toolCall.tool,
  },
});

export function adaptPiToolCalls(
  input: AdaptPiToolCallsInput,
): ExecutionRecord {
  if (input.toolCalls.length === 0) {
    throw new Error("Pi tool stream must contain at least one tool call");
  }

  return {
    recordId: input.recordId,
    identityId: input.identityId,
    taskId: input.taskId,
    steps: input.toolCalls.map((toolCall, index) =>
      toStep(index + 1, toolCall),
    ),
  };
}

export function adaptAndSignPiToolCalls(
  input: SignedPiToolCalls,
): AdaptedSignedPiToolCalls {
  const baseRecord = adaptPiToolCalls(input);
  const signedSteps = baseRecord.steps.map((step) =>
    signExecutionStep(step, input.runtimeAuthority),
  );
  const record: ExecutionRecord = {
    ...baseRecord,
    steps: signedSteps,
  };
  const verification = verifyExecutionRecord(record, input.runtimeAuthority);
  const firstSigner = record.steps[0]?.signature?.signer;

  if (!firstSigner) {
    throw new Error("Signed Pi tool stream did not produce step signatures");
  }

  return {
    record,
    runtimeAuthority: firstSigner,
    verification,
  };
}
