import { hashCanonical } from "./canonical.js";
import { createReceipt, type ReceiptRecord } from "./client.js";

export const COMMIT_MARKER = "trust-substrate.commit";
export const REVEAL_MARKER = "trust-substrate.reveal";

export interface CommitReceiptInput {
  readonly actorId: string;
  readonly taskId: string;
  readonly sequence: number;
  readonly previousReceiptId?: string;
  readonly domain: string;
  readonly payload: Record<string, unknown>;
  readonly revealDeadlineSlot?: number;
}

export interface RevealReceiptInput {
  readonly actorId: string;
  readonly taskId: string;
  readonly sequence: number;
  readonly previousReceiptId?: string;
  readonly domain: string;
  readonly commitReceiptId: string;
  readonly commitHash: string;
  readonly payload: Record<string, unknown>;
}

export function createCommitReceipt(input: CommitReceiptInput): ReceiptRecord {
  const commitHash = hashCanonical(input.payload);
  const payload: Record<string, unknown> = {
    domain: input.domain,
    type: COMMIT_MARKER,
    commitMarker: true,
    commitHash,
  };
  if (input.revealDeadlineSlot !== undefined) {
    payload.revealDeadlineSlot = input.revealDeadlineSlot;
  }

  return createReceipt({
    actorId: input.actorId,
    kind: "assignment",
    taskId: input.taskId,
    sequence: input.sequence,
    previousReceiptId: input.previousReceiptId,
    payload,
  });
}

export function createRevealReceipt(input: RevealReceiptInput): ReceiptRecord {
  const revealHash = hashCanonical(input.payload);
  if (revealHash !== input.commitHash) {
    throw new Error(
      `Reveal hash ${revealHash} does not match committed hash ${input.commitHash}`,
    );
  }

  return createReceipt({
    actorId: input.actorId,
    kind: "completion",
    taskId: input.taskId,
    sequence: input.sequence,
    previousReceiptId: input.previousReceiptId,
    payload: {
      domain: input.domain,
      type: REVEAL_MARKER,
      revealMarker: true,
      commitReceiptId: input.commitReceiptId,
      commitHash: input.commitHash,
      reveal: input.payload,
    },
  });
}
