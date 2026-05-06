import test from "node:test";
import { rejects, strictEqual } from "node:assert/strict";
import {
  DataAvailabilityError,
  createVerifiedReceiptFromExecution,
  hashExecutionRecord,
  verifyPayloadAvailable,
  type BlobFetcher,
  type ExecutionRecord,
} from "../../packages/sdk/src/index.js";
import { hashCanonical } from "../../packages/sdk/src/canonical.js";

const payload = { hello: "world" };
const serialized = Buffer.from(JSON.stringify(payload));

const record: ExecutionRecord = {
  recordId: "rec-1",
  identityId: "identity-a",
  taskId: "task-1",
  steps: [
    {
      seq: 1,
      kind: "tool_call",
      startedAt: "2026-01-01T00:00:01Z",
      payload,
    },
  ],
};

const expectedMerkleRoot = hashExecutionRecord(record).root.toString("hex");
const expectedBlobHash = hashCanonical(record);

const recordFetcher: BlobFetcher = async () => ({
  bytes: Buffer.from(JSON.stringify(record)),
});

test("verifyPayloadAvailable accepts a matching blob", async () => {
  const { hashCanonical } = await import("../../packages/sdk/src/canonical.js");
  const expected = hashCanonical(payload);
  await verifyPayloadAvailable({
    uri: "memory://payload",
    expectedHash: expected,
    fetcher: async () => ({ bytes: serialized }),
  });
});

test("verifyPayloadAvailable rejects a hash mismatch", async () => {
  await rejects(
    () =>
      verifyPayloadAvailable({
        uri: "memory://payload",
        expectedHash: "deadbeef",
        fetcher: async () => ({ bytes: serialized }),
      }),
    (error: unknown) => {
      const err = error as DataAvailabilityError;
      strictEqual(err.name, "DataAvailabilityError");
      strictEqual(err.reason, "hash_mismatch");
      return true;
    },
  );
});

test("verifyPayloadAvailable rejects an unreachable blob", async () => {
  await rejects(
    () =>
      verifyPayloadAvailable({
        uri: "memory://missing",
        expectedHash: "x",
        fetcher: async () => {
          throw new Error("not found");
        },
      }),
    (error: unknown) => {
      const err = error as DataAvailabilityError;
      strictEqual(err.reason, "unreachable");
      return true;
    },
  );
});

test("createVerifiedReceiptFromExecution verifies before returning", async () => {
  const receipt = await createVerifiedReceiptFromExecution({
    record,
    kind: "completion",
    domain: "research",
    actorId: "identity-a",
    sequence: 1,
    storage: {
      uri: "memory://record",
      verify: true,
      hash: expectedBlobHash,
      fetcher: recordFetcher,
    },
  });
  strictEqual(receipt.payload.payloadHash, expectedMerkleRoot);
});

test("createVerifiedReceiptFromExecution refuses when blob is missing", async () => {
  await rejects(() =>
    createVerifiedReceiptFromExecution({
      record,
      kind: "completion",
      domain: "research",
      actorId: "identity-a",
      sequence: 1,
      storage: {
        uri: "memory://missing",
        verify: true,
        hash: expectedBlobHash,
        fetcher: async () => {
          throw new Error("blob not found");
        },
      },
    }),
  );
});
