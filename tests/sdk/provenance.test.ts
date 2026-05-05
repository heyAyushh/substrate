import test from "node:test";
import { deepStrictEqual, ok, strictEqual } from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import {
  appendRuntimeAttestation,
  deriveReputation,
  hashExecutionRecord,
  resolveRuntimeAtSlot,
  signExecutionStep,
  verifyExecutionRecord,
  type ExecutionRecord,
  type RuntimeAttestationRecord,
} from "../../packages/sdk/src/index.js";

const record = (): ExecutionRecord => ({
  recordId: "record-1",
  identityId: "identity-a",
  taskId: "task-a",
  steps: [
    {
      seq: 1,
      kind: "tool_call",
      startedAt: "2026-01-01T00:00:00Z",
      payload: {
        tool: "rg",
        cost: { tokensIn: 10, tokensOut: 5, elapsedMs: 40, usdMicros: 25 },
        modelId: "gpt-test",
      },
    },
    {
      seq: 2,
      kind: "reasoning",
      startedAt: "2026-01-01T00:00:01Z",
      payload: { summary: "done" },
    },
  ],
});

test("hashExecutionRecord ignores execution step signatures", () => {
  const { privateKey } = generateKeyPairSync("ed25519");
  const unsigned = record();
  const signed: ExecutionRecord = {
    ...unsigned,
    steps: [
      signExecutionStep(unsigned.steps[0], privateKey),
      unsigned.steps[1],
    ],
  };

  strictEqual(
    hashExecutionRecord(unsigned).root.toString("hex"),
    hashExecutionRecord(signed).root.toString("hex"),
  );
});

test("verifyExecutionRecord separates signed, unsigned, and forged steps", () => {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const signedStep = signExecutionStep(record().steps[0], privateKey);
  const forgedStep = {
    ...signedStep,
    payload: { ...signedStep.payload, tool: "tampered" },
  };

  const result = verifyExecutionRecord(
    {
      ...record(),
      steps: [signedStep, forgedStep, record().steps[1]],
    },
    publicKey,
  );

  strictEqual(result.signedSteps.length, 1);
  strictEqual(result.invalidSteps.length, 1);
  strictEqual(result.unsignedSteps.length, 1);
});

test("resolveRuntimeAtSlot returns the active runtime version", () => {
  const history: RuntimeAttestationRecord[] = [];
  history.push(
    appendRuntimeAttestation(history, {
      identityId: "identity-a",
      runtimeCommit: "runtime-v1",
      runtimeAuthority: "runtime-auth-1",
      validFromSlot: 10,
    }),
  );
  history.push(
    appendRuntimeAttestation(history, {
      identityId: "identity-a",
      runtimeCommit: "runtime-v2",
      runtimeAuthority: "runtime-auth-2",
      validFromSlot: 20,
    }),
  );

  deepStrictEqual(resolveRuntimeAtSlot(history, 19), history[0]);
  deepStrictEqual(resolveRuntimeAtSlot(history, 20), history[1]);
  strictEqual(resolveRuntimeAtSlot(history, 9), undefined);
});

test("deriveReputation can weight completions by execution cost", () => {
  const completion = {
    receiptId: "receipt-1",
    hash: "hash-1",
    actorId: "identity-a",
    kind: "completion" as const,
    taskId: "task-a",
    sequence: 1,
    domain: "coding",
    payload: {
      cost: {
        tokensIn: 1_000,
        tokensOut: 500,
        elapsedMs: 1_000,
        usdMicros: 2_500,
      },
      modelId: "gpt-test",
    },
  };

  const unweighted = deriveReputation([completion]);
  const weighted = deriveReputation([completion], { weightByCost: true });

  strictEqual(unweighted.overall, 5);
  ok(weighted.overall > unweighted.overall);
});
