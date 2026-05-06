import test from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert/strict";
import {
  AGENT_TRACE_VERSION,
  canonicalAgentTrace,
  executionRecordToAgentTrace,
  hashAgentTrace,
  type ExecutionRecord,
} from "../../packages/sdk/src/index.js";

const mixedRecord: ExecutionRecord = {
  recordId: "rec-mixed",
  identityId: "identity-a",
  taskId: "task-99",
  steps: [
    {
      seq: 1,
      kind: "reasoning",
      startedAt: "2026-01-01T00:00:01Z",
      payload: { thought: "plan" },
    },
    {
      seq: 2,
      kind: "file_edit",
      startedAt: "2026-01-01T00:00:02Z",
      endedAt: "2026-01-01T00:00:03Z",
      payload: {
        path: "src/a.ts",
        beforeHash: "b0",
        afterHash: "a1",
        diff: "@@-1,1+1,1@@",
      },
    },
    {
      seq: 3,
      kind: "tool_call",
      startedAt: "2026-01-01T00:00:04Z",
      payload: { tool: "grep" },
    },
    {
      seq: 4,
      kind: "file_edit",
      startedAt: "2026-01-01T00:00:05Z",
      payload: { path: "src/b.ts", afterHash: "x2" },
    },
  ],
};

test("executionRecordToAgentTrace keeps only file_edit steps", () => {
  const bundle = executionRecordToAgentTrace(mixedRecord);
  strictEqual(bundle.version, AGENT_TRACE_VERSION);
  strictEqual(bundle.traceId, "rec-mixed");
  strictEqual(bundle.agentId, "identity-a");
  strictEqual(bundle.taskId, "task-99");
  strictEqual(bundle.edits.length, 2);
  deepStrictEqual(
    bundle.edits.map((edit) => edit.path),
    ["src/a.ts", "src/b.ts"],
  );
  strictEqual(bundle.edits[0].diff, "@@-1,1+1,1@@");
});

test("canonicalAgentTrace and hashAgentTrace are deterministic", () => {
  const bundle = executionRecordToAgentTrace(mixedRecord);
  strictEqual(canonicalAgentTrace(bundle), canonicalAgentTrace(bundle));
  strictEqual(hashAgentTrace(bundle), hashAgentTrace(bundle));
});

test("record without file edits produces an empty bundle", () => {
  const onlyReasoning: ExecutionRecord = {
    ...mixedRecord,
    steps: [mixedRecord.steps[0], mixedRecord.steps[2]],
  };
  const bundle = executionRecordToAgentTrace(onlyReasoning);
  strictEqual(bundle.edits.length, 0);
});
