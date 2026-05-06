import type { PiToolCall } from "@trust-substrate/sdk";

import { TurnBuffer } from "./turn-buffer.js";

export interface TurnCommitInput {
  readonly turnIndex: number;
  readonly toolCalls: ReadonlyArray<PiToolCall>;
}

export type TurnCommitHandler = (
  input: TurnCommitInput,
) => Promise<void> | void;

export interface TrustSubstrateExtensionOptions {
  readonly onTurnCommit: TurnCommitHandler;
  readonly now?: () => string;
}

interface PiToolCallEvent {
  readonly type: "tool_call";
  readonly toolCallId: string;
  readonly toolName: string;
  readonly input?: Readonly<Record<string, unknown>>;
}

interface PiToolExecutionEndEvent {
  readonly type: "tool_execution_end";
  readonly toolCallId: string;
}

interface PiTurnStartEvent {
  readonly type: "turn_start";
  readonly turnIndex: number;
}

interface PiTurnEndEvent {
  readonly type: "turn_end";
  readonly turnIndex: number;
}

type PiEventHandler<TEvent> = (
  event: TEvent,
  ctx: unknown,
) => unknown | Promise<unknown>;

export interface PiExtensionHost {
  on(event: "turn_start", handler: PiEventHandler<PiTurnStartEvent>): void;
  on(event: "turn_end", handler: PiEventHandler<PiTurnEndEvent>): void;
  on(event: "tool_call", handler: PiEventHandler<PiToolCallEvent>): void;
  on(
    event: "tool_execution_end",
    handler: PiEventHandler<PiToolExecutionEndEvent>,
  ): void;
  on(event: string, handler: PiEventHandler<unknown>): void;
}

export function createTrustSubstrateExtension(
  options: TrustSubstrateExtensionOptions,
): (pi: PiExtensionHost) => void {
  return (pi) => {
    let buffer: TurnBuffer | undefined;

    pi.on("turn_start", () => {
      buffer = new TurnBuffer();
    });

    pi.on("tool_call", (event) => {
      if (!buffer) {
        buffer = new TurnBuffer();
      }
      buffer.startToolCall({
        toolCallId: event.toolCallId,
        toolName: event.toolName,
        args: event.input ?? {},
        now: options.now,
      });
    });

    pi.on("tool_execution_end", (event) => {
      buffer?.endToolCall(event.toolCallId, options.now);
    });

    pi.on("turn_end", async (event) => {
      if (!buffer || buffer.size === 0) {
        buffer = undefined;
        return;
      }
      const toolCalls = buffer.flush();
      buffer = undefined;
      if (toolCalls.length > 0) {
        await options.onTurnCommit({
          turnIndex: event.turnIndex,
          toolCalls,
        });
      }
    });
  };
}
