import type { PiToolCall, PiToolName } from "@trust-substrate/sdk";

export const PI_SUPPORTED_TOOL_NAMES = [
  "read",
  "write",
  "edit",
  "bash",
] as const satisfies ReadonlyArray<PiToolName>;

export function isSupportedPiToolName(name: string): name is PiToolName {
  return (PI_SUPPORTED_TOOL_NAMES as ReadonlyArray<string>).includes(name);
}

export interface PiToolCallInput {
  readonly toolName: PiToolName;
  readonly args: Readonly<Record<string, unknown>>;
  readonly startedAt: string;
  readonly endedAt?: string;
  readonly model?: string;
}

export function toPiToolCall(input: PiToolCallInput): PiToolCall {
  return {
    tool: input.toolName,
    args: input.args,
    startedAt: input.startedAt,
    endedAt: input.endedAt,
    model: input.model,
  };
}
