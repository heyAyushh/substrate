import { hashCanonical } from "@trust-substrate/sdk/canonical";

import type {
  CommitProofChainEvidence,
  ProgramWiringPlan,
} from "./society_commit_artifacts.ts";

export type ProtocolEvidenceStatus = "present" | "missing";

export interface ProtocolEvidenceRecord {
  readonly label: string;
  readonly source: "account" | "operation" | "receipt" | "action-envelope";
  readonly address?: string;
  readonly signature?: string;
  readonly slot?: number;
  readonly agentId?: string;
  readonly receiptId?: string;
  readonly txSignature?: string;
  readonly hash?: string;
  readonly note?: string;
}

export interface ProtocolProgramEvidence {
  readonly name: string;
  readonly demoRole: "board-primary" | "supporting-trust-program";
  readonly demoSurface: string;
  readonly boundary: string;
  readonly status: ProtocolEvidenceStatus;
  readonly expectedRecords: number;
  readonly records: ReadonlyArray<ProtocolEvidenceRecord>;
  readonly missing: ReadonlyArray<string>;
}

export interface ProtocolEvidenceGraph {
  readonly schemaVersion: number;
  readonly graphHash: string;
  readonly generatedAt: string;
  readonly programs: ReadonlyArray<ProtocolProgramEvidence>;
  readonly summary: {
    readonly totalPrograms: number;
    readonly presentPrograms: number;
    readonly missingPrograms: number;
    readonly records: number;
    readonly receipts: number;
    readonly actionEnvelopes: number;
    readonly transactions: number;
  };
}

interface BuildProtocolEvidenceGraphInput {
  readonly programPlan: ProgramWiringPlan;
  readonly chain: CommitProofChainEvidence;
  readonly generatedAt?: string;
}

type ProgramName =
  | "identity_registry"
  | "attester_registry"
  | "delegation_engine"
  | "task_registry"
  | "receipt_emitter"
  | "proof_verifier"
  | "reputation_accumulator"
  | "agent_stake"
  | "dispute_resolver";

const PROTOCOL_EVIDENCE_SCHEMA_VERSION = 1;
const PROTOCOL_PROGRAMS: ReadonlyArray<ProgramName> = [
  "identity_registry",
  "attester_registry",
  "delegation_engine",
  "task_registry",
  "receipt_emitter",
  "proof_verifier",
  "reputation_accumulator",
  "agent_stake",
  "dispute_resolver",
];

const OPERATION_KINDS_BY_PROGRAM: Readonly<
  Record<ProgramName, ReadonlySet<string>>
> = {
  identity_registry: new Set(["create_identity", "deposit_identity_bond"]),
  attester_registry: new Set([
    "initialize_attester_registry",
    "register_attester",
  ]),
  delegation_engine: new Set(["create_delegation"]),
  task_registry: new Set([
    "create_task",
    "create_society_world",
    "update_society_world",
    "sync_task_status",
  ]),
  receipt_emitter: new Set([
    "emit_receipt",
    "emit_delegated_receipt",
    "emit_audit_receipt",
  ]),
  proof_verifier: new Set([
    "initialize_history_updater",
    "initialize_history_checkpoint",
    "append_receipt_to_checkpoint",
  ]),
  reputation_accumulator: new Set([
    "initialize_domain_catalog",
    "register_domain",
    "create_reputation_domain",
    "apply_reputation_receipt",
  ]),
  agent_stake: new Set([
    "fund_agent_identity",
    "initialize_stake",
    "stake",
    "slash_with_verdict",
  ]),
  dispute_resolver: new Set(["register_adjudicator", "record_verdict"]),
};

export const buildProtocolEvidenceGraph = ({
  programPlan,
  chain,
  generatedAt = new Date().toISOString(),
}: BuildProtocolEvidenceGraphInput): ProtocolEvidenceGraph => {
  const programs = programPlan.programs.map((program) => {
    const programName = readProgramName(program.name);
    const records = programName
      ? collectProgramRecords(programName, chain)
      : [];
    const missing =
      records.length > 0
        ? []
        : [`No ${program.name} account or transaction evidence is indexed yet`];

    return {
      name: program.name,
      demoRole: program.demoRole,
      demoSurface: program.demoSurface,
      boundary: program.boundary,
      status: records.length > 0 ? "present" : "missing",
      expectedRecords: program.expectedRecords,
      records,
      missing,
    } satisfies ProtocolProgramEvidence;
  });
  const summary = {
    totalPrograms: programs.length,
    presentPrograms: programs.filter((program) => program.status === "present")
      .length,
    missingPrograms: programs.filter((program) => program.status === "missing")
      .length,
    records: programs.reduce(
      (count, program) => count + program.records.length,
      0,
    ),
    receipts: committedReceipts(chain).length,
    actionEnvelopes: actionEnvelopeRecords(chain).length,
    transactions: programs.reduce(
      (count, program) =>
        count +
        program.records.filter(
          (record) => Boolean(record.signature) || Boolean(record.txSignature),
        ).length,
      0,
    ),
  };
  const graphBody = {
    schemaVersion: PROTOCOL_EVIDENCE_SCHEMA_VERSION,
    generatedAt,
    programs,
    summary,
  };

  return {
    ...graphBody,
    graphHash: hashCanonical(graphBody),
  };
};

const collectProgramRecords = (
  program: ProgramName,
  chain: CommitProofChainEvidence,
): ProtocolEvidenceRecord[] => {
  const records = [
    ...collectAccountRecords(program, chain),
    ...collectOperationRecords(program, chain),
    ...collectReceiptRecords(program, chain),
    ...collectActionEnvelopeRecords(program, chain),
  ];
  const deduped = new Map<string, ProtocolEvidenceRecord>();

  for (const record of records) {
    const key = hashCanonical(record);
    if (!deduped.has(key)) {
      deduped.set(key, record);
    }
  }

  return [...deduped.values()];
};

const collectAccountRecords = (
  program: ProgramName,
  chain: CommitProofChainEvidence,
): ProtocolEvidenceRecord[] => {
  switch (program) {
    case "identity_registry":
      return [
        accountRecord("run identity", chain.identity),
        accountRecord("identity bond", readRecord(chain.identity).bond),
        ...agentAccounts(chain).map((agent) =>
          accountRecord(`agent identity ${agentLabel(agent)}`, agent.identity),
        ),
      ].filter(isEvidenceRecord);
    case "attester_registry":
      return [
        accountRecord("run attester", readRecord(chain.identity).attester),
      ].filter(isEvidenceRecord);
    case "delegation_engine":
      return agentAccounts(chain)
        .map((agent) =>
          accountRecord(`delegation ${agentLabel(agent)}`, agent.delegation),
        )
        .filter(isEvidenceRecord);
    case "task_registry":
      return [
        accountRecord("society task", chain.task),
        accountRecord("society world", readRecord(chain).world),
      ].filter(isEvidenceRecord);
    case "proof_verifier":
      return [accountRecord("history checkpoint", chain.checkpoint)].filter(
        isEvidenceRecord,
      );
    case "reputation_accumulator":
      return [
        accountRecord("society reputation domain", chain.reputation),
      ].filter(isEvidenceRecord);
    case "agent_stake":
      return agentAccounts(chain)
        .map((agent) =>
          accountRecord(`stake ${agentLabel(agent)}`, agent.stake),
        )
        .filter(isEvidenceRecord);
    case "dispute_resolver":
      return [
        accountRecord("adjudicator config", chain.adjudicator),
        accountRecord("dispute receipt", readRecord(chain.dispute).receipt),
        accountRecord("dispute verdict", readRecord(chain.dispute).verdict),
      ].filter(isEvidenceRecord);
    case "receipt_emitter":
      return [];
  }
};

const collectOperationRecords = (
  program: ProgramName,
  chain: CommitProofChainEvidence,
): ProtocolEvidenceRecord[] => {
  const kinds = OPERATION_KINDS_BY_PROGRAM[program];

  return operations(chain)
    .filter((operation) => {
      const kind = readString(operation.kind);
      return kind ? kinds.has(kind) : false;
    })
    .map((operation) => ({
      label: readString(operation.kind) ?? "operation",
      source: "operation" as const,
      address: readString(operation.address),
      signature: readString(operation.signature),
      slot: readNumber(operation.slot),
      agentId: readString(operation.agentId),
      note: readCreatedNote(operation),
    }));
};

const collectReceiptRecords = (
  program: ProgramName,
  chain: CommitProofChainEvidence,
): ProtocolEvidenceRecord[] => {
  if (program !== "receipt_emitter") return [];

  return committedReceipts(chain).map((receipt) => ({
    label: readString(receipt.batchId) ?? "receipt",
    source: "receipt" as const,
    address: readString(receipt.address),
    signature: readString(receipt.signature),
    slot: readNumber(receipt.slot),
    receiptId: readString(receipt.receiptId),
  }));
};

const collectActionEnvelopeRecords = (
  program: ProgramName,
  chain: CommitProofChainEvidence,
): ProtocolEvidenceRecord[] => {
  if (program !== "receipt_emitter" && program !== "proof_verifier") {
    return [];
  }

  return actionEnvelopeRecords(chain).map((envelope) => ({
    label:
      program === "proof_verifier"
        ? "envelope transcript root"
        : "chain-bound action envelope",
    source: "action-envelope" as const,
    address: readString(envelope.receiptAddress),
    txSignature: readString(envelope.txSignature),
    slot: readNumber(envelope.slot),
    agentId: readString(envelope.agentId),
    hash:
      program === "proof_verifier"
        ? readString(envelope.transcriptRoot)
        : readString(envelope.leafHash),
  }));
};

const accountRecord = (
  label: string,
  value: unknown,
): ProtocolEvidenceRecord | undefined => {
  const record = readRecord(value);
  const address = readString(record.address) ?? readString(value);
  if (!address) return undefined;

  return {
    label,
    source: "account",
    address,
    signature: readString(record.signature),
    slot: readNumber(record.slot),
  };
};

const actionEnvelopeRecords = (
  chain: CommitProofChainEvidence,
): Record<string, unknown>[] =>
  committedReceipts(chain)
    .map((receipt) =>
      readRecord(readRecord(receipt.actionProof).actionEnvelope),
    )
    .filter((record) => Object.keys(record).length > 0);

const committedReceipts = (
  chain: CommitProofChainEvidence,
): Record<string, unknown>[] =>
  Array.isArray(chain.committedReceipts)
    ? chain.committedReceipts.map(readRecord)
    : [];

const operations = (
  chain: CommitProofChainEvidence,
): Record<string, unknown>[] =>
  Array.isArray(chain.operations) ? chain.operations.map(readRecord) : [];

const agentAccounts = (
  chain: CommitProofChainEvidence,
): Record<string, unknown>[] =>
  Array.isArray(chain.agentAccounts) ? chain.agentAccounts.map(readRecord) : [];

const readProgramName = (value: string): ProgramName | undefined =>
  PROTOCOL_PROGRAMS.includes(value as ProgramName)
    ? (value as ProgramName)
    : undefined;

const readRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" ? (value as Record<string, unknown>) : {};

const readString = (value: unknown): string | undefined =>
  typeof value === "string" && value.length > 0 ? value : undefined;

const readNumber = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;

const agentLabel = (agent: Record<string, unknown>): string =>
  readString(agent.agentId) ?? "unknown-agent";

const readCreatedNote = (
  operation: Record<string, unknown>,
): string | undefined =>
  typeof operation.created === "boolean"
    ? operation.created
      ? "created"
      : "already existed"
    : undefined;

const isEvidenceRecord = (
  record: ProtocolEvidenceRecord | undefined,
): record is ProtocolEvidenceRecord => Boolean(record);
