import { createReceipt, type ReceiptRecord } from "./client.js";

export const CHALLENGE_MARKER = "trust-substrate.challenge";
export const CHALLENGE_RESPONSE_MARKER = "trust-substrate.challenge_response";
export const UNANSWERED_CHALLENGE_MARKER =
  "trust-substrate.unanswered_challenge";

export interface ChallengeReceiptInput {
  readonly actorId: string;
  readonly taskId: string;
  readonly sequence: number;
  readonly previousReceiptId?: string;
  readonly domain: string;
  readonly targetReceiptId: string;
  readonly deadlineSlot: number;
}

export interface ChallengeResponseReceiptInput {
  readonly actorId: string;
  readonly taskId: string;
  readonly sequence: number;
  readonly previousReceiptId?: string;
  readonly domain: string;
  readonly challengeReceiptId: string;
  readonly evidenceHash: string;
  readonly evidenceUri?: string;
}

export interface UnansweredChallengeDisputeInput {
  readonly actorId: string;
  readonly taskId: string;
  readonly sequence: number;
  readonly previousReceiptId?: string;
  readonly domain: string;
  readonly challengeReceiptId: string;
  readonly targetReceiptId: string;
}

export function createChallengeReceipt(
  input: ChallengeReceiptInput
): ReceiptRecord {
  return createReceipt({
    actorId: input.actorId,
    kind: "challenge",
    taskId: input.taskId,
    sequence: input.sequence,
    previousReceiptId: input.previousReceiptId,
    payload: {
      domain: input.domain,
      type: CHALLENGE_MARKER,
      challengeTarget: input.targetReceiptId,
      deadlineSlot: input.deadlineSlot,
    },
  });
}

export function createChallengeResponseReceipt(
  input: ChallengeResponseReceiptInput
): ReceiptRecord {
  const payload: Record<string, unknown> = {
    domain: input.domain,
    type: CHALLENGE_RESPONSE_MARKER,
    challengeReceiptId: input.challengeReceiptId,
    evidenceHash: input.evidenceHash,
  };
  if (input.evidenceUri !== undefined) {
    payload.evidenceUri = input.evidenceUri;
  }

  return createReceipt({
    actorId: input.actorId,
    kind: "challenge_response",
    taskId: input.taskId,
    sequence: input.sequence,
    previousReceiptId: input.previousReceiptId,
    payload,
  });
}

export function buildUnansweredChallengePayload(
  input: UnansweredChallengeDisputeInput
): ReceiptRecord {
  return createReceipt({
    actorId: input.actorId,
    kind: "dispute",
    taskId: input.taskId,
    sequence: input.sequence,
    previousReceiptId: input.previousReceiptId,
    payload: {
      domain: input.domain,
      type: UNANSWERED_CHALLENGE_MARKER,
      challengeReceiptId: input.challengeReceiptId,
      targetReceiptId: input.targetReceiptId,
    },
  });
}

/**
 * @deprecated Use buildUnansweredChallengePayload. The production unanswered-challenge flow is governed by receipt_emitter.
 */
export function createUnansweredChallengeDispute(
  input: UnansweredChallengeDisputeInput
): ReceiptRecord {
  return buildUnansweredChallengePayload(input);
}
