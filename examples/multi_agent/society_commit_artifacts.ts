import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { hashCanonical } from "@trust-substrate/sdk/canonical";

export type CommitProofStatus = "prepared" | "committed" | "failed";

export interface SocietyCompressedReceipt {
  readonly receiptId: string;
  readonly kind: string;
  readonly actorId: string;
  readonly payloadHash: string;
}

export interface SocietyCompressedTx {
  readonly batchId: string;
  readonly eventRoot: string;
  readonly receipts: ReadonlyArray<SocietyCompressedReceipt>;
}

export interface SocietyCommitRun {
  readonly runId: string;
  readonly version?: unknown;
  readonly config?: unknown;
  readonly agents?: unknown;
  readonly grid?: unknown;
  readonly timeline?: unknown;
  readonly events?: unknown;
  readonly receipts?: unknown;
  readonly compressedTxs?: ReadonlyArray<SocietyCompressedTx>;
  readonly graph?: unknown;
  readonly leaderboard?: unknown;
  readonly tokenizedAgents?: unknown;
  readonly metrics?: unknown;
}

export interface ProgramWiringStep {
  readonly name: string;
  readonly action: string;
  readonly status: "wired";
  readonly expectedRecords: number;
}

export interface ProgramWiringPlan {
  readonly programs: ReadonlyArray<ProgramWiringStep>;
  readonly summary: {
    readonly totalPrograms: number;
    readonly compressedBatches: number;
    readonly tokenizedAgents: number;
    readonly emittedReceipts: number;
  };
}

export interface CommitProofChainEvidence {
  readonly rpcUrl?: string;
  readonly studioUrl?: string;
  readonly programPlan?: ProgramWiringPlan;
  readonly identity?: unknown;
  readonly task?: unknown;
  readonly reputation?: unknown;
  readonly checkpoint?: unknown;
  readonly adjudicator?: unknown;
  readonly dispute?: unknown;
  readonly agentAccounts?: unknown;
  readonly committedReceipts?: unknown;
  readonly operations?: unknown;
  readonly totalBatches?: number;
  readonly committedBatchCount?: number;
}

export interface CommitProofArtifact {
  readonly schemaVersion: number;
  readonly createdAt: string;
  readonly runId: string;
  readonly commitId: string;
  readonly status: CommitProofStatus;
  readonly preparedProofHash?: string;
  readonly run: {
    readonly version: unknown;
    readonly config: unknown;
    readonly agents: unknown;
    readonly grid: unknown;
    readonly timeline: unknown;
    readonly metrics: unknown;
    readonly leaderboard: unknown;
    readonly graph: unknown;
    readonly events: unknown;
    readonly receipts: unknown;
    readonly compressedTxs: ReadonlyArray<SocietyCompressedTx>;
    readonly tokenizedAgents: unknown;
  };
  readonly chain: CommitProofChainEvidence | null;
  readonly error: string | null;
  readonly proofHash: string;
}

export interface CommitProofReference {
  readonly id: string;
  readonly file: string;
  readonly url: string;
  readonly hash: string;
  readonly status: CommitProofStatus;
}

interface BuildCommitProofArtifactInput {
  readonly run: SocietyCommitRun;
  readonly commitId: string;
  readonly status: CommitProofStatus;
  readonly createdAt?: string;
  readonly preparedProofHash?: string;
  readonly chain?: CommitProofChainEvidence;
  readonly error?: string;
}

interface CreateProofReferenceInput {
  readonly proofDirectory: string;
  readonly routePrefix: string;
  readonly fileName: string;
  readonly artifact: CommitProofArtifact;
}

interface WriteCommitProofArtifactInput extends BuildCommitProofArtifactInput {
  readonly proofDirectory: string;
  readonly routePrefix: string;
}

const PROOF_SCHEMA_VERSION = 1;
const UNSAFE_FILE_SEGMENT = /[^a-zA-Z0-9_.-]+/g;
const LEADING_OR_TRAILING_SEPARATOR = /^-+|-+$/g;
const PROOF_FILE_EXTENSION = ".json";
const FALLBACK_PROOF_SEGMENT = "proof";
const FULL_STACK_PROGRAMS = [
  {
    name: "identity_registry",
    action: "create run and agent identities, bond the run identity",
  },
  {
    name: "attester_registry",
    action: "initialize registry and register the run identity as attester",
  },
  {
    name: "delegation_engine",
    action: "delegate simulation scope from the run identity to agents",
  },
  {
    name: "task_registry",
    action: "create the society task and sync receipt status",
  },
  {
    name: "receipt_emitter",
    action: "emit compressed batch receipts and a dispute audit receipt",
  },
  {
    name: "proof_verifier",
    action: "initialize a history checkpoint and append every receipt",
  },
  {
    name: "reputation_accumulator",
    action: "create the society reputation domain and apply completions",
  },
  {
    name: "agent_stake",
    action: "initialize and fund token stake for every seeded agent",
  },
  {
    name: "dispute_resolver",
    action: "register adjudication and record the audit verdict",
  },
] as const;

const sanitizeProofSegment = (value: string): string => {
  const safe = value
    .replace(UNSAFE_FILE_SEGMENT, "-")
    .replace(LEADING_OR_TRAILING_SEPARATOR, "");
  return safe.length > 0 ? safe : FALLBACK_PROOF_SEGMENT;
};

const toJsonSafe = (value: unknown): unknown => {
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Uint8Array) return Array.from(value);
  if (Array.isArray(value)) return value.map(toJsonSafe);
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [key, toJsonSafe(entry)]),
  );
};

export const selectCommitBatches = (
  run: SocietyCommitRun,
): SocietyCompressedTx[] => {
  if (!Array.isArray(run.compressedTxs)) {
    throw new Error("Run payload must include compressedTxs");
  }
  if (run.compressedTxs.length === 0) {
    throw new Error("No compressed transaction batches to commit");
  }
  return [...run.compressedTxs];
};

export const buildProgramWiringPlan = (
  run: SocietyCommitRun,
): ProgramWiringPlan => {
  const batches = selectCommitBatches(run);
  const tokenizedAgents = Array.isArray(run.tokenizedAgents)
    ? run.tokenizedAgents.length
    : 0;
  const emittedReceipts = batches.length + 1;
  const expectedRecordsByProgram: Readonly<Record<string, number>> = {
    identity_registry: Math.max(1, tokenizedAgents + 1),
    attester_registry: 2,
    delegation_engine: Math.max(1, tokenizedAgents),
    task_registry: emittedReceipts + 1,
    receipt_emitter: emittedReceipts,
    proof_verifier: emittedReceipts + 2,
    reputation_accumulator: batches.length + 2,
    agent_stake: tokenizedAgents * 2,
    dispute_resolver: 2,
  };
  const programs = FULL_STACK_PROGRAMS.map((program) => ({
    ...program,
    status: "wired" as const,
    expectedRecords: expectedRecordsByProgram[program.name],
  }));

  return {
    programs,
    summary: {
      totalPrograms: programs.length,
      compressedBatches: batches.length,
      tokenizedAgents,
      emittedReceipts,
    },
  };
};

export const createProofFileName = (runId: string, commitId: string): string =>
  `${sanitizeProofSegment(runId)}-${sanitizeProofSegment(
    commitId,
  )}${PROOF_FILE_EXTENSION}`;

export const buildCommitProofArtifact = ({
  run,
  commitId,
  status,
  createdAt = new Date().toISOString(),
  preparedProofHash,
  chain,
  error,
}: BuildCommitProofArtifactInput): CommitProofArtifact => {
  const proofBody = {
    schemaVersion: PROOF_SCHEMA_VERSION,
    createdAt,
    runId: run.runId,
    commitId,
    status,
    preparedProofHash,
    run: {
      version: toJsonSafe(run.version ?? 1),
      config: toJsonSafe(run.config ?? null),
      agents: toJsonSafe(run.agents ?? []),
      grid: toJsonSafe(run.grid ?? null),
      timeline: toJsonSafe(run.timeline ?? []),
      metrics: toJsonSafe(run.metrics ?? null),
      leaderboard: toJsonSafe(run.leaderboard ?? []),
      graph: toJsonSafe(run.graph ?? null),
      events: toJsonSafe(run.events ?? []),
      receipts: toJsonSafe(run.receipts ?? []),
      compressedTxs: selectCommitBatches(run),
      tokenizedAgents: toJsonSafe(run.tokenizedAgents ?? []),
    },
    chain: toJsonSafe(chain ?? null) as CommitProofChainEvidence | null,
    error: error ?? null,
  };

  return {
    ...proofBody,
    proofHash: hashCanonical(proofBody),
  };
};

export const createProofReference = ({
  proofDirectory,
  routePrefix,
  fileName,
  artifact,
}: CreateProofReferenceInput): CommitProofReference => {
  const normalizedPrefix = routePrefix.replace(/\/+$/g, "");
  const id = fileName.endsWith(PROOF_FILE_EXTENSION)
    ? fileName.slice(0, -PROOF_FILE_EXTENSION.length)
    : fileName;

  return {
    id,
    file: join(proofDirectory, fileName),
    url: `${normalizedPrefix}/${fileName}`,
    hash: artifact.proofHash,
    status: artifact.status,
  };
};

export const writeCommitProofArtifact = async (
  input: WriteCommitProofArtifactInput,
): Promise<{
  readonly artifact: CommitProofArtifact;
  readonly reference: CommitProofReference;
}> => {
  const artifact = buildCommitProofArtifact(input);
  const fileName = createProofFileName(input.run.runId, input.commitId);
  const reference = createProofReference({
    proofDirectory: input.proofDirectory,
    routePrefix: input.routePrefix,
    fileName,
    artifact,
  });

  await mkdir(input.proofDirectory, { recursive: true });
  await writeFile(reference.file, JSON.stringify(artifact, null, 2), "utf8");

  return { artifact, reference };
};
