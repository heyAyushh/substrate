import { readFileSync, writeFileSync } from "node:fs";
import { compareBySlotThenReceiptId, stableStringify } from "./utils.js";
import {
  type AgentHistoryView,
  type AgentProfile,
  type AgentTraceExportBundle,
  type AgentTraceExportEdit,
  type ChallengeStatus,
  type CommitmentStatus,
  type DomainSummary,
  type ExecutionGraph,
  type HandoffStep,
  type IndexedReceipt,
  type IngestResult,
  type LeaderboardEntry,
  type LeaderboardQuery,
  type LocalReceiptRecord,
  type TaskHistoryView,
  type ToolQualityStat,
} from "./types.js";

const KIND_WEIGHTS: Readonly<Record<string, number>> = {
  assignment: 1,
  handoff: 2,
  completion: 5,
  dispute: -4,
  dispute_resolved: 3,
  challenge: 0,
  challenge_response: 0,
};

const ATTESTATION_KIND = "attestation";
const CHALLENGE_KIND = "challenge";
const CHALLENGE_RESPONSE_KIND = "challenge_response";
const COMMIT_MARKER = "trust-substrate.commit";
const REVEAL_MARKER = "trust-substrate.reveal";

const SNAPSHOT_VERSION = 1 as const;

interface StoredReceipt {
  receipt: IndexedReceipt;
  canonical: string;
}

export interface IndexerSnapshot {
  readonly version: typeof SNAPSHOT_VERSION;
  readonly receipts: ReadonlyArray<IndexedReceipt>;
}

const createDedupeKey = (receipt: LocalReceiptRecord): string =>
  `${receipt.receiptId}:${receipt.slot}`;

const isHandoff = (receipt: LocalReceiptRecord): boolean =>
  receipt.kind === "handoff";

const getHandoffTarget = (receipt: LocalReceiptRecord): string | undefined => {
  const target = receipt.payload.toAgentId;
  return typeof target === "string" && target.length > 0 ? target : undefined;
};

const cloneReceipt = (
  receipt: LocalReceiptRecord,
  sequence: number
): IndexedReceipt => ({
  receiptId: receipt.receiptId,
  slot: receipt.slot,
  taskId: receipt.taskId,
  actorId: receipt.actorId,
  kind: receipt.kind,
  domain: receipt.domain,
  payload: { ...receipt.payload },
  sequence,
  dedupeKey: createDedupeKey(receipt),
});

const dedupeStrings = (values: string[]): string[] =>
  [...new Set(values)].sort();

const asString = (value: unknown): string | undefined =>
  typeof value === "string" && value.length > 0 ? value : undefined;

const isFileEditReceipt = (receipt: LocalReceiptRecord): boolean => {
  if (receipt.kind === "file_edit") {
    return true;
  }
  const stepKind = receipt.payload.stepKind;
  if (stepKind === "file_edit") {
    return true;
  }
  return (
    typeof receipt.payload.path === "string" ||
    typeof receipt.payload.file === "string"
  );
};

const isCommitReceipt = (receipt: LocalReceiptRecord): boolean =>
  receipt.payload.type === COMMIT_MARKER ||
  receipt.payload.commitMarker === true;

const isRevealReceipt = (receipt: LocalReceiptRecord): boolean =>
  receipt.payload.type === REVEAL_MARKER ||
  receipt.payload.revealMarker === true;

const asNumber = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;

export class LocalDurableIndexer {
  private readonly receiptsByKey = new Map<string, StoredReceipt>();

  snapshot(): IndexerSnapshot {
    return {
      version: SNAPSHOT_VERSION,
      receipts: this.sortedReceipts().map((receipt) => ({
        ...receipt,
        payload: { ...receipt.payload },
      })),
    };
  }

  saveSnapshot(path: string): void {
    writeFileSync(path, JSON.stringify(this.snapshot()), "utf8");
  }

  static fromSnapshot(snapshot: IndexerSnapshot): LocalDurableIndexer {
    if (snapshot.version !== SNAPSHOT_VERSION) {
      throw new Error(`unsupported snapshot version ${snapshot.version}`);
    }

    const indexer = new LocalDurableIndexer();
    for (const indexed of snapshot.receipts) {
      const record: LocalReceiptRecord = {
        receiptId: indexed.receiptId,
        slot: indexed.slot,
        taskId: indexed.taskId,
        actorId: indexed.actorId,
        kind: indexed.kind,
        domain: indexed.domain,
        payload: { ...indexed.payload },
      };
      indexer.ingest([record]);
    }
    return indexer;
  }

  static loadSnapshot(path: string): LocalDurableIndexer {
    const raw = readFileSync(path, "utf8");
    const parsed = JSON.parse(raw) as IndexerSnapshot;
    return LocalDurableIndexer.fromSnapshot(parsed);
  }

  ingest(receipts: readonly LocalReceiptRecord[]): IngestResult {
    let accepted = 0;
    let duplicates = 0;

    for (const receipt of receipts) {
      const dedupeKey = createDedupeKey(receipt);
      const canonical = stableStringify({
        receiptId: receipt.receiptId,
        slot: receipt.slot,
        taskId: receipt.taskId,
        actorId: receipt.actorId,
        kind: receipt.kind,
        domain: receipt.domain,
        payload: receipt.payload,
      });
      const existing = this.receiptsByKey.get(dedupeKey);

      if (existing) {
        if (existing.canonical !== canonical) {
          throw new Error(`duplicate receipt conflict for ${dedupeKey}`);
        }

        duplicates += 1;
        continue;
      }

      this.receiptsByKey.set(dedupeKey, {
        receipt: cloneReceipt(receipt, this.receiptsByKey.size),
        canonical,
      });
      accepted += 1;
    }

    return { accepted, duplicates };
  }

  getTaskHistory(taskId: string): IndexedReceipt[] {
    return this.sortedReceipts().filter((receipt) => receipt.taskId === taskId);
  }

  getAgentHistory(agentId: string): IndexedReceipt[] {
    return this.sortedReceipts().filter(
      (receipt) => receipt.actorId === agentId
    );
  }

  getHandoffChain(taskId: string): HandoffStep[] {
    return this.sortedReceipts()
      .filter((receipt) => receipt.taskId === taskId && isHandoff(receipt))
      .map((receipt) => {
        const toAgentId = getHandoffTarget(receipt);
        if (!toAgentId) {
          throw new Error(
            `handoff receipt ${receipt.receiptId} is missing toAgentId`
          );
        }

        return {
          receiptId: receipt.receiptId,
          slot: receipt.slot,
          taskId: receipt.taskId,
          fromAgentId: receipt.actorId,
          toAgentId,
        };
      });
  }

  getDomainSummary(domain: string): DomainSummary {
    const summaries = this.getDomainSummaries().filter(
      (summary) => summary.domain === domain
    );
    if (summaries.length === 0) {
      return {
        domain,
        receiptCount: 0,
        taskIds: [],
        agentIds: [],
        handoffCount: 0,
        latestSlot: 0,
      };
    }

    return summaries[0];
  }

  getDomainSummaries(): DomainSummary[] {
    const summaries = new Map<string, DomainSummary>();

    for (const receipt of this.sortedReceipts()) {
      const existing = summaries.get(receipt.domain);
      if (!existing) {
        summaries.set(receipt.domain, {
          domain: receipt.domain,
          receiptCount: 1,
          taskIds: [receipt.taskId],
          agentIds: [receipt.actorId],
          handoffCount: isHandoff(receipt) ? 1 : 0,
          latestSlot: receipt.slot,
        });
        continue;
      }

      existing.receiptCount += 1;
      if (!existing.taskIds.includes(receipt.taskId)) {
        existing.taskIds.push(receipt.taskId);
      }
      if (!existing.agentIds.includes(receipt.actorId)) {
        existing.agentIds.push(receipt.actorId);
      }
      if (isHandoff(receipt)) {
        existing.handoffCount += 1;
      }
      existing.latestSlot = receipt.slot;
    }

    return [...summaries.values()]
      .map((summary) => ({
        ...summary,
        taskIds: summary.taskIds.sort(),
        agentIds: summary.agentIds.sort(),
      }))
      .sort((left, right) => left.domain.localeCompare(right.domain));
  }

  getExecutionGraph(): ExecutionGraph {
    const receipts = this.sortedReceipts();
    const tasks = new Map<string, TaskHistoryView>();
    const agents = new Map<string, AgentHistoryView>();
    const handoffChainByTask = new Map<string, HandoffStep[]>();

    for (const receipt of receipts) {
      const taskView = tasks.get(receipt.taskId) ?? {
        taskId: receipt.taskId,
        receipts: [],
        agents: [],
        agentIds: [],
        domains: [],
      };
      taskView.receipts.push(receipt);
      if (!taskView.agents.includes(receipt.actorId)) {
        taskView.agents.push(receipt.actorId);
      }
      if (!taskView.agentIds.includes(receipt.actorId)) {
        taskView.agentIds.push(receipt.actorId);
      }
      if (!taskView.domains.includes(receipt.domain)) {
        taskView.domains.push(receipt.domain);
      }
      tasks.set(receipt.taskId, taskView);

      const agentView = agents.get(receipt.actorId) ?? {
        agentId: receipt.actorId,
        receipts: [],
        taskIds: [],
        domains: [],
      };
      agentView.receipts.push(receipt);
      if (!agentView.taskIds.includes(receipt.taskId)) {
        agentView.taskIds.push(receipt.taskId);
      }
      if (!agentView.domains.includes(receipt.domain)) {
        agentView.domains.push(receipt.domain);
      }
      agents.set(receipt.actorId, agentView);

      if (isHandoff(receipt)) {
        const toAgentId = getHandoffTarget(receipt);
        if (!toAgentId) {
          throw new Error(
            `handoff receipt ${receipt.receiptId} is missing toAgentId`
          );
        }

        const handoffChain = handoffChainByTask.get(receipt.taskId) ?? [];
        handoffChain.push({
          receiptId: receipt.receiptId,
          slot: receipt.slot,
          taskId: receipt.taskId,
          fromAgentId: receipt.actorId,
          toAgentId,
        });
        handoffChainByTask.set(receipt.taskId, handoffChain);
      }
    }

    return {
      receipts,
      tasks: Object.fromEntries(
        [...tasks.values()]
          .map((task) => ({
            ...task,
            agents: dedupeStrings(task.agents),
            agentIds: task.agentIds.sort(),
            domains: task.domains.sort(),
            receipts: [...task.receipts],
          }))
          .sort((left, right) => left.taskId.localeCompare(right.taskId))
          .map((task) => [task.taskId, task])
      ),
      agents: Object.fromEntries(
        [...agents.values()]
          .map((agent) => ({
            ...agent,
            taskIds: agent.taskIds.sort(),
            domains: agent.domains.sort(),
            receipts: [...agent.receipts],
          }))
          .sort((left, right) => left.agentId.localeCompare(right.agentId))
          .map((agent) => [agent.agentId, agent])
      ),
      handoffChainByTask: Object.fromEntries(
        [...handoffChainByTask.entries()]
          .sort(([leftTaskId], [rightTaskId]) =>
            leftTaskId.localeCompare(rightTaskId)
          )
          .map(([taskId, chain]) => [
            taskId,
            [...chain].sort(compareBySlotThenReceiptId),
          ])
      ),
      domains: Object.fromEntries(
        this.getDomainSummaries().map((summary) => [summary.domain, summary])
      ),
    };
  }

  getAgentProfile(agentId: string): AgentProfile {
    const receipts = this.sortedReceipts().filter(
      (receipt) => receipt.actorId === agentId
    );

    const profile: AgentProfile = {
      agentId,
      receiptCount: receipts.length,
      domains: {},
      kinds: {},
      modelUsage: {},
      toolUsage: {},
      handoffPartners: [],
      firstSlot: 0,
      latestSlot: 0,
    };

    if (receipts.length === 0) {
      return profile;
    }

    const partners = new Set<string>();
    profile.firstSlot = receipts[0].slot;
    profile.latestSlot = receipts[receipts.length - 1].slot;

    for (const receipt of receipts) {
      profile.domains[receipt.domain] =
        (profile.domains[receipt.domain] ?? 0) + 1;
      profile.kinds[receipt.kind] = (profile.kinds[receipt.kind] ?? 0) + 1;

      const model = asString(receipt.payload.model);
      if (model) {
        profile.modelUsage[model] = (profile.modelUsage[model] ?? 0) + 1;
      }

      const tool = asString(receipt.payload.tool);
      if (tool) {
        profile.toolUsage[tool] = (profile.toolUsage[tool] ?? 0) + 1;
      }

      if (isHandoff(receipt)) {
        const target = getHandoffTarget(receipt);
        if (target) {
          partners.add(target);
        }
      }
    }

    profile.handoffPartners = [...partners].sort();
    return profile;
  }

  getAgentLeaderboard(query: LeaderboardQuery = {}): LeaderboardEntry[] {
    const attestations = this.collectAttestationCounts();
    const expiredCommitments =
      query.currentSlot === undefined
        ? new Set<string>()
        : new Set(
            this.getExpiredCommitments(query.currentSlot).map(
              (commitment) => commitment.commitReceiptId
            )
          );
    const scores = new Map<string, LeaderboardEntry>();

    for (const receipt of this.sortedReceipts()) {
      if (query.domain !== undefined && receipt.domain !== query.domain) {
        continue;
      }
      if (query.since !== undefined && receipt.slot < query.since) {
        continue;
      }
      if (query.until !== undefined && receipt.slot > query.until) {
        continue;
      }
      if (receipt.kind === ATTESTATION_KIND) {
        continue;
      }

      const weight = KIND_WEIGHTS[receipt.kind] ?? 0;
      const existing = scores.get(receipt.actorId) ?? {
        agentId: receipt.actorId,
        score: 0,
        receiptCount: 0,
        domain: query.domain,
        attestations: attestations.get(receipt.actorId) ?? 0,
      };
      existing.score += weight;
      if (expiredCommitments.has(receipt.receiptId)) {
        existing.score += KIND_WEIGHTS.dispute;
      }
      existing.receiptCount += 1;
      scores.set(receipt.actorId, existing);
    }

    let entries = [...scores.values()];
    if (query.attestedOnly) {
      entries = entries.filter((entry) => entry.attestations > 0);
    }
    return entries.sort((left, right) => right.score - left.score);
  }

  getToolQualityStats(agentId: string): ToolQualityStat[] {
    const stats = new Map<string, ToolQualityStat>();

    for (const receipt of this.sortedReceipts()) {
      if (receipt.actorId !== agentId) {
        continue;
      }

      const tool = asString(receipt.payload.tool);
      if (!tool) {
        continue;
      }

      const stat = stats.get(tool) ?? {
        tool,
        attempts: 0,
        completions: 0,
        disputes: 0,
        successRate: 0,
      };
      stat.attempts += 1;
      if (receipt.kind === "completion") {
        stat.completions += 1;
      }
      if (receipt.kind === "dispute" || receipt.kind === "dispute_resolved") {
        stat.disputes += 1;
      }
      stats.set(tool, stat);
    }

    const results = [...stats.values()];
    for (const stat of results) {
      stat.successRate =
        stat.attempts === 0 ? 0 : stat.completions / stat.attempts;
    }
    return results.sort((left, right) => left.tool.localeCompare(right.tool));
  }

  getAgentTraceBundle(taskId: string): AgentTraceExportBundle {
    const receipts = this.getTaskHistory(taskId);
    const agentIds = new Set<string>();
    const edits: AgentTraceExportEdit[] = [];

    for (const receipt of receipts) {
      agentIds.add(receipt.actorId);
      if (!isFileEditReceipt(receipt)) {
        continue;
      }

      edits.push({
        receiptId: receipt.receiptId,
        seq: receipt.sequence,
        path:
          asString(receipt.payload.path) ??
          asString(receipt.payload.file) ??
          "",
        slot: receipt.slot,
        actorId: receipt.actorId,
        beforeHash: asString(receipt.payload.beforeHash),
        afterHash: asString(receipt.payload.afterHash),
        diff: asString(receipt.payload.diff),
      });
    }

    return {
      version: "0.1.0",
      traceId: taskId,
      taskId,
      agentIds: [...agentIds].sort(),
      edits,
    };
  }

  getCommitmentStatuses(currentSlot?: number): CommitmentStatus[] {
    const reveals = new Map<string, IndexedReceipt>();
    for (const receipt of this.sortedReceipts()) {
      if (!isRevealReceipt(receipt)) {
        continue;
      }
      const commitReceiptId = asString(receipt.payload.commitReceiptId);
      if (commitReceiptId) {
        reveals.set(commitReceiptId, receipt);
      }
    }

    return this.sortedReceipts()
      .filter(isCommitReceipt)
      .map((receipt) => {
        const reveal = reveals.get(receipt.receiptId);
        const deadlineSlot = asNumber(receipt.payload.revealDeadlineSlot);
        const commitHash = asString(receipt.payload.commitHash);
        return {
          commitReceiptId: receipt.receiptId,
          actorId: receipt.actorId,
          taskId: receipt.taskId,
          domain: receipt.domain,
          commitHash: commitHash ?? "",
          deadlineSlot,
          revealed: reveal !== undefined,
          revealReceiptId: reveal?.receiptId,
          expired:
            reveal === undefined &&
            deadlineSlot !== undefined &&
            currentSlot !== undefined &&
            currentSlot > deadlineSlot,
        };
      });
  }

  getExpiredCommitments(currentSlot: number): CommitmentStatus[] {
    return this.getCommitmentStatuses(currentSlot).filter(
      (commitment) => commitment.expired
    );
  }

  getChallengeStatuses(currentSlot?: number): ChallengeStatus[] {
    const responses = new Map<string, IndexedReceipt>();
    for (const receipt of this.sortedReceipts()) {
      if (receipt.kind !== CHALLENGE_RESPONSE_KIND) {
        continue;
      }
      const challengeReceiptId = asString(receipt.payload.challengeReceiptId);
      if (challengeReceiptId) {
        responses.set(challengeReceiptId, receipt);
      }
    }

    return this.sortedReceipts()
      .filter((receipt) => receipt.kind === CHALLENGE_KIND)
      .map((receipt) => {
        const response = responses.get(receipt.receiptId);
        const deadlineSlot = asNumber(receipt.payload.deadlineSlot);
        const targetReceiptId = asString(receipt.payload.challengeTarget);
        return {
          challengeReceiptId: receipt.receiptId,
          actorId: receipt.actorId,
          taskId: receipt.taskId,
          domain: receipt.domain,
          targetReceiptId: targetReceiptId ?? "",
          deadlineSlot,
          answered: response !== undefined,
          responseReceiptId: response?.receiptId,
          expired:
            response === undefined &&
            deadlineSlot !== undefined &&
            currentSlot !== undefined &&
            currentSlot > deadlineSlot,
        };
      });
  }

  getUnansweredChallenges(currentSlot: number): ChallengeStatus[] {
    return this.getChallengeStatuses(currentSlot).filter(
      (challenge) => challenge.expired
    );
  }

  isChallengeUnansweredAfter(
    challengeReceiptId: string,
    currentSlot: number
  ): boolean {
    const challenge = this.getChallengeStatuses(currentSlot).find(
      (candidate) => candidate.challengeReceiptId === challengeReceiptId
    );
    return challenge?.expired ?? false;
  }

  private collectAttestationCounts(): Map<string, number> {
    const counts = new Map<string, number>();
    for (const receipt of this.sortedReceipts()) {
      if (receipt.kind !== ATTESTATION_KIND) {
        continue;
      }
      const target = asString(receipt.payload.target);
      if (!target) {
        continue;
      }
      counts.set(target, (counts.get(target) ?? 0) + 1);
    }
    return counts;
  }

  private sortedReceipts(): IndexedReceipt[] {
    return [...this.receiptsByKey.values()]
      .map(({ receipt }) => receipt)
      .sort(compareBySlotThenReceiptId);
  }
}
