import {
  createReceipt,
  type ReceiptKind,
  type ReceiptRecord,
} from "./client.js";
import {
  type BlobFetcher,
  verifyPayloadAvailable,
} from "./data-availability.js";
import {
  hashExecutionRecord,
  hashStep,
  type ExecutionRecord,
} from "./execution-record.js";

export interface ReceiptStorageRef {
  readonly uri: string;
  readonly hash?: string;
  readonly verify?: boolean;
  readonly fetcher?: BlobFetcher;
}

export interface ReceiptFromExecutionInput {
  readonly record: ExecutionRecord;
  readonly kind: ReceiptKind;
  readonly domain: string;
  readonly actorId: string;
  readonly sequence: number;
  readonly previousReceiptId?: string;
  readonly storage?: ReceiptStorageRef;
}

export type DisputeResolutionOutcome = "agent_won" | "agent_lost";

export interface DisputeResolution {
  readonly outcome: DisputeResolutionOutcome;
  readonly slashAmount?: number | bigint;
}

export interface DisputeReceiptInput {
  readonly actorId: string;
  readonly sequence: number;
  readonly previousReceiptId?: string;
  readonly domain: string;
  readonly targetReceiptId: string;
  readonly record: ExecutionRecord;
  readonly stepSeq: number;
  readonly evidenceHash: string;
  readonly evidenceUri?: string;
  readonly resolution?: DisputeResolution;
}

export function createReceiptFromExecution(
  input: ReceiptFromExecutionInput
): ReceiptRecord {
  const { root } = hashExecutionRecord(input.record);
  const payloadHash = root.toString("hex");
  const payload: Record<string, unknown> = {
    domain: input.domain,
    recordId: input.record.recordId,
    payloadHash,
  };

  if (input.storage) {
    payload.storage = {
      uri: input.storage.uri,
      ...(input.storage.hash ? { hash: input.storage.hash } : {}),
    };
  }

  return createReceipt({
    actorId: input.actorId,
    kind: input.kind,
    taskId: input.record.taskId,
    sequence: input.sequence,
    previousReceiptId: input.previousReceiptId,
    payload,
  });
}

export async function createVerifiedReceiptFromExecution(
  input: ReceiptFromExecutionInput
): Promise<ReceiptRecord> {
  if (input.storage?.verify) {
    const { root } = hashExecutionRecord(input.record);
    await verifyPayloadAvailable({
      uri: input.storage.uri,
      expectedHash: input.storage.hash ?? root.toString("hex"),
      fetcher: input.storage.fetcher,
    });
  }
  return createReceiptFromExecution(input);
}

export function createDisputeReceipt(
  input: DisputeReceiptInput
): ReceiptRecord {
  const step = input.record.steps.find((entry) => entry.seq === input.stepSeq);
  if (!step) {
    throw new Error(
      `ExecutionRecord has no step with seq=${input.stepSeq} for dispute binding`
    );
  }

  const payload: Record<string, unknown> = {
    domain: input.domain,
    targetReceiptId: input.targetReceiptId,
    recordId: input.record.recordId,
    stepSeq: input.stepSeq,
    stepHash: hashStep(step),
    evidenceHash: input.evidenceHash,
  };

  if (input.evidenceUri) {
    payload.evidenceUri = input.evidenceUri;
  }

  if (input.resolution) {
    payload.resolution = {
      outcome: input.resolution.outcome,
      ...(input.resolution.slashAmount !== undefined
        ? { slashAmount: input.resolution.slashAmount.toString() }
        : {}),
    };
  }

  return createReceipt({
    actorId: input.actorId,
    kind: input.resolution ? "dispute_resolved" : "dispute",
    taskId: input.record.taskId,
    sequence: input.sequence,
    previousReceiptId: input.previousReceiptId,
    payload,
  });
}
