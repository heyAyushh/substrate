import { mkdir, writeFile } from "node:fs/promises";
import { createHash, createHmac } from "node:crypto";
import { join } from "node:path";

import {
  buildAgentActionEnvelope,
  type AgentActionEnvelope,
} from "@trust-substrate/sdk";
import { hashCanonical } from "@trust-substrate/sdk/canonical";

import type { ProtocolEvidenceGraph } from "./society_protocol_evidence.ts";

export type CommitProofStatus = "prepared" | "committed" | "failed";
export type SocietyActionSourceKind =
  | "simulation"
  | "pi-agent"
  | "pi-llm"
  | "external";

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

export interface SocietyActionSource {
  readonly kind: SocietyActionSourceKind;
  readonly driver: string;
  readonly runtimeSessionId?: string;
  readonly modelId?: string;
  readonly note?: string;
}

export interface SocietyActionSignature {
  readonly scheme: string;
  readonly signer: string;
  readonly value: string;
}

export type SocietyActionStatePhase = "before-action" | "after-action";

export interface SocietyActionStateCommitment {
  readonly phase: SocietyActionStatePhase;
  readonly stateHash: string;
  readonly signature: SocietyActionSignature;
}

export interface SocietyActionRuntimeEvidence {
  readonly kind: "pi-action";
  readonly provider: string;
  readonly modelId: string;
  readonly promptHash: string;
  readonly responseHash: string;
  readonly decisionHash: string;
  readonly decision: unknown;
}

export interface SocietyActionSigningPayload {
  readonly schemaVersion: number;
  readonly sequence: number;
  readonly runId: string;
  readonly eventId: string;
  readonly receiptId: string | null;
  readonly agentId: string;
  readonly actorId: string;
  readonly action: string;
  readonly tick: number | null;
  readonly source: SocietyActionSource;
  readonly eventHash: string;
  readonly receiptHash: string;
  readonly receiptPayloadHash: string | null;
  readonly runtimeEvidence?: SocietyActionRuntimeEvidence;
  readonly beforeStateHash: string;
  readonly afterStateHash: string;
  readonly actionHash: string;
}

export interface SocietyActionStateCommitmentContext extends SocietyActionSigningPayload {
  readonly event: Readonly<Record<string, unknown>>;
  readonly receipt: Readonly<Record<string, unknown>>;
}

export interface SocietySignedAction {
  readonly schemaVersion: number;
  readonly sequence: number;
  readonly runId: string;
  readonly eventId: string;
  readonly receiptId: string | null;
  readonly agentId: string;
  readonly actorId: string;
  readonly action: string;
  readonly tick: number | null;
  readonly source: SocietyActionSource;
  readonly eventHash: string;
  readonly receiptHash: string;
  readonly receiptPayloadHash: string | null;
  readonly runtimeEvidence?: SocietyActionRuntimeEvidence;
  readonly actionHash: string;
  readonly beforeState: SocietyActionStateCommitment;
  readonly afterState: SocietyActionStateCommitment;
  readonly signature: SocietyActionSignature;
  readonly leafHash: string;
}

export interface SocietyActionTranscript {
  readonly schemaVersion: number;
  readonly root: string;
  readonly actionCount: number;
  readonly sourceKinds: ReadonlyArray<SocietyActionSourceKind>;
  readonly actions: ReadonlyArray<SocietySignedAction>;
}

export interface SocietyAgentActionEnvelopeInput {
  readonly signedAction: SocietySignedAction;
  readonly identityAddress: string;
  readonly taskAddress: string;
  readonly receiptAddress: string;
  readonly receiptPayloadHash: string;
  readonly txSignature: string;
  readonly slot: number;
  readonly transcriptRoot: string;
  readonly args?: unknown;
}

export interface ProgramWiringStep {
  readonly name: string;
  readonly action: string;
  readonly demoRole: "board-primary" | "supporting-trust-program";
  readonly status: "wired";
  readonly expectedRecords: number;
  readonly demoSurface: string;
  readonly evidence: string;
  readonly boundary: string;
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
  readonly world?: unknown;
  readonly reputation?: unknown;
  readonly checkpoint?: unknown;
  readonly adjudicator?: unknown;
  readonly dispute?: unknown;
  readonly agentAccounts?: unknown;
  readonly committedReceipts?: unknown;
  readonly operations?: unknown;
  readonly protocolEvidence?: ProtocolEvidenceGraph;
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
  readonly actionTranscript: SocietyActionTranscript;
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

export interface CommitProofVerification {
  readonly ok: boolean;
  readonly proofHash: string;
  readonly transcriptRoot: string;
  readonly actionCount: number;
  readonly checkedEnvelopes: number;
}

interface BuildCommitProofArtifactInput {
  readonly run: SocietyCommitRun;
  readonly commitId: string;
  readonly status: CommitProofStatus;
  readonly createdAt?: string;
  readonly preparedProofHash?: string;
  readonly actionTranscript?: SocietyActionTranscript;
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
const ACTION_TRANSCRIPT_SCHEMA_VERSION = 1;
const SIGNED_ACTION_SCHEMA_VERSION = 1;
const UNSAFE_FILE_SEGMENT = /[^a-zA-Z0-9_.-]+/g;
const LEADING_OR_TRAILING_SEPARATOR = /^-+|-+$/g;
const PROOF_FILE_EXTENSION = ".json";
const FALLBACK_PROOF_SEGMENT = "proof";
const EMPTY_ACTION_TRANSCRIPT_ROOT = createHash("sha256")
  .update("trust-substrate:empty-society-action-transcript")
  .digest("hex");
const MERKLE_LEAF_PREFIX = Buffer.from("leaf:", "utf8");
const MERKLE_NODE_PREFIX = Buffer.from("node:", "utf8");
const DEFAULT_SIMULATION_SOURCE: SocietyActionSource = {
  kind: "simulation",
  driver: "society-board-deterministic-driver",
  note: "Deterministic board simulation. Pi/LLM-backed sources must publish their own runtime/model evidence.",
};
const FULL_STACK_PROGRAMS = [
  {
    name: "identity_registry",
    action: "create run and agent identities, bond the run identity",
    demoRole: "supporting-trust-program",
    demoSurface: "Run identity plus one on-chain identity per board agent",
    evidence:
      "identity account, identity bond, attester self-declaration, and agent identity accounts",
    boundary:
      "Authority rotation and guardian recovery are not board interactions yet",
  },
  {
    name: "attester_registry",
    action: "initialize registry and register the run identity as attester",
    demoRole: "supporting-trust-program",
    demoSurface: "Society attester registry used by the run identity",
    evidence: "attester registry setup and attester account operations",
    boundary:
      "Third-party attestation filtering is not played as a board move yet",
  },
  {
    name: "delegation_engine",
    action: "delegate simulation scope from the run identity to agents",
    demoRole: "supporting-trust-program",
    demoSurface:
      "Per-agent delegation records for delegated receipt submission",
    evidence:
      "agent delegation accounts and delegated receipt submitter signatures",
    boundary:
      "Revocation and multi-hop delegation are not triggered by this board",
  },
  {
    name: "task_registry",
    action: "create the society task and sync receipt status",
    demoRole: "board-primary",
    demoSurface:
      "Primary board program: society task plus the Surfpool world account bound to it",
    evidence:
      "task account, society world account, and task status sync operations",
    boundary: "Only the society-world task path is shown",
  },
  {
    name: "receipt_emitter",
    action: "emit compressed batch receipts and a dispute audit receipt",
    demoRole: "supporting-trust-program",
    demoSurface: "Every committed board action becomes an on-chain receipt",
    evidence:
      "committed receipt list, raw transaction links, and receipt payload hashes",
    boundary:
      "Availability challenge receipts are exercised in the Pi console flow, not the board",
  },
  {
    name: "proof_verifier",
    action: "initialize a history checkpoint and append every receipt",
    demoRole: "supporting-trust-program",
    demoSurface: "History checkpoint tracks the ordered receipt stream",
    evidence:
      "checkpoint account, latest checkpoint hash, and append operations",
    boundary:
      "A dedicated inclusion-proof browser flow is still outside the board",
  },
  {
    name: "reputation_accumulator",
    action: "create the society reputation domain and apply completions",
    demoRole: "supporting-trust-program",
    demoSurface: "Society reputation domain updates from committed receipts",
    evidence: "reputation account and apply-reputation operations",
    boundary:
      "Weights are demo defaults rather than a governance-selected policy",
  },
  {
    name: "agent_stake",
    action: "initialize and fund token stake for every seeded agent",
    demoRole: "supporting-trust-program",
    demoSurface: "Every board agent starts with an initialized stake account",
    evidence: "agent stake accounts, funding signatures, and stake deposits",
    boundary:
      "Adversarial live deaths can trigger verdict slashing; unstake is not auto-triggered by this board",
  },
  {
    name: "dispute_resolver",
    action: "register adjudication and record the audit verdict",
    demoRole: "supporting-trust-program",
    demoSurface: "Final audit receipt records the clean-run verdict",
    evidence:
      "adjudicator config, treasury vault, dispute receipt, and verdict account",
    boundary:
      "Normal runs end with a clean audit verdict; Society death dispute verdicts are emitted only when deaths occur",
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

export const buildSocietyActionTranscript = (
  run: SocietyCommitRun,
  options: {
    readonly source?: SocietyActionSource;
    readonly signAction?: (
      actionHash: string,
      action: SocietyActionSigningPayload,
    ) => SocietyActionSignature;
    readonly signStateCommitment?: (
      stateHash: string,
      action: SocietyActionSigningPayload,
      phase: SocietyActionStatePhase,
    ) => SocietyActionSignature;
    readonly resolveStateCommitments?: (
      context: SocietyActionStateCommitmentContext,
    ) => {
      readonly beforeStateHash?: string;
      readonly afterStateHash?: string;
    };
    readonly resolveRuntimeEvidence?: (
      context: SocietyActionStateCommitmentContext,
    ) => SocietyActionRuntimeEvidence | undefined;
  } = {},
): SocietyActionTranscript => {
  const events = Array.isArray(run.events) ? run.events : [];
  const receipts = Array.isArray(run.receipts) ? run.receipts : [];
  const source = options.source ?? resolveActionSource(run.config);
  const signAction =
    options.signAction ??
    ((actionHash, action) =>
      createLocalSimulationActionSignature(
        run.runId,
        action.agentId,
        actionHash,
      ));
  const signStateCommitment =
    options.signStateCommitment ??
    ((stateHash, action) => signAction(stateHash, action));
  const actions = events.map((event, index) => {
    const eventRecord = readRecord(event);
    const receipt = findReceiptForEvent(receipts, eventRecord, index);
    const receiptRecord = readRecord(receipt);
    const receiptPayload = readRecord(receiptRecord.payload);
    const eventHash = hashCanonical(eventRecord);
    const receiptHash = hashCanonical(receiptRecord);
    const receiptPayloadHash =
      readString(receiptRecord.payloadHash) ??
      readString(receiptPayload.payloadHash) ??
      null;
    const defaultStateCommitments = buildDefaultStateCommitmentHashes({
      run,
      events,
      receipts,
      eventRecord,
      receiptRecord,
      eventHash,
      receiptHash,
      receiptPayloadHash,
      index,
    });
    const actionBase = {
      schemaVersion: SIGNED_ACTION_SCHEMA_VERSION,
      sequence: index + 1,
      runId: run.runId,
      eventId: readString(eventRecord.id) ?? `event_${index + 1}`,
      receiptId: readString(receiptRecord.receiptId) ?? null,
      agentId: readString(eventRecord.agentId) ?? "unknown-agent",
      actorId:
        readString(eventRecord.actorIdentityId) ??
        readString(receiptRecord.actorId) ??
        readString(eventRecord.agentId) ??
        "unknown-actor",
      action: readString(eventRecord.action) ?? "unknown",
      tick: readNumber(eventRecord.tick),
      source,
      eventHash,
      receiptHash,
      receiptPayloadHash,
    };
    const stateCommitments =
      options.resolveStateCommitments?.({
        ...actionBase,
        ...defaultStateCommitments,
        actionHash: "",
        event: eventRecord,
        receipt: receiptRecord,
      }) ?? defaultStateCommitments;
    const runtimeEvidence = options.resolveRuntimeEvidence?.({
      ...actionBase,
      ...defaultStateCommitments,
      actionHash: "",
      event: eventRecord,
      receipt: receiptRecord,
    });
    const action = {
      ...actionBase,
      ...(runtimeEvidence ? { runtimeEvidence } : {}),
      beforeStateHash:
        stateCommitments.beforeStateHash ??
        defaultStateCommitments.beforeStateHash,
      afterStateHash:
        stateCommitments.afterStateHash ??
        defaultStateCommitments.afterStateHash,
      actionHash: "",
    };
    const actionHash = hashCanonical({ ...action, actionHash: undefined });
    const signingPayload = { ...action, actionHash };
    const signedAction = {
      ...actionBase,
      ...(runtimeEvidence ? { runtimeEvidence } : {}),
      actionHash,
      beforeState: {
        phase: "before-action" as const,
        stateHash: action.beforeStateHash,
        signature: signStateCommitment(
          action.beforeStateHash,
          signingPayload,
          "before-action",
        ),
      },
      afterState: {
        phase: "after-action" as const,
        stateHash: action.afterStateHash,
        signature: signStateCommitment(
          action.afterStateHash,
          signingPayload,
          "after-action",
        ),
      },
      signature: signAction(actionHash, signingPayload),
    };

    return {
      ...signedAction,
      leafHash: hashCanonical(signedAction),
    };
  });

  return {
    schemaVersion: ACTION_TRANSCRIPT_SCHEMA_VERSION,
    root: merkleRoot(actions.map((action) => action.leafHash)),
    actionCount: actions.length,
    sourceKinds: Array.from(
      new Set(actions.map((action) => action.source.kind)),
    ),
    actions,
  };
};

export const buildAgentActionEnvelopeForSignedSocietyAction = ({
  signedAction,
  identityAddress,
  taskAddress,
  receiptAddress,
  receiptPayloadHash,
  txSignature,
  slot,
  transcriptRoot,
  args = {},
}: SocietyAgentActionEnvelopeInput): AgentActionEnvelope =>
  buildAgentActionEnvelope({
    agentId: signedAction.agentId,
    identityAddress,
    taskAddress,
    tick: signedAction.tick,
    action: signedAction.action,
    args,
    promptHash: signedAction.runtimeEvidence?.promptHash ?? null,
    responseHash: signedAction.runtimeEvidence?.responseHash ?? null,
    preStateHash: signedAction.beforeState.stateHash,
    postStateHash: signedAction.afterState.stateHash,
    receiptAddress,
    receiptPayloadHash,
    txSignature,
    slot,
    agentSignature: signedAction.signature.value,
    transcriptRoot,
    leafHash: signedAction.leafHash,
  });

export const buildCommitProofArtifact = ({
  run,
  commitId,
  status,
  createdAt = new Date().toISOString(),
  preparedProofHash,
  actionTranscript,
  chain,
  error,
}: BuildCommitProofArtifactInput): CommitProofArtifact => {
  const transcript = actionTranscript ?? buildSocietyActionTranscript(run);
  const proofBody = {
    schemaVersion: PROOF_SCHEMA_VERSION,
    createdAt,
    runId: run.runId,
    commitId,
    status,
    preparedProofHash,
    actionTranscript: toJsonSafe(transcript) as SocietyActionTranscript,
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

export const verifyCommitProofArtifact = (
  artifact: CommitProofArtifact,
): CommitProofVerification => {
  const expectedProofHash = hashCanonical(stripProofHash(artifact));
  if (artifact.proofHash !== expectedProofHash) {
    throw new Error("Commit proof hash mismatch");
  }

  const actions = Array.isArray(artifact.actionTranscript.actions)
    ? artifact.actionTranscript.actions
    : [];
  if (artifact.actionTranscript.actionCount !== actions.length) {
    throw new Error("Commit proof action count mismatch");
  }

  for (const action of actions) {
    verifySignedAction(action);
  }

  const expectedTranscriptRoot = merkleRoot(
    actions.map((action) => action.leafHash),
  );
  if (artifact.actionTranscript.root !== expectedTranscriptRoot) {
    throw new Error("Commit proof transcript root mismatch");
  }

  const checkedEnvelopes = verifyChainBoundEnvelopes(
    artifact.chain,
    artifact.actionTranscript.root,
  );

  return {
    ok: true,
    proofHash: artifact.proofHash,
    transcriptRoot: artifact.actionTranscript.root,
    actionCount: actions.length,
    checkedEnvelopes,
  };
};

function createLocalSimulationActionSignature(
  runId: string,
  agentId: string,
  actionHash: string,
): SocietyActionSignature {
  const key = hashCanonical({
    namespace: "society-local-simulation-action-signature",
    runId,
    agentId,
  });

  return {
    scheme: "hmac-sha256/local-simulation",
    signer: `society-board:${agentId}`,
    value: createHmac("sha256", key).update(actionHash).digest("hex"),
  };
}

function buildDefaultStateCommitmentHashes({
  run,
  events,
  receipts,
  eventRecord,
  receiptRecord,
  eventHash,
  receiptHash,
  receiptPayloadHash,
  index,
}: {
  readonly run: SocietyCommitRun;
  readonly events: ReadonlyArray<unknown>;
  readonly receipts: ReadonlyArray<unknown>;
  readonly eventRecord: Readonly<Record<string, unknown>>;
  readonly receiptRecord: Readonly<Record<string, unknown>>;
  readonly eventHash: string;
  readonly receiptHash: string;
  readonly receiptPayloadHash: string | null;
  readonly index: number;
}): { readonly beforeStateHash: string; readonly afterStateHash: string } {
  const previousEvent = index > 0 ? readRecord(events[index - 1]) : null;
  const previousReceipt = index > 0 ? readRecord(receipts[index - 1]) : null;
  const tick = readNumber(eventRecord.tick);
  const latestFrameHash = findLatestTimelineFrameHash(run.timeline, tick);
  const beforeStateHash = hashCanonical({
    schemaVersion: SIGNED_ACTION_SCHEMA_VERSION,
    phase: "before-action",
    runId: run.runId,
    sequence: index + 1,
    previousEventHash: previousEvent ? hashCanonical(previousEvent) : null,
    previousReceiptHash: previousReceipt
      ? hashCanonical(previousReceipt)
      : null,
    previousReceiptId: previousReceipt
      ? readString(previousReceipt.receiptId)
      : null,
    agentId: readString(eventRecord.agentId) ?? null,
    actorId:
      readString(eventRecord.actorIdentityId) ??
      readString(receiptRecord.actorId) ??
      null,
    tick,
  });
  const afterStateHash = hashCanonical({
    schemaVersion: SIGNED_ACTION_SCHEMA_VERSION,
    phase: "after-action",
    runId: run.runId,
    sequence: index + 1,
    eventHash,
    receiptHash,
    receiptPayloadHash,
    latestFrameHash,
    latestReceiptId: readString(receiptRecord.receiptId),
  });

  return { beforeStateHash, afterStateHash };
}

function findLatestTimelineFrameHash(
  timeline: unknown,
  tick: number | null,
): string | null {
  if (!Array.isArray(timeline) || timeline.length === 0) return null;
  const frames = timeline.map(readRecord);
  const matchingFrames =
    tick === null
      ? []
      : frames.filter((frame) => readNumber(frame.tick) === tick);
  const frame =
    matchingFrames[matchingFrames.length - 1] ?? frames[frames.length - 1];
  return hashCanonical(frame);
}

function resolveActionSource(config: unknown): SocietyActionSource {
  const configRecord = readRecord(config);
  const configuredSource = readRecord(configRecord.actionSource);
  const kind = readActionSourceKind(configuredSource.kind);
  if (kind) {
    return {
      kind,
      driver: readString(configuredSource.driver) ?? `${kind}-driver`,
      runtimeSessionId:
        readString(configuredSource.runtimeSessionId) ?? undefined,
      modelId: readString(configuredSource.modelId) ?? undefined,
      note: readString(configuredSource.note) ?? undefined,
    };
  }

  return DEFAULT_SIMULATION_SOURCE;
}

function readActionSourceKind(value: unknown): SocietyActionSourceKind | null {
  return value === "simulation" ||
    value === "pi-agent" ||
    value === "pi-llm" ||
    value === "external"
    ? value
    : null;
}

function findReceiptForEvent(
  receipts: ReadonlyArray<unknown>,
  event: Record<string, unknown>,
  index: number,
) {
  const eventId = readString(event.id);
  if (eventId) {
    const matchedReceipt = receipts.find((receipt) => {
      const receiptRecord = readRecord(receipt);
      const payload = readRecord(receiptRecord.payload);
      return readString(payload.eventId) === eventId;
    });
    if (matchedReceipt) return matchedReceipt;
  }

  return receipts[index] ?? null;
}

function verifySignedAction(action: SocietySignedAction): void {
  const expectedActionHash = hashCanonical({
    schemaVersion: action.schemaVersion,
    sequence: action.sequence,
    runId: action.runId,
    eventId: action.eventId,
    receiptId: action.receiptId,
    agentId: action.agentId,
    actorId: action.actorId,
    action: action.action,
    tick: action.tick,
    source: action.source,
    eventHash: action.eventHash,
    receiptHash: action.receiptHash,
    receiptPayloadHash: action.receiptPayloadHash,
    ...(action.runtimeEvidence
      ? { runtimeEvidence: action.runtimeEvidence }
      : {}),
    beforeStateHash: action.beforeState.stateHash,
    afterStateHash: action.afterState.stateHash,
    actionHash: undefined,
  });
  if (action.actionHash !== expectedActionHash) {
    throw new Error(`Action hash mismatch for ${action.eventId}`);
  }

  const expectedLeafHash = hashCanonical(stripLeafHash(action));
  if (action.leafHash !== expectedLeafHash) {
    throw new Error(`Action leaf hash mismatch for ${action.eventId}`);
  }

  assertSignature(action.signature, `action ${action.eventId}`);
  assertSignature(
    action.beforeState.signature,
    `before state ${action.eventId}`,
  );
  assertSignature(action.afterState.signature, `after state ${action.eventId}`);
}

function verifyChainBoundEnvelopes(
  chain: CommitProofChainEvidence | null,
  transcriptRoot: string,
): number {
  if (!chain || !Array.isArray(chain.committedReceipts)) return 0;
  let checked = 0;

  for (const receipt of chain.committedReceipts.map(readRecord)) {
    const actionProof = readRecord(receipt.actionProof);
    const envelope = readRecord(actionProof.actionEnvelope);
    if (Object.keys(envelope).length === 0) continue;

    const receiptAddress = readString(receipt.address);
    const receiptSignature = readString(receipt.signature);
    if (readString(envelope.receiptAddress) !== receiptAddress) {
      throw new Error("Action envelope receipt address mismatch");
    }
    if (readString(envelope.txSignature) !== receiptSignature) {
      throw new Error("Action envelope tx signature mismatch");
    }
    if (readString(envelope.transcriptRoot) !== transcriptRoot) {
      throw new Error("Action envelope transcript root mismatch");
    }
    if (readString(envelope.leafHash) !== readString(actionProof.leafHash)) {
      throw new Error("Action envelope leaf hash mismatch");
    }
    if (
      readString(envelope.agentSignature) !== readString(actionProof.signature)
    ) {
      throw new Error("Action envelope agent signature mismatch");
    }
    checked += 1;
  }

  return checked;
}

function assertSignature(
  signature: SocietyActionSignature,
  label: string,
): void {
  if (!signature.scheme || !signature.signer || !signature.value) {
    throw new Error(`Missing ${label} signature`);
  }
}

function stripProofHash(
  artifact: CommitProofArtifact,
): Omit<CommitProofArtifact, "proofHash"> {
  const { proofHash: _proofHash, ...body } = artifact;
  return body;
}

function stripLeafHash(
  action: SocietySignedAction,
): Omit<SocietySignedAction, "leafHash"> {
  const { leafHash: _leafHash, ...body } = action;
  return body;
}

function merkleRoot(leafHashes: ReadonlyArray<string>) {
  if (leafHashes.length === 0) {
    return EMPTY_ACTION_TRANSCRIPT_ROOT;
  }

  let layer = leafHashes.map((leafHash) =>
    sha256Buffer(MERKLE_LEAF_PREFIX, Buffer.from(leafHash, "hex")),
  );
  while (layer.length > 1) {
    const nextLayer: Buffer[] = [];
    for (let index = 0; index < layer.length; index += 2) {
      const left = layer[index];
      const right = layer[index + 1] ?? left;
      nextLayer.push(sha256Buffer(MERKLE_NODE_PREFIX, left, right));
    }
    layer = nextLayer;
  }

  return layer[0].toString("hex");
}

function sha256Buffer(...parts: ReadonlyArray<Buffer>) {
  const hash = createHash("sha256");
  for (const part of parts) {
    hash.update(part);
  }
  return hash.digest();
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
