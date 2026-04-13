import test from "node:test";
import { notStrictEqual, ok, strictEqual, throws } from "node:assert/strict";
import {
  canonicalExecutionRecord,
  hashExecutionRecord,
  hashStep,
  type ExecutionRecord,
  type ExecutionStep,
} from "../../packages/sdk/src/index.js";

const step = (
  seq: number,
  overrides: Partial<ExecutionStep> = {}
): ExecutionStep => ({
  seq,
  kind: "tool_call",
  startedAt: `2026-01-01T00:00:0${seq}Z`,
  payload: { arg: seq },
  ...overrides,
});

const record = (steps: ExecutionStep[]): ExecutionRecord => ({
  recordId: "rec-1",
  identityId: "identity-a",
  taskId: "task-1",
  steps,
});

test("canonicalExecutionRecord is stable across key insertion order", () => {
  const a = record([step(1), step(2)]);
  const b: ExecutionRecord = {
    steps: [step(1), step(2)],
    taskId: "task-1",
    identityId: "identity-a",
    recordId: "rec-1",
  };
  strictEqual(canonicalExecutionRecord(a), canonicalExecutionRecord(b));
});

test("hashExecutionRecord is deterministic for the same record", () => {
  const first = hashExecutionRecord(record([step(1), step(2), step(3)]));
  const second = hashExecutionRecord(record([step(1), step(2), step(3)]));
  ok(first.root.equals(second.root));
  strictEqual(first.leaves.length, 3);
});

test("mutating a step changes the root", () => {
  const base = hashExecutionRecord(record([step(1), step(2)]));
  const mutated = hashExecutionRecord(
    record([step(1), step(2, { payload: { arg: 999 } })])
  );
  notStrictEqual(base.root.toString("hex"), mutated.root.toString("hex"));
});

test("reordering steps changes the root", () => {
  const original = hashExecutionRecord(record([step(1), step(2), step(3)]));
  const reordered = hashExecutionRecord(record([step(2), step(1), step(3)]));
  notStrictEqual(original.root.toString("hex"), reordered.root.toString("hex"));
});

test("per-step hash is stable and unique per step", () => {
  const hashA = hashStep(step(1));
  const hashB = hashStep(step(1));
  strictEqual(hashA, hashB);
  notStrictEqual(hashA, hashStep(step(2)));
});

test("empty record is rejected", () => {
  throws(() => hashExecutionRecord(record([])), /at least one step/);
});
