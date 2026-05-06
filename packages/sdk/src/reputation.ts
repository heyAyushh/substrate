import { hashCanonical } from "./canonical.js";
import type { ReceiptRecord, ReceiptKind } from "./client.js";
import { COMMIT_MARKER, REVEAL_MARKER } from "./commit-reveal.js";
import type { AuthorityRotationEvent } from "./rotation.js";

export interface ReputationProfile {
  readonly identityId: string;
  readonly overall: number;
  readonly domains: Readonly<Record<string, number>>;
  readonly byKind: Readonly<Record<ReceiptKind, number>>;
  readonly receiptCount: number;
  readonly historyHash: string;
}

export interface ReputationDerivationOptions {
  readonly currentSlot?: number;
  readonly authorityRotations?: ReadonlyArray<AuthorityRotationEvent>;
  readonly decayPreRotationFactor?: number;
  readonly weightByCost?: boolean;
}

const KIND_WEIGHTS: Readonly<Record<ReceiptKind, number>> = {
  assignment: 1,
  challenge: 0,
  challenge_response: 0,
  completion: 5,
  dispute: -4,
  dispute_resolved: 3,
  handoff: 2,
};

const KIND_NAMES: ReadonlyArray<ReceiptKind> = [
  "assignment",
  "handoff",
  "completion",
  "dispute",
  "dispute_resolved",
  "challenge",
  "challenge_response",
];

export function deriveReputation(
  history: ReadonlyArray<ReceiptRecord>,
  options: ReputationDerivationOptions = {},
): ReputationProfile {
  if (history.length === 0) {
    throw new Error(
      "Reputation derivation requires at least one verified receipt",
    );
  }

  const orderedHistory = [...history].sort(compareReceipts);
  const identityId = orderedHistory[0].actorId;
  const domains: Record<string, number> = {};
  const byKind = createEmptyKindVector();
  let overall = 0;
  const expiredCommitments = collectExpiredCommitments(
    orderedHistory,
    options.currentSlot,
  );
  const preRotationDecay = getPreRotationDecay(options);
  const latestRotationSequence = getLatestRotationSequence(
    options.authorityRotations,
    identityId,
  );

  for (const receipt of orderedHistory) {
    const weight =
      KIND_WEIGHTS[receipt.kind] *
      getReceiptWeightFactor(
        receipt,
        latestRotationSequence,
        preRotationDecay,
      ) *
      getCostWeightFactor(receipt, options.weightByCost ?? false);
    const domain = receipt.domain;

    byKind[receipt.kind] += 1;
    domains[domain] = (domains[domain] ?? 0) + weight;
    overall += weight;
  }

  for (const receipt of expiredCommitments) {
    const domain = receipt.domain;
    const weight = KIND_WEIGHTS.dispute;
    byKind.dispute += 1;
    domains[domain] = (domains[domain] ?? 0) + weight;
    overall += weight;
  }

  return {
    identityId,
    overall,
    domains,
    byKind,
    receiptCount: orderedHistory.length,
    historyHash: hashCanonical(
      orderedHistory.map((receipt) => ({
        actorId: receipt.actorId,
        domain: receipt.domain,
        hash: receipt.hash,
        kind: receipt.kind,
        receiptId: receipt.receiptId,
        sequence: receipt.sequence,
        taskId: receipt.taskId,
      })),
    ),
  };
}

function getPreRotationDecay(options: ReputationDerivationOptions): number {
  const factor = options.decayPreRotationFactor ?? 1;
  if (factor <= 0 || factor > 1) {
    throw new Error(
      "rotation decay factor must be greater than 0 and at most 1",
    );
  }
  return factor;
}

function getLatestRotationSequence(
  rotations: ReadonlyArray<AuthorityRotationEvent> | undefined,
  identityId: string,
): number | undefined {
  if (!rotations || rotations.length === 0) {
    return undefined;
  }

  let latestSequence: number | undefined;
  for (const rotation of rotations) {
    if (rotation.agentId !== identityId || rotation.sequence === undefined) {
      continue;
    }
    if (latestSequence === undefined || rotation.sequence > latestSequence) {
      latestSequence = rotation.sequence;
    }
  }
  return latestSequence;
}

function getReceiptWeightFactor(
  receipt: ReceiptRecord,
  latestRotationSequence: number | undefined,
  preRotationDecay: number,
): number {
  if (latestRotationSequence === undefined || preRotationDecay === 1) {
    return 1;
  }
  return receipt.sequence < latestRotationSequence ? preRotationDecay : 1;
}

function getCostWeightFactor(
  receipt: ReceiptRecord,
  weightByCost: boolean,
): number {
  if (!weightByCost || receipt.kind !== "completion") {
    return 1;
  }

  const cost = receipt.payload.cost;
  if (!isObject(cost)) {
    return 1;
  }

  const tokensIn = asFiniteNumber(cost.tokensIn);
  const tokensOut = asFiniteNumber(cost.tokensOut);
  const elapsedMs = asFiniteNumber(cost.elapsedMs);
  const usdMicros = asFiniteNumber(cost.usdMicros);
  const totalCostUnits =
    tokensIn + tokensOut + elapsedMs / 1000 + usdMicros / 1_000_000;

  return totalCostUnits > 0 ? 1 + Math.log10(1 + totalCostUnits) : 1;
}

function collectExpiredCommitments(
  history: ReadonlyArray<ReceiptRecord>,
  currentSlot?: number,
): ReceiptRecord[] {
  if (currentSlot === undefined) {
    return [];
  }

  const revealedCommitIds = new Set<string>();
  for (const receipt of history) {
    if (!isRevealReceipt(receipt)) {
      continue;
    }
    const commitReceiptId = receipt.payload.commitReceiptId;
    if (typeof commitReceiptId === "string") {
      revealedCommitIds.add(commitReceiptId);
    }
  }

  return history.filter((receipt) => {
    if (!isCommitReceipt(receipt)) {
      return false;
    }
    const deadline = receipt.payload.revealDeadlineSlot;
    return (
      typeof deadline === "number" &&
      currentSlot > deadline &&
      !revealedCommitIds.has(receipt.receiptId)
    );
  });
}

function isCommitReceipt(receipt: ReceiptRecord): boolean {
  return (
    receipt.payload.type === COMMIT_MARKER ||
    receipt.payload.commitMarker === true
  );
}

function isRevealReceipt(receipt: ReceiptRecord): boolean {
  return (
    receipt.payload.type === REVEAL_MARKER ||
    receipt.payload.revealMarker === true
  );
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asFiniteNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function createEmptyKindVector(): Record<ReceiptKind, number> {
  return KIND_NAMES.reduce<Record<ReceiptKind, number>>(
    (vector, kind) => {
      vector[kind] = 0;
      return vector;
    },
    {} as Record<ReceiptKind, number>,
  );
}

function compareReceipts(left: ReceiptRecord, right: ReceiptRecord): number {
  if (left.sequence !== right.sequence) {
    return left.sequence - right.sequence;
  }

  return left.hash.localeCompare(right.hash);
}
