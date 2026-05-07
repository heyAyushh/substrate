import { hashCanonical } from "./canonical.js";

export const AGENT_ACTION_ENVELOPE_SCHEMA_VERSION = 1;

export interface AgentActionEnvelope {
  readonly schemaVersion: typeof AGENT_ACTION_ENVELOPE_SCHEMA_VERSION;
  readonly agentId: string;
  readonly identityAddress: string;
  readonly taskAddress: string;
  readonly tick: number | null;
  readonly action: string;
  readonly args: unknown;
  readonly promptHash: string | null;
  readonly responseHash: string | null;
  readonly preStateHash: string;
  readonly postStateHash: string;
  readonly receiptAddress: string;
  readonly receiptPayloadHash: string;
  readonly txSignature: string;
  readonly slot: number;
  readonly agentSignature: string;
  readonly transcriptRoot: string;
  readonly leafHash: string;
  readonly merkleProof?: {
    readonly leafIndex: number;
    readonly siblings: ReadonlyArray<string>;
  };
}

export type AgentActionEnvelopeInput = Omit<
  AgentActionEnvelope,
  "schemaVersion"
> & {
  readonly schemaVersion?: typeof AGENT_ACTION_ENVELOPE_SCHEMA_VERSION;
};

const REQUIRED_STRING_FIELDS = [
  "agentId",
  "identityAddress",
  "taskAddress",
  "action",
  "preStateHash",
  "postStateHash",
  "receiptAddress",
  "receiptPayloadHash",
  "txSignature",
  "agentSignature",
  "transcriptRoot",
  "leafHash",
] as const;

export function buildAgentActionEnvelope(
  input: AgentActionEnvelopeInput,
): AgentActionEnvelope {
  const envelope: AgentActionEnvelope = {
    schemaVersion: input.schemaVersion ?? AGENT_ACTION_ENVELOPE_SCHEMA_VERSION,
    agentId: input.agentId,
    identityAddress: input.identityAddress,
    taskAddress: input.taskAddress,
    tick: input.tick,
    action: input.action,
    args: input.args,
    promptHash: input.promptHash,
    responseHash: input.responseHash,
    preStateHash: input.preStateHash,
    postStateHash: input.postStateHash,
    receiptAddress: input.receiptAddress,
    receiptPayloadHash: input.receiptPayloadHash,
    txSignature: input.txSignature,
    slot: input.slot,
    agentSignature: input.agentSignature,
    transcriptRoot: input.transcriptRoot,
    leafHash: input.leafHash,
    ...(input.merkleProof ? { merkleProof: input.merkleProof } : {}),
  };
  assertAgentActionEnvelopeChainBound(envelope);
  return envelope;
}

export function hashAgentActionEnvelope(envelope: AgentActionEnvelope): string {
  return hashCanonical(envelope);
}

export function assertAgentActionEnvelopeChainBound(
  envelope: AgentActionEnvelope,
): true {
  if (envelope.schemaVersion !== AGENT_ACTION_ENVELOPE_SCHEMA_VERSION) {
    throw new Error("AgentActionEnvelope schemaVersion is unsupported");
  }
  for (const field of REQUIRED_STRING_FIELDS) {
    const value = envelope[field];
    if (typeof value !== "string" || value.length === 0) {
      throw new Error(`AgentActionEnvelope missing ${field}`);
    }
  }
  if (!Number.isInteger(envelope.slot) || envelope.slot < 0) {
    throw new Error("AgentActionEnvelope missing slot");
  }
  return true;
}
