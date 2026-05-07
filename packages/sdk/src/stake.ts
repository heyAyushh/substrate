import { deriveIdentifier } from "./canonical.js";
import type { ReceiptRecord } from "./client.js";

export const STAKE_EVENT_MARKER = "trust-substrate.stake_event" as const;

export type StakeEventKind =
  | "initialized"
  | "deposited"
  | "unstake_requested"
  | "unstake_finalized"
  | "slashed";

export type StakeAssetKind = "sol" | "spl_token";

export interface StakeEventInput {
  readonly kind: StakeEventKind;
  readonly identityId: string;
  readonly ownerId?: string;
  readonly slashAuthorityId?: string;
  readonly assetKind?: StakeAssetKind;
  readonly mintId?: string;
  readonly tokenProgramId?: string;
  readonly amountLamports?: bigint | number | string;
  readonly amountBaseUnits?: bigint | number | string;
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
  readonly assetKind?: StakeAssetKind;
  readonly mintId?: string;
  readonly tokenProgramId?: string;
  readonly amountLamports?: string;
  readonly amountBaseUnits?: string;
  readonly unlocksAtSlot?: number;
  readonly disputeReceiptId?: string;
}

export interface TokenStakeState {
  readonly mintId: string;
  readonly tokenProgramId?: string;
  readonly activeBaseUnits: bigint;
  readonly pendingUnstakeBaseUnits: bigint;
  readonly unstakeUnlocksAtSlot?: number;
  readonly slashedBaseUnits: bigint;
  readonly slashReceiptIds: ReadonlyArray<string>;
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
  readonly tokenStakes: ReadonlyArray<TokenStakeState>;
}

type MutableTokenStakeState = {
  mintId: string;
  tokenProgramId?: string;
  activeBaseUnits: bigint;
  pendingUnstakeBaseUnits: bigint;
  unstakeUnlocksAtSlot?: number;
  slashedBaseUnits: bigint;
  slashReceiptIds: string[];
};

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

const parsePositiveAmount = (value: unknown, label: string): bigint => {
  if (typeof value === "bigint") {
    if (value > 0n) {
      return value;
    }
    throw new Error(`${label} must be positive`);
  }

  if (typeof value === "number") {
    if (Number.isSafeInteger(value) && value > 0) {
      return BigInt(value);
    }
    throw new Error(`${label} must be a positive safe integer`);
  }

  if (typeof value === "string" && /^[0-9]+$/.test(value)) {
    const parsed = BigInt(value);
    if (parsed > 0n) {
      return parsed;
    }
  }

  throw new Error(`${label} must be positive`);
};

const parsePositiveLamports = (value: unknown): bigint =>
  parsePositiveAmount(value, "stake amount");

const parsePositiveBaseUnits = (value: unknown): bigint =>
  parsePositiveAmount(value, "token stake amount");

const parseOptionalPositiveLamports = (value: unknown): bigint | undefined =>
  value === undefined ? undefined : parsePositiveLamports(value);

const parseOptionalPositiveBaseUnits = (value: unknown): bigint | undefined =>
  value === undefined ? undefined : parsePositiveBaseUnits(value);

const isStakeAssetKind = (value: unknown): value is StakeAssetKind =>
  value === "sol" || value === "spl_token";

const resolveAssetKind = (input: StakeEventInput): StakeAssetKind => {
  if (input.assetKind) {
    return input.assetKind;
  }
  return input.mintId || input.amountBaseUnits !== undefined
    ? "spl_token"
    : "sol";
};

const subtractLamports = (
  current: bigint,
  amount: bigint,
  reason: string,
): bigint => {
  if (amount > current) {
    throw new Error(`stake state underflow while ${reason}`);
  }
  return current - amount;
};

const subtractBaseUnits = subtractLamports;

const normalizeStakeEvent = (
  input: StakeEventInput,
  eventIdOverride?: string,
): StakeEvent => {
  if (input.identityId.length === 0) {
    throw new Error("stake event identityId is required");
  }

  const assetKind = resolveAssetKind(input);
  if (assetKind === "spl_token" && !input.mintId) {
    throw new Error("token stake event mintId is required");
  }

  const amountLamports =
    assetKind === "sol"
      ? AMOUNT_REQUIRED_KINDS.has(input.kind)
        ? parsePositiveLamports(input.amountLamports)
        : parseOptionalPositiveLamports(input.amountLamports)
      : undefined;
  const amountBaseUnits =
    assetKind === "spl_token"
      ? AMOUNT_REQUIRED_KINDS.has(input.kind)
        ? parsePositiveBaseUnits(input.amountBaseUnits)
        : parseOptionalPositiveBaseUnits(input.amountBaseUnits)
      : undefined;

  const event: Omit<StakeEvent, "eventId"> = {
    type: STAKE_EVENT_MARKER,
    kind: input.kind,
    identityId: input.identityId,
    ownerId: input.ownerId,
    slashAuthorityId: input.slashAuthorityId,
    assetKind: assetKind === "spl_token" ? assetKind : undefined,
    mintId: assetKind === "spl_token" ? input.mintId : undefined,
    tokenProgramId:
      assetKind === "spl_token" ? input.tokenProgramId : undefined,
    amountLamports: amountLamports?.toString(),
    amountBaseUnits: amountBaseUnits?.toString(),
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

  const candidateAssetKind = candidate.assetKind;
  const assetKind = isStakeAssetKind(candidateAssetKind)
    ? candidateAssetKind
    : undefined;
  const eventId = asNonEmptyString(candidate.eventId);
  return normalizeStakeEvent(
    {
      kind,
      identityId,
      ownerId: asNonEmptyString(candidate.ownerId),
      slashAuthorityId: asNonEmptyString(candidate.slashAuthorityId),
      assetKind,
      mintId: asNonEmptyString(candidate.mintId),
      tokenProgramId: asNonEmptyString(candidate.tokenProgramId),
      amountLamports: candidate.amountLamports as
        | bigint
        | number
        | string
        | undefined,
      amountBaseUnits: candidate.amountBaseUnits as
        | bigint
        | number
        | string
        | undefined,
      unlocksAtSlot: asSlot(candidate.unlocksAtSlot),
      disputeReceiptId: asNonEmptyString(candidate.disputeReceiptId),
    },
    eventId,
  );
};

export function createStakeEvent(input: StakeEventInput): StakeEvent {
  return normalizeStakeEvent(input);
}

export function extractStakeEventsFromReceipt(
  receipt: ReceiptRecord,
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
    const slashedMintId = asNonEmptyString(
      resolution.slashedMintId ?? resolution.mintId,
    );
    const slashedTokenProgramId = asNonEmptyString(
      resolution.slashedTokenProgramId ?? resolution.tokenProgramId,
    );
    const slashAmountBaseUnits =
      resolution.slashAmountBaseUnits ?? resolution.slashAmountTokenBaseUnits;
    const slashAmountLamports =
      resolution.slashAmountLamports ?? resolution.slashAmount;

    if (slashedAgentId && slashedMintId && slashAmountBaseUnits !== undefined) {
      events.push(
        createStakeEvent({
          kind: "slashed",
          identityId: slashedAgentId,
          assetKind: "spl_token",
          mintId: slashedMintId,
          tokenProgramId: slashedTokenProgramId,
          amountBaseUnits: slashAmountBaseUnits as string | number | bigint,
          disputeReceiptId: receipt.receiptId,
        }),
      );
    }

    if (slashedAgentId && slashAmountLamports !== undefined) {
      events.push(
        createStakeEvent({
          kind: "slashed",
          identityId: slashedAgentId,
          amountLamports: slashAmountLamports as string | number | bigint,
          disputeReceiptId: receipt.receiptId,
        }),
      );
    }
  }

  return events;
}

export function deriveStakeState(
  identityId: string,
  events: ReadonlyArray<StakeEvent>,
): StakeState {
  let ownerId: string | undefined;
  let slashAuthorityId: string | undefined;
  let activeLamports = 0n;
  let pendingUnstakeLamports = 0n;
  let unstakeUnlocksAtSlot: number | undefined;
  let slashedLamports = 0n;
  const slashReceiptIds: string[] = [];
  const tokenStates = new Map<string, MutableTokenStakeState>();

  for (const event of events) {
    if (event.identityId !== identityId) {
      continue;
    }

    switch (event.kind) {
      case "initialized":
        ownerId = event.ownerId ?? ownerId;
        slashAuthorityId = event.slashAuthorityId ?? slashAuthorityId;
        if ((event.assetKind ?? "sol") === "spl_token" && event.mintId) {
          getTokenState(tokenStates, event);
        }
        break;
      case "deposited":
        if ((event.assetKind ?? "sol") === "spl_token") {
          getTokenState(tokenStates, event).activeBaseUnits +=
            parsePositiveBaseUnits(event.amountBaseUnits);
        } else {
          activeLamports += parsePositiveLamports(event.amountLamports);
        }
        break;
      case "unstake_requested":
        if ((event.assetKind ?? "sol") === "spl_token") {
          const tokenState = getTokenState(tokenStates, event);
          tokenState.pendingUnstakeBaseUnits = parsePositiveBaseUnits(
            event.amountBaseUnits,
          );
          tokenState.unstakeUnlocksAtSlot = event.unlocksAtSlot;
        } else {
          pendingUnstakeLamports = parsePositiveLamports(event.amountLamports);
          unstakeUnlocksAtSlot = event.unlocksAtSlot;
        }
        break;
      case "unstake_finalized": {
        if ((event.assetKind ?? "sol") === "spl_token") {
          const amount = parsePositiveBaseUnits(event.amountBaseUnits);
          const tokenState = getTokenState(tokenStates, event);
          tokenState.activeBaseUnits = subtractBaseUnits(
            tokenState.activeBaseUnits,
            amount,
            "finalizing token unstake",
          );
          tokenState.pendingUnstakeBaseUnits = subtractBaseUnits(
            tokenState.pendingUnstakeBaseUnits,
            amount,
            "clearing pending token unstake",
          );
          if (tokenState.pendingUnstakeBaseUnits === 0n) {
            tokenState.unstakeUnlocksAtSlot = undefined;
          }
        } else {
          const amount = parsePositiveLamports(event.amountLamports);
          activeLamports = subtractLamports(
            activeLamports,
            amount,
            "finalizing unstake",
          );
          pendingUnstakeLamports = subtractLamports(
            pendingUnstakeLamports,
            amount,
            "clearing pending unstake",
          );
          if (pendingUnstakeLamports === 0n) {
            unstakeUnlocksAtSlot = undefined;
          }
        }
        break;
      }
      case "slashed": {
        if ((event.assetKind ?? "sol") === "spl_token") {
          const amount = parsePositiveBaseUnits(event.amountBaseUnits);
          const tokenState = getTokenState(tokenStates, event);
          tokenState.activeBaseUnits = subtractBaseUnits(
            tokenState.activeBaseUnits,
            amount,
            "token slashing",
          );
          tokenState.slashedBaseUnits += amount;
          if (event.disputeReceiptId) {
            tokenState.slashReceiptIds.push(event.disputeReceiptId);
          }
        } else {
          const amount = parsePositiveLamports(event.amountLamports);
          activeLamports = subtractLamports(activeLamports, amount, "slashing");
          slashedLamports += amount;
          if (event.disputeReceiptId) {
            slashReceiptIds.push(event.disputeReceiptId);
          }
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
    tokenStakes: [...tokenStates.values()]
      .map((state) => ({
        mintId: state.mintId,
        tokenProgramId: state.tokenProgramId,
        activeBaseUnits: state.activeBaseUnits,
        pendingUnstakeBaseUnits: state.pendingUnstakeBaseUnits,
        unstakeUnlocksAtSlot: state.unstakeUnlocksAtSlot,
        slashedBaseUnits: state.slashedBaseUnits,
        slashReceiptIds: [...new Set(state.slashReceiptIds)].sort(),
      }))
      .sort((left, right) => left.mintId.localeCompare(right.mintId)),
  };
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const tokenStakeKey = (event: StakeEvent): string => {
  if (!event.mintId) {
    throw new Error("token stake event mintId is required");
  }
  return `${event.tokenProgramId ?? ""}:${event.mintId}`;
};

const getTokenState = (
  states: Map<string, MutableTokenStakeState>,
  event: StakeEvent,
): MutableTokenStakeState => {
  const key = tokenStakeKey(event);
  const existing = states.get(key);
  if (existing) {
    return existing;
  }

  const state: MutableTokenStakeState = {
    mintId: event.mintId!,
    tokenProgramId: event.tokenProgramId,
    activeBaseUnits: 0n,
    pendingUnstakeBaseUnits: 0n,
    unstakeUnlocksAtSlot: undefined,
    slashedBaseUnits: 0n,
    slashReceiptIds: [],
  };
  states.set(key, state);
  return state;
};
