import { deriveIdentifier } from "./canonical.js";
import type { ReceiptRecord } from "./client.js";

export const STAKE_EVENT_MARKER = "trust-substrate.stake_event" as const;

export type StakeEventKind =
  | "initialized"
  | "deposited"
  | "unstake_requested"
  | "unstake_finalized"
  | "slashed";

export interface StakeEventInput {
  readonly kind: StakeEventKind;
  readonly identityId: string;
  readonly ownerId?: string;
  readonly slashAuthorityId?: string;
  readonly amountLamports?: bigint | number | string;
  readonly unlocksAtSlot?: number;
  readonly disputeReceiptId?: string;
}

export interface StakeEvent {
  readonly type: typeof STAKE_EVENT_MARKER;
  readonly eventId: string;
  readonly kind: StakeEventKind;
  readonly identityId: string;
  readonly ownerId?: string;
  readonly slashAuthorityId?: string;
  readonly amountLamports?: string;
  readonly unlocksAtSlot?: number;
  readonly disputeReceiptId?: string;
}

export interface StakeState {
  readonly identityId: string;
  readonly ownerId?: string;
  readonly slashAuthorityId?: string;
  readonly activeLamports: bigint;
  readonly pendingUnstakeLamports: bigint;
  readonly unstakeUnlocksAtSlot?: number;
  readonly slashedLamports: bigint;
  readonly slashReceiptIds: ReadonlyArray<string>;
}

const AMOUNT_REQUIRED_KINDS = new Set<StakeEventKind>([
  "deposited",
  "unstake_requested",
  "unstake_finalized",
  "slashed",
]);

const isStakeEventKind = (value: unknown): value is StakeEventKind =>
  value === "initialized" ||
  value === "deposited" ||
  value === "unstake_requested" ||
  value === "unstake_finalized" ||
  value === "slashed";

const asNonEmptyString = (value: unknown): string | undefined =>
  typeof value === "string" && value.length > 0 ? value : undefined;

const asSlot = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : undefined;

const parsePositiveLamports = (value: unknown): bigint => {
  if (typeof value === "bigint") {
    if (value > 0n) {
      return value;
    }
    throw new Error("stake amount must be positive");
  }

  if (typeof value === "number") {
    if (Number.isSafeInteger(value) && value > 0) {
      return BigInt(value);
    }
    throw new Error("stake amount must be a positive safe integer");
  }

  if (typeof value === "string" && /^[0-9]+$/.test(value)) {
    const parsed = BigInt(value);
    if (parsed > 0n) {
      return parsed;
    }
  }

  throw new Error("stake amount must be positive");
};

const parseOptionalPositiveLamports = (value: unknown): bigint | undefined =>
  value === undefined ? undefined : parsePositiveLamports(value);

const subtractLamports = (
  current: bigint,
  amount: bigint,
  reason: string
): bigint => {
  if (amount > current) {
    throw new Error(`stake state underflow while ${reason}`);
  }
  return current - amount;
};

const normalizeStakeEvent = (
  input: StakeEventInput,
  eventIdOverride?: string
): StakeEvent => {
  if (input.identityId.length === 0) {
    throw new Error("stake event identityId is required");
  }

  const amount = AMOUNT_REQUIRED_KINDS.has(input.kind)
    ? parsePositiveLamports(input.amountLamports)
    : parseOptionalPositiveLamports(input.amountLamports);
  const event: Omit<StakeEvent, "eventId"> = {
    type: STAKE_EVENT_MARKER,
    kind: input.kind,
    identityId: input.identityId,
    ownerId: input.ownerId,
    slashAuthorityId: input.slashAuthorityId,
    amountLamports: amount?.toString(),
    unlocksAtSlot: input.unlocksAtSlot,
    disputeReceiptId: input.disputeReceiptId,
  };

  return {
    ...event,
    eventId: eventIdOverride ?? deriveIdentifier("stake_event", event),
  };
};

const eventFromRecord = (value: unknown): StakeEvent | undefined => {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }

  const candidate = value as Record<string, unknown>;
  if (candidate.type !== STAKE_EVENT_MARKER) {
    return undefined;
  }

  const kind = candidate.kind;
  const identityId = asNonEmptyString(candidate.identityId);
  if (!isStakeEventKind(kind) || !identityId) {
    return undefined;
  }

  const eventId = asNonEmptyString(candidate.eventId);
  return normalizeStakeEvent(
    {
      kind,
      identityId,
      ownerId: asNonEmptyString(candidate.ownerId),
      slashAuthorityId: asNonEmptyString(candidate.slashAuthorityId),
      amountLamports: candidate.amountLamports as
        | bigint
        | number
        | string
        | undefined,
      unlocksAtSlot: asSlot(candidate.unlocksAtSlot),
      disputeReceiptId: asNonEmptyString(candidate.disputeReceiptId),
    },
    eventId
  );
};

export function createStakeEvent(input: StakeEventInput): StakeEvent {
  return normalizeStakeEvent(input);
}

export function extractStakeEventsFromReceipt(
  receipt: ReceiptRecord
): StakeEvent[] {
  const events: StakeEvent[] = [];
  const payloadEvents = receipt.payload.stakeEvents;

  if (Array.isArray(payloadEvents)) {
    for (const payloadEvent of payloadEvents) {
      const event = eventFromRecord(payloadEvent);
      if (event) {
        events.push(event);
      }
    }
  }

  const resolution = receipt.payload.resolution;
  if (receipt.kind === "dispute_resolved" && isObject(resolution)) {
    const slashedAgentId = asNonEmptyString(resolution.slashedAgentId);
    const slashAmount =
      resolution.slashAmountLamports ?? resolution.slashAmount;
    if (slashedAgentId && slashAmount !== undefined) {
      events.push(
        createStakeEvent({
          kind: "slashed",
          identityId: slashedAgentId,
          amountLamports: slashAmount as string | number | bigint,
          disputeReceiptId: receipt.receiptId,
        })
      );
    }
  }

  return events;
}

export function deriveStakeState(
  identityId: string,
  events: ReadonlyArray<StakeEvent>
): StakeState {
  let ownerId: string | undefined;
  let slashAuthorityId: string | undefined;
  let activeLamports = 0n;
  let pendingUnstakeLamports = 0n;
  let unstakeUnlocksAtSlot: number | undefined;
  let slashedLamports = 0n;
  const slashReceiptIds: string[] = [];

  for (const event of events) {
    if (event.identityId !== identityId) {
      continue;
    }

    switch (event.kind) {
      case "initialized":
        ownerId = event.ownerId ?? ownerId;
        slashAuthorityId = event.slashAuthorityId ?? slashAuthorityId;
        break;
      case "deposited":
        activeLamports += parsePositiveLamports(event.amountLamports);
        break;
      case "unstake_requested":
        pendingUnstakeLamports = parsePositiveLamports(event.amountLamports);
        unstakeUnlocksAtSlot = event.unlocksAtSlot;
        break;
      case "unstake_finalized": {
        const amount = parsePositiveLamports(event.amountLamports);
        activeLamports = subtractLamports(
          activeLamports,
          amount,
          "finalizing unstake"
        );
        pendingUnstakeLamports = subtractLamports(
          pendingUnstakeLamports,
          amount,
          "clearing pending unstake"
        );
        if (pendingUnstakeLamports === 0n) {
          unstakeUnlocksAtSlot = undefined;
        }
        break;
      }
      case "slashed": {
        const amount = parsePositiveLamports(event.amountLamports);
        activeLamports = subtractLamports(activeLamports, amount, "slashing");
        slashedLamports += amount;
        if (event.disputeReceiptId) {
          slashReceiptIds.push(event.disputeReceiptId);
        }
        break;
      }
    }
  }

  return {
    identityId,
    ownerId,
    slashAuthorityId,
    activeLamports,
    pendingUnstakeLamports,
    unstakeUnlocksAtSlot,
    slashedLamports,
    slashReceiptIds: [...new Set(slashReceiptIds)].sort(),
  };
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;
