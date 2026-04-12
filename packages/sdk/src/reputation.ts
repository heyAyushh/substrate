import { hashCanonical } from "./canonical.js";
import type { ReceiptRecord, ReceiptKind } from "./client.js";

export interface ReputationProfile {
  readonly identityId: string;
  readonly overall: number;
  readonly domains: Readonly<Record<string, number>>;
  readonly byKind: Readonly<Record<ReceiptKind, number>>;
  readonly receiptCount: number;
  readonly historyHash: string;
}

const KIND_WEIGHTS: Readonly<Record<ReceiptKind, number>> = {
  assignment: 1,
  completion: 5,
  dispute: -4,
  handoff: 2
};

const KIND_NAMES: ReadonlyArray<ReceiptKind> = [
  "assignment",
  "handoff",
  "completion",
  "dispute"
];

export function deriveReputation(history: ReadonlyArray<ReceiptRecord>): ReputationProfile {
  if (history.length === 0) {
    throw new Error("Reputation derivation requires at least one verified receipt");
  }

  const orderedHistory = [...history].sort(compareReceipts);
  const identityId = orderedHistory[0].actorId;
  const domains: Record<string, number> = {};
  const byKind = createEmptyKindVector();
  let overall = 0;

  for (const receipt of orderedHistory) {
    const weight = KIND_WEIGHTS[receipt.kind];
    const domain = receipt.domain;

    byKind[receipt.kind] += 1;
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
        taskId: receipt.taskId
      }))
    )
  };
}

function createEmptyKindVector(): Record<ReceiptKind, number> {
  return KIND_NAMES.reduce<Record<ReceiptKind, number>>((vector, kind) => {
    vector[kind] = 0;
    return vector;
  }, {} as Record<ReceiptKind, number>);
}

function compareReceipts(left: ReceiptRecord, right: ReceiptRecord): number {
  if (left.sequence !== right.sequence) {
    return left.sequence - right.sequence;
  }

  return left.hash.localeCompare(right.hash);
}
