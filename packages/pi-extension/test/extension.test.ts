import test from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert/strict";

import {
  TurnBuffer,
  createTrustSubstrateExtension,
  type PiExtensionHost,
  type TurnCommitInput,
} from "../src/index.js";

type Handlers = Map<string, Array<(event: unknown, ctx: unknown) => unknown>>;

const createStubHost = () => {
  const handlers: Handlers = new Map();
  const on = (
    event: string,
    handler: (event: unknown, ctx: unknown) => unknown,
  ) => {
    const list = handlers.get(event) ?? [];
    list.push(handler);
    handlers.set(event, list);
  };
  const host = { on } as unknown as PiExtensionHost;
  const emit = async (event: string, payload: unknown) => {
    const list = handlers.get(event) ?? [];
    for (const handler of list) {
      await handler(payload, undefined);
    }
  };
  return { host, emit };
};

test("TurnBuffer maps supported pi tools to PiToolCalls in order", () => {
  const buffer = new TurnBuffer();
  const clock = makeClock([
    "2026-04-17T00:00:01Z",
    "2026-04-17T00:00:02Z",
    "2026-04-17T00:00:03Z",
    "2026-04-17T00:00:04Z",
  ]);
  buffer.startToolCall({
    toolCallId: "call-1",
    toolName: "read",
    args: { path: "src/a.ts" },
    now: clock,
  });
  buffer.startToolCall({
    toolCallId: "call-2",
    toolName: "edit",
    args: { path: "src/a.ts" },
    now: clock,
  });
  buffer.endToolCall("call-1", clock);
  buffer.endToolCall("call-2", clock);
  const flushed = buffer.flush();
  strictEqual(flushed.length, 2);
  strictEqual(flushed[0]?.tool, "read");
  strictEqual(flushed[0]?.startedAt, "2026-04-17T00:00:01Z");
  strictEqual(flushed[0]?.endedAt, "2026-04-17T00:00:03Z");
  strictEqual(flushed[1]?.tool, "edit");
  strictEqual(buffer.size, 0);
});

test("TurnBuffer ignores unsupported pi tool names", () => {
  const buffer = new TurnBuffer();
  const entry = buffer.startToolCall({
    toolCallId: "call-ls",
    toolName: "ls",
    args: { path: "." },
  });
  strictEqual(entry, undefined);
  strictEqual(buffer.size, 0);
});

test("extension commits tool calls on turn_end and skips empty turns", async () => {
  const { host, emit } = createStubHost();
  const commits: TurnCommitInput[] = [];
  const clock = makeClock([
    "2026-04-17T01:00:01Z",
    "2026-04-17T01:00:02Z",
    "2026-04-17T01:00:03Z",
    "2026-04-17T01:00:04Z",
  ]);
  const handler = createTrustSubstrateExtension({
    onTurnCommit: async (input) => {
      commits.push(input);
    },
    now: clock,
  });
  handler(host);

  await emit("turn_start", { type: "turn_start", turnIndex: 0 });
  await emit("tool_call", {
    type: "tool_call",
    toolCallId: "t-1",
    toolName: "bash",
    input: { command: "pnpm test" },
  });
  await emit("tool_execution_end", {
    type: "tool_execution_end",
    toolCallId: "t-1",
  });
  await emit("turn_end", { type: "turn_end", turnIndex: 0 });

  strictEqual(commits.length, 1);
  strictEqual(commits[0]?.turnIndex, 0);
  strictEqual(commits[0]?.toolCalls.length, 1);
  deepStrictEqual(commits[0]?.toolCalls[0]?.args, { command: "pnpm test" });
  strictEqual(commits[0]?.toolCalls[0]?.tool, "bash");

  await emit("turn_start", { type: "turn_start", turnIndex: 1 });
  await emit("turn_end", { type: "turn_end", turnIndex: 1 });

  strictEqual(commits.length, 1);
});

test("extension filters out unsupported tool names before commit", async () => {
  const { host, emit } = createStubHost();
  const commits: TurnCommitInput[] = [];
  const clock = makeClock(["2026-04-17T02:00:01Z", "2026-04-17T02:00:02Z"]);
  const handler = createTrustSubstrateExtension({
    onTurnCommit: (input) => {
      commits.push(input);
    },
    now: clock,
  });
  handler(host);

  await emit("turn_start", { type: "turn_start", turnIndex: 0 });
  await emit("tool_call", {
    type: "tool_call",
    toolCallId: "t-grep",
    toolName: "grep",
    input: { pattern: "foo" },
  });
  await emit("tool_call", {
    type: "tool_call",
    toolCallId: "t-write",
    toolName: "write",
    input: { path: "src/b.ts" },
  });
  await emit("tool_execution_end", {
    type: "tool_execution_end",
    toolCallId: "t-write",
  });
  await emit("turn_end", { type: "turn_end", turnIndex: 0 });

  strictEqual(commits.length, 1);
  strictEqual(commits[0]?.toolCalls.length, 1);
  strictEqual(commits[0]?.toolCalls[0]?.tool, "write");
});

const makeClock = (values: ReadonlyArray<string>) => {
  let index = 0;
  return () => {
    const value = values[index] ?? values[values.length - 1];
    index += 1;
    return value as string;
  };
};
