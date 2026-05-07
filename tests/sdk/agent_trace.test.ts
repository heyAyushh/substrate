import test from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert/strict";
import {
  AGENT_TRACE_VERSION,
  canonicalAgentTrace,
  executionRecordToAgentTrace,
  hashAgentTrace,
  TRUST_SUBSTRATE_AGENT_TRACE_METADATA_KEY,
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
        startLine: 10,
        endLine: 12,
        beforeHash: "b0",
        afterHash: "a1",
        diff: "@@-1,1+1,1@@",
        conversationUrl: "https://agent.example/conversations/1",
        sessionUrl: "https://agent.example/sessions/1",
      },
      model: "openai/gpt-4o-mini",
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
  strictEqual(bundle.id, "a973c5a3-25f6-59b1-a1ec-75d61bc19487");
  strictEqual(bundle.timestamp, "2026-01-01T00:00:01Z");
  strictEqual(bundle.files.length, 2);
  deepStrictEqual(
    bundle.files.map((file) => file.path),
    ["src/a.ts", "src/b.ts"],
  );
  deepStrictEqual(bundle.files[0].conversations[0].ranges[0], {
    start_line: 10,
    end_line: 12,
    content_hash: "a1",
  });
  strictEqual(
    bundle.files[0].conversations[0].contributor?.model_id,
    "openai/gpt-4o-mini",
  );
  deepStrictEqual(bundle.files[0].conversations[0].related, [
    { type: "session", url: "https://agent.example/sessions/1" },
  ]);

  const metadata = bundle.metadata?.[TRUST_SUBSTRATE_AGENT_TRACE_METADATA_KEY];
  strictEqual(metadata?.taskId, "task-99");
  deepStrictEqual(metadata?.agentIds, ["identity-a"]);
  strictEqual(metadata?.steps?.length, 2);
  strictEqual(metadata?.steps?.[0]?.diff, "@@-1,1+1,1@@");
  strictEqual(typeof metadata?.traceHash, "string");
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
  strictEqual(bundle.files.length, 0);
});
