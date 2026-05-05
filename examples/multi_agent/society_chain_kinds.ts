const TASK_SYNCABLE_RECEIPT_KINDS = new Set([
  "assignment",
  "handoff",
  "completion",
  "dispute",
  "dispute_resolved",
]);

const REPUTATION_APPLICABLE_RECEIPT_KINDS = new Set([
  "completion",
  "dispute",
  "dispute_resolved",
]);

const shouldSkipLiveRoutingForAction = (action: string | undefined): boolean =>
  action === "death";

export const supportsTaskStatusSync = (kind: string | undefined): boolean =>
  typeof kind === "string" && TASK_SYNCABLE_RECEIPT_KINDS.has(kind);

export const supportsReputationApply = (kind: string | undefined): boolean =>
  typeof kind === "string" && REPUTATION_APPLICABLE_RECEIPT_KINDS.has(kind);

export const shouldSyncLiveTaskStatus = (input: {
  action?: string;
  kind?: string;
}): boolean =>
  !shouldSkipLiveRoutingForAction(input.action) &&
  supportsTaskStatusSync(input.kind);

export const shouldApplyLiveReputation = (input: {
  action?: string;
  kind?: string;
}): boolean =>
  !shouldSkipLiveRoutingForAction(input.action) &&
  supportsReputationApply(input.kind);
