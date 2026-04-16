import {
  createMerkleTree,
  type MerkleProof,
  type MerkleTree,
  verifyMerkleProof,
} from "./merkle.js";
import { deriveIdentifier, emptyRoot, hashCanonical } from "./canonical.js";
import { deriveReputation, type ReputationProfile } from "./reputation.js";
import {
  createStakeEvent,
  deriveStakeState,
  extractStakeEventsFromReceipt,
} from "./stake.js";

export type ReceiptKind =
  | "assignment"
  | "handoff"
  | "completion"
  | "dispute"
  | "dispute_resolved"
  | "challenge"
  | "challenge_response";

export const RECEIPT_KIND_CODES: Readonly<Record<ReceiptKind, number>> = {
  assignment: 1,
  handoff: 2,
  completion: 3,
  dispute: 4,
  dispute_resolved: 5,
  challenge: 6,
  challenge_response: 7,
};

export const RECEIPT_SCOPE_BITS: Readonly<Record<ReceiptKind, number>> = {
  assignment: 1 << 0,
  handoff: 1 << 1,
  completion: 1 << 2,
  dispute: 1 << 3,
  dispute_resolved: 1 << 4,
  challenge: 1 << 5,
  challenge_response: 1 << 6,
};

export interface IdentityCreateInput {
  readonly authority: string;
  readonly label: string;
  readonly policyRoot?: string;
  readonly historyRoot?: string;
}

export interface IdentityRecord {
  readonly identityId: string;
  readonly authority: string;
  readonly label: string;
  readonly policyRoot: string;
  readonly historyRoot: string;
}

export interface TaskCreateInput {
  readonly identityId: string;
  readonly title: string;
  readonly domain?: string;
  readonly description?: string;
  readonly subtasks?: ReadonlyArray<string>;
}

export interface TaskRecord {
  readonly taskId: string;
  readonly identityId: string;
  readonly title: string;
  readonly domain: string;
  readonly description?: string;
  readonly subtasks: ReadonlyArray<string>;
}

export interface ReceiptCreateInput {
  readonly actorId: string;
  readonly kind: ReceiptKind;
  readonly taskId: string;
  readonly payload?: Readonly<Record<string, unknown>>;
  readonly sequence: number;
  readonly previousReceiptId?: string;
}

export interface ReceiptRecord {
  readonly receiptId: string;
  readonly hash: string;
  readonly actorId: string;
  readonly kind: ReceiptKind;
  readonly taskId: string;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly sequence: number;
  readonly previousReceiptId?: string;
  readonly domain: string;
  readonly auditorId?: string;
  readonly targetReceiptId?: string;
  readonly round?: number;
}

export interface DelegationScope {
  readonly allowedActions: ReadonlyArray<ReceiptKind>;
  readonly taskIds?: ReadonlyArray<string>;
  readonly domains?: ReadonlyArray<string>;
}

export interface DelegationCreateInput {
  readonly delegatorId: string;
  readonly delegateId: string;
  readonly allowedActions: ReadonlyArray<ReceiptKind>;
  readonly taskIds?: ReadonlyArray<string>;
  readonly domains?: ReadonlyArray<string>;
  readonly expiresAtSlot?: number;
  readonly revoked?: boolean;
}

export interface DelegationRecord {
  readonly delegationId: string;
  readonly delegatorId: string;
  readonly delegateId: string;
  readonly scope: DelegationScope;
  readonly expiresAtSlot?: number;
  readonly revoked: boolean;
}

export interface DelegationAssertionInput {
  readonly delegation: DelegationRecord;
  readonly action: ReceiptKind;
  readonly taskId?: string;
  readonly domain?: string;
  readonly currentSlot?: number;
}

export interface TrustSubstrateProofInput {
  readonly leaf: string;
  readonly proof: MerkleProof;
  readonly root: string;
  readonly index: number;
}

export class ReceiptLedger {
  private readonly receiptsById = new Map<string, ReceiptRecord>();
  private readonly hashes = new Set<string>();

  append(receipt: ReceiptRecord): ReceiptRecord {
    if (
      this.receiptsById.has(receipt.receiptId) ||
      this.hashes.has(receipt.hash)
    ) {
      throw new Error("Receipt replay rejected");
    }

    this.receiptsById.set(receipt.receiptId, receipt);
    this.hashes.add(receipt.hash);
    return receipt;
  }

  list(): ReadonlyArray<ReceiptRecord> {
    return [...this.receiptsById.values()];
  }
}

export class TrustSubstrateClient {
  readonly identity = {
    create: (input: IdentityCreateInput): IdentityRecord =>
      createIdentity(input),
  };

  readonly task = {
    create: (input: TaskCreateInput): TaskRecord => createTask(input),
  };

  readonly receipt = {
    create: (input: ReceiptCreateInput): ReceiptRecord => createReceipt(input),
  };

  readonly delegation = {
    create: (input: DelegationCreateInput): DelegationRecord =>
      createDelegation(input),
    assertAllowed: (input: DelegationAssertionInput): void =>
      assertDelegationAllowed(input),
  };

  readonly proof = {
    createTree: (leaves: ReadonlyArray<string>): MerkleTree =>
      createMerkleTree(leaves),
    verify: (input: TrustSubstrateProofInput): boolean =>
      verifyMerkleProof(input),
  };

  readonly reputation = {
    derive: (history: ReadonlyArray<ReceiptRecord>): ReputationProfile =>
      deriveReputation(history),
  };

  readonly stake = {
    createEvent: createStakeEvent,
    deriveState: deriveStakeState,
    extractEvents: extractStakeEventsFromReceipt,
  };
}

export function createIdentity(input: IdentityCreateInput): IdentityRecord {
  const policyRoot = input.policyRoot ?? emptyRoot();
  const historyRoot = input.historyRoot ?? emptyRoot();

  return {
    identityId: deriveIdentifier("identity", {
      authority: input.authority,
      historyRoot,
      label: input.label,
      policyRoot,
    }),
    authority: input.authority,
    label: input.label,
    policyRoot,
    historyRoot,
  };
}

export function createTask(input: TaskCreateInput): TaskRecord {
  const domain = input.domain ?? "general";

  return {
    taskId: deriveIdentifier("task", {
      description: input.description ?? "",
      domain,
      identityId: input.identityId,
      subtasks: [...(input.subtasks ?? [])],
      title: input.title,
    }),
    identityId: input.identityId,
    title: input.title,
    domain,
    description: input.description,
    subtasks: [...(input.subtasks ?? [])],
  };
}

export function createReceipt(input: ReceiptCreateInput): ReceiptRecord {
  const payload = {
    ...(input.payload ?? {}),
  };
  const domain =
    typeof payload.domain === "string" ? payload.domain : "general";
  const hash = hashCanonical({
    actorId: input.actorId,
    domain,
    kind: input.kind,
    payload,
    previousReceiptId: input.previousReceiptId ?? "",
    sequence: input.sequence,
    taskId: input.taskId,
  });

  return {
    receiptId: deriveIdentifier("receipt", hash),
    hash,
    actorId: input.actorId,
    kind: input.kind,
    taskId: input.taskId,
    payload,
    sequence: input.sequence,
    previousReceiptId: input.previousReceiptId,
    domain,
  };
}

export function createDelegation(
  input: DelegationCreateInput
): DelegationRecord {
  const scope: DelegationScope = {
    allowedActions: [...input.allowedActions],
    taskIds: input.taskIds ? [...input.taskIds] : undefined,
    domains: input.domains ? [...input.domains] : undefined,
  };

  return {
    delegationId: deriveIdentifier("delegation", {
      delegateId: input.delegateId,
      delegatorId: input.delegatorId,
      expiresAtSlot: input.expiresAtSlot ?? null,
      revoked: input.revoked ?? false,
      scope,
    }),
    delegatorId: input.delegatorId,
    delegateId: input.delegateId,
    scope,
    expiresAtSlot: input.expiresAtSlot,
    revoked: input.revoked ?? false,
  };
}

export function assertDelegationAllowed(input: DelegationAssertionInput): void {
  const { delegation } = input;

  if (delegation.revoked) {
    throw new Error("Delegation scope rejected: delegation revoked");
  }

  if (
    typeof delegation.expiresAtSlot === "number" &&
    (input.currentSlot ?? 0) > delegation.expiresAtSlot
  ) {
    throw new Error("Delegation scope rejected: delegation expired");
  }

  if (!delegation.scope.allowedActions.includes(input.action)) {
    throw new Error("Delegation scope rejected: action not allowed");
  }

  if (
    input.taskId !== undefined &&
    delegation.scope.taskIds !== undefined &&
    !delegation.scope.taskIds.includes(input.taskId)
  ) {
    throw new Error("Delegation scope rejected: task not allowed");
  }

  if (
    input.domain !== undefined &&
    delegation.scope.domains !== undefined &&
    !delegation.scope.domains.includes(input.domain)
  ) {
    throw new Error("Delegation scope rejected: domain not allowed");
  }
}
