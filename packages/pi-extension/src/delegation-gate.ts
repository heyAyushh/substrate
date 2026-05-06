import {
  assertDelegationAllowed,
  type DelegationAssertionInput,
  type DelegationRecord,
  type ReceiptKind,
} from "@trust-substrate/sdk";

export interface DelegationGateInput {
  readonly delegation: DelegationRecord;
  readonly action: ReceiptKind;
  readonly taskId?: string;
  readonly domain?: string;
  readonly currentSlot?: number;
}

export interface DelegationGateDecision {
  readonly block: boolean;
  readonly reason?: string;
}

export const evaluateDelegationGate = (
  input: DelegationGateInput,
): DelegationGateDecision => {
  const assertion: DelegationAssertionInput = {
    delegation: input.delegation,
    action: input.action,
    taskId: input.taskId,
    domain: input.domain,
    currentSlot: input.currentSlot,
  };
  try {
    assertDelegationAllowed(assertion);
    return { block: false };
  } catch (error) {
    return { block: true, reason: (error as Error).message };
  }
};

export interface ToolCallGateInput {
  readonly toolName: string;
  readonly delegation?: DelegationRecord;
  readonly action?: ReceiptKind;
  readonly taskId?: string;
  readonly domain?: string;
  readonly currentSlot?: number;
}

const DEFAULT_ACTION: ReceiptKind = "completion";

export const gateToolCall = (
  input: ToolCallGateInput,
): DelegationGateDecision => {
  if (!input.delegation) {
    return { block: false };
  }
  return evaluateDelegationGate({
    delegation: input.delegation,
    action: input.action ?? DEFAULT_ACTION,
    taskId: input.taskId,
    domain: input.domain,
    currentSlot: input.currentSlot,
  });
};
