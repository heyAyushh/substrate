import {
  basename,
  extname,
  isAbsolute,
  relative,
  resolve,
  sep,
} from "node:path";
import { createRequire } from "node:module";
import type {
  AgentAttestation,
  AgentProfile,
  AgentTraceExportBundle,
  AttesterRecordView,
  AuthorityRotation,
  DomainSummary,
  HandoffStep,
  IdentityStateView,
  IndexedReceipt,
  LeaderboardEntry,
  LocalDurableIndexer as LocalDurableIndexerInstance,
  StakeStateView,
  ToolQualityStat,
} from "@trust-substrate/indexer";
import {
  DEFAULT_LEADERBOARD_LIMIT,
  DEFAULT_RECEIPT_LIMIT,
  DEFAULT_SNAPSHOT_RELATIVE_PATH,
  HIDDEN_FILE_PREFIX,
  JSON_EXTENSION,
  MAX_LEADERBOARD_LIMIT,
  MAX_RECEIPT_LIMIT,
  PROJECT_ROOT_ENV,
  SNAPSHOT_PATH_ENV,
} from "./constants.js";

const require = createRequire(import.meta.url);
const { LocalDurableIndexer } =
  require("@trust-substrate/indexer") as typeof import("@trust-substrate/indexer");

export interface SnapshotContextInput {
  readonly projectRoot?: string;
  readonly snapshotPath?: string;
}

export interface SnapshotSummaryInput extends SnapshotContextInput {
  readonly domain?: string;
  readonly currentSlot?: number;
  readonly includeTier0?: boolean;
  readonly leaderboardLimit?: number;
}

export interface AgentProfileInput extends SnapshotContextInput {
  readonly agentId: string;
}

export interface TaskTraceInput extends SnapshotContextInput {
  readonly taskId: string;
  readonly offset?: number;
  readonly limit?: number;
}

export interface DomainSummaryInput extends SnapshotContextInput {
  readonly domain?: string;
}

export interface SnapshotSummary {
  readonly snapshotPath: string;
  readonly receiptCount: number;
  readonly taskCount: number;
  readonly agentCount: number;
  readonly latestSlot: number;
  readonly domains: DomainSummary[];
  readonly leaderboard: LeaderboardEntry[];
  readonly stakeStates: StakeStateView[];
  readonly identityStates: IdentityStateView[];
  readonly attesterRecords: AttesterRecordView[];
}

export interface AgentProfileResult {
  readonly snapshotPath: string;
  readonly agent: AgentProfile;
  readonly stake: StakeStateView;
  readonly attestations: AgentAttestation[];
  readonly authorityHistory: AuthorityRotation[];
  readonly toolQuality: ToolQualityStat[];
}

export interface TaskTraceResult {
  readonly snapshotPath: string;
  readonly taskId: string;
  readonly receipts: IndexedReceipt[];
  readonly totalReceipts: number;
  readonly offset: number;
  readonly limit: number;
  readonly hasMore: boolean;
  readonly nextOffset?: number;
  readonly handoffs: HandoffStep[];
  readonly agentTrace: AgentTraceExportBundle;
}

export interface DomainSummaryResult {
  readonly snapshotPath: string;
  readonly domains: DomainSummary[];
}

interface ResolvedSnapshot {
  readonly projectRoot: string;
  readonly snapshotPath: string;
  readonly indexer: LocalDurableIndexerInstance;
}

interface PaginationInput {
  readonly offset?: number;
  readonly limit?: number;
}

interface PaginatedReceipts {
  readonly receipts: IndexedReceipt[];
  readonly totalReceipts: number;
  readonly offset: number;
  readonly limit: number;
  readonly hasMore: boolean;
  readonly nextOffset?: number;
}

export function resolveProjectRoot(projectRoot?: string): string {
  return resolve(projectRoot ?? process.env[PROJECT_ROOT_ENV] ?? process.cwd());
}

export function resolveSnapshotPath(input: SnapshotContextInput = {}): string {
  const projectRoot = resolveProjectRoot(input.projectRoot);
  const requestedPath =
    input.snapshotPath ??
    process.env[SNAPSHOT_PATH_ENV] ??
    DEFAULT_SNAPSHOT_RELATIVE_PATH;
  const snapshotPath = isAbsolute(requestedPath)
    ? resolve(requestedPath)
    : resolve(projectRoot, requestedPath);

  if (!isInsideRoot(projectRoot, snapshotPath)) {
    throw new Error(
      `snapshot path ${snapshotPath} is outside the project root ${projectRoot}`
    );
  }

  if (extname(snapshotPath) !== JSON_EXTENSION) {
    throw new Error("snapshot path must point to a JSON file");
  }

  if (basename(snapshotPath).startsWith(HIDDEN_FILE_PREFIX)) {
    throw new Error("snapshot path must not point to a hidden file");
  }

  return snapshotPath;
}

export function createSnapshotSummary(
  input: SnapshotSummaryInput = {}
): SnapshotSummary {
  const { indexer, snapshotPath } = loadResolvedSnapshot(input);
  const graph = indexer.getExecutionGraph();
  const domains =
    input.domain === undefined
      ? indexer.getDomainSummaries()
      : [indexer.getDomainSummary(input.domain)];
  const leaderboard = indexer
    .getAgentLeaderboard({
      currentSlot: input.currentSlot,
      domain: input.domain,
      tier0: input.includeTier0,
    })
    .slice(
      0,
      clampLimit(
        input.leaderboardLimit,
        DEFAULT_LEADERBOARD_LIMIT,
        MAX_LEADERBOARD_LIMIT
      )
    );

  return {
    snapshotPath,
    receiptCount: graph.receipts.length,
    taskCount: Object.keys(graph.tasks).length,
    agentCount: Object.keys(graph.agents).length,
    latestSlot: getLatestSlot(graph.receipts),
    domains,
    leaderboard,
    stakeStates: indexer.getStakeStates(),
    identityStates: indexer.getIdentityStates(),
    attesterRecords: indexer.getAttesterRecords(),
  };
}

export function createAgentProfile(
  input: AgentProfileInput
): AgentProfileResult {
  const { indexer, snapshotPath } = loadResolvedSnapshot(input);

  return {
    snapshotPath,
    agent: indexer.getAgentProfile(input.agentId),
    stake: indexer.getStakeState(input.agentId),
    attestations: indexer.getAttestations(input.agentId),
    authorityHistory: indexer.getAuthorityHistory(input.agentId),
    toolQuality: indexer.getToolQualityStats(input.agentId),
  };
}

export function createTaskTrace(input: TaskTraceInput): TaskTraceResult {
  const { indexer, snapshotPath } = loadResolvedSnapshot(input);
  const paginated = paginateReceipts(
    indexer.getTaskHistory(input.taskId),
    input
  );

  return {
    snapshotPath,
    taskId: input.taskId,
    ...paginated,
    handoffs: indexer.getHandoffChain(input.taskId),
    agentTrace: indexer.getAgentTraceBundle(input.taskId),
  };
}

export function createDomainSummary(
  input: DomainSummaryInput = {}
): DomainSummaryResult {
  const { indexer, snapshotPath } = loadResolvedSnapshot(input);
  const domains =
    input.domain === undefined
      ? indexer.getDomainSummaries()
      : [indexer.getDomainSummary(input.domain)];

  return {
    snapshotPath,
    domains,
  };
}

function loadResolvedSnapshot(input: SnapshotContextInput): ResolvedSnapshot {
  const projectRoot = resolveProjectRoot(input.projectRoot);
  const snapshotPath = resolveSnapshotPath({ ...input, projectRoot });

  try {
    return {
      projectRoot,
      snapshotPath,
      indexer: LocalDurableIndexer.loadSnapshot(snapshotPath),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `could not load indexer snapshot at ${snapshotPath}: ${message}`
    );
  }
}

function paginateReceipts(
  receipts: IndexedReceipt[],
  input: PaginationInput
): PaginatedReceipts {
  const offset = input.offset ?? 0;
  const limit = clampLimit(
    input.limit,
    DEFAULT_RECEIPT_LIMIT,
    MAX_RECEIPT_LIMIT
  );
  const nextOffset = offset + limit;
  const page = receipts.slice(offset, nextOffset);
  const hasMore = nextOffset < receipts.length;

  return {
    receipts: page,
    totalReceipts: receipts.length,
    offset,
    limit,
    hasMore,
    nextOffset: hasMore ? nextOffset : undefined,
  };
}

function clampLimit(
  requestedLimit: number | undefined,
  defaultLimit: number,
  maxLimit: number
): number {
  if (requestedLimit === undefined) {
    return defaultLimit;
  }
  return Math.min(requestedLimit, maxLimit);
}

function getLatestSlot(receipts: readonly IndexedReceipt[]): number {
  return receipts.reduce(
    (latestSlot, receipt) => Math.max(latestSlot, receipt.slot),
    0
  );
}

function isInsideRoot(projectRoot: string, candidatePath: string): boolean {
  const projectRelativePath = relative(projectRoot, candidatePath);
  return (
    projectRelativePath === "" ||
    (!projectRelativePath.startsWith(`..${sep}`) &&
      projectRelativePath !== ".." &&
      !isAbsolute(projectRelativePath))
  );
}
