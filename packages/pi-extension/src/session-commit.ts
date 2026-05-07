import type { KeyObject } from "node:crypto";
import type { Address, TransactionSigner } from "@solana/kit";

import type {
  IdentityRecord,
  PiBridgeCommitInput,
  PiBridgeCommitResult,
  ReceiptIndexWriter,
  TaskRecord,
} from "@trust-substrate/sdk";
import { PiToolStreamBridge } from "@trust-substrate/sdk";
import type { PiToolCall } from "@trust-substrate/sdk";

import type { TurnCommitHandler, TurnCommitInput } from "./extension.js";

export interface SubstrateBindings {
  readonly authority: TransactionSigner;
  readonly identity: IdentityRecord;
  readonly identityAddress: Address;
  readonly task: TaskRecord;
  readonly taskAddress: Address;
  readonly domainCatalogAddress: Address;
  readonly reputationAddress: Address;
}

export interface SessionCommitterInput {
  readonly bridge: PiToolStreamBridge<ReceiptIndexWriter>;
  readonly bindings: SubstrateBindings;
  readonly runtimeAuthority?: KeyObject;
  readonly recordIdPrefix?: string;
  readonly sessionId?: string;
  readonly sequenceBase?: number;
  readonly onCommitted?: (result: PiBridgeCommitResult) => void | Promise<void>;
}

const DEFAULT_RECORD_PREFIX = "pi";

const formatRecordId = (
  prefix: string,
  sessionId: string,
  turnIndex: number,
): string => `${prefix}:${sessionId}:turn-${turnIndex}`;

export const buildBridgeCommitInput = (
  input: SessionCommitterInput,
  turn: {
    readonly turnIndex: number;
    readonly toolCalls: ReadonlyArray<PiToolCall>;
  },
): PiBridgeCommitInput => {
  const prefix = input.recordIdPrefix ?? DEFAULT_RECORD_PREFIX;
  const sessionId = input.sessionId ?? input.bindings.task.taskId;
  const recordId = formatRecordId(prefix, sessionId, turn.turnIndex);
  const sequence = (input.sequenceBase ?? 0) + turn.turnIndex + 1;
  return {
    authority: input.bindings.authority,
    identity: input.bindings.identity,
    identityAddress: input.bindings.identityAddress,
    task: input.bindings.task,
    taskAddress: input.bindings.taskAddress,
    domainCatalogAddress: input.bindings.domainCatalogAddress,
    reputationAddress: input.bindings.reputationAddress,
    recordId,
    kind: "completion",
    sequence,
    toolCalls: turn.toolCalls,
    runtimeAuthority: input.runtimeAuthority,
    payload: {
      sessionId,
      turnIndex: turn.turnIndex,
    },
  };
};

export const createSubstrateSessionCommitter = (
  input: SessionCommitterInput,
): TurnCommitHandler => {
  return async (turn: TurnCommitInput) => {
    const bridgeInput = buildBridgeCommitInput(input, turn);
    const result = await input.bridge.commit(bridgeInput);
    if (input.onCommitted) {
      await input.onCommitted(result);
    }
  };
};
