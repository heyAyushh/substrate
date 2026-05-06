import type { PiToolCall, PiToolName } from "@trust-substrate/sdk";

import { isSupportedPiToolName, toPiToolCall } from "./pi-events.js";

export interface BufferedToolCall {
  readonly toolCallId: string;
  readonly tool: PiToolName;
  readonly args: Readonly<Record<string, unknown>>;
  readonly startedAt: string;
  endedAt?: string;
  readonly model?: string;
}

export interface StartToolCallInput {
  readonly toolCallId: string;
  readonly toolName: string;
  readonly args: Readonly<Record<string, unknown>>;
  readonly model?: string;
  readonly now?: () => string;
}

const defaultNow = (): string => new Date().toISOString();

export class TurnBuffer {
  private readonly calls = new Map<string, BufferedToolCall>();
  private readonly order: string[] = [];

  startToolCall(input: StartToolCallInput): BufferedToolCall | undefined {
    if (!isSupportedPiToolName(input.toolName)) {
      return undefined;
    }
    if (this.calls.has(input.toolCallId)) {
      return this.calls.get(input.toolCallId);
    }
    const now = input.now ?? defaultNow;
    const entry: BufferedToolCall = {
      toolCallId: input.toolCallId,
      tool: input.toolName,
      args: input.args,
      startedAt: now(),
      model: input.model,
    };
    this.calls.set(entry.toolCallId, entry);
    this.order.push(entry.toolCallId);
    return entry;
  }

  endToolCall(
    toolCallId: string,
    now: () => string = defaultNow,
  ): BufferedToolCall | undefined {
    const entry = this.calls.get(toolCallId);
    if (!entry) return undefined;
    entry.endedAt = now();
    return entry;
  }

  flush(): PiToolCall[] {
    const items = this.order
      .map((id) => this.calls.get(id))
      .filter((entry): entry is BufferedToolCall => entry !== undefined);
    this.calls.clear();
    this.order.length = 0;
    return items.map((entry) =>
      toPiToolCall({
        toolName: entry.tool,
        args: entry.args,
        startedAt: entry.startedAt,
        endedAt: entry.endedAt,
        model: entry.model,
      }),
    );
  }

  get size(): number {
    return this.calls.size;
  }
}
