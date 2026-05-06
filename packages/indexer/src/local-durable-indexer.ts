import { readFileSync, writeFileSync } from "node:fs";
import { compareBySlotThenReceiptId, stableStringify } from "./utils.js";
import {
  type AgentHistoryView,
  type AgentAttestation,
  type AgentProfile,
  type AgentTraceExportBundle,
  type AgentTraceExportEdit,
  type AttesterRecordView,
  type AuthorityRotationEvent,
  type AuthorityRotation,
  type ChallengeRoundView,
  type ChallengeStatus,
  type CommitmentStatus,
  type DomainSummary,
  type ExecutionGraph,
  type HandoffStep,
  type IdentityStateView,
  type IndexedReceipt,
  type IngestResult,
  type LeaderboardEntry,
  type LeaderboardQuery,
  type LocalReceiptRecord,
  type StakeStateView,
  type TaskInheritanceView,
  type TaskHistoryView,
  type TeamDefinition,
  type TeamReputationView,
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
const STAKE_EVENT_MARKER = "trust-substrate.stake_event";

const SNAPSHOT_VERSION = 2 as const;

interface StoredAuthorityRotation {
  event: AuthorityRotationEvent;
  canonical: string;
}

interface StoredReceipt {
  receipt: IndexedReceipt;
  canonical: string;
}

interface StoredIdentityState {
  state: IdentityStateView;
  canonical: string;
}

interface StoredAttesterRecord {
  record: AttesterRecordView;
  canonical: string;
}

export interface IndexerSnapshot {
  readonly version: typeof SNAPSHOT_VERSION;
  readonly receipts: ReadonlyArray<IndexedReceipt>;
  readonly authorityRotations?: ReadonlyArray<AuthorityRotationEvent>;
  readonly identityStates?: ReadonlyArray<IdentityStateView>;
  readonly attesterRecords?: ReadonlyArray<AttesterRecordView>;
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
  sequence: number,
): IndexedReceipt =>
  ({
    receiptId: receipt.receiptId,
    slot: receipt.slot,
    taskId: receipt.taskId,
    actorId: receipt.actorId,
    kind: receipt.kind,
    domain: receipt.domain,
    ...(getReceiptRound(receipt) !== undefined
      ? { round: getReceiptRound(receipt) }
      : {}),
    payload: { ...receipt.payload },
    sequence: receipt.sequence ?? sequence,
    dedupeKey: createDedupeKey(receipt),
  }) as IndexedReceipt;

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

const getReceiptRound = (
  receipt: LocalReceiptRecord | IndexedReceipt,
): number | undefined =>
  asNumber((receipt as LocalReceiptRecord & { round?: unknown }).round) ??
  asNumber(receipt.payload.round) ??
  undefined;

const getChallengeRound = (receipt: LocalReceiptRecord): number =>
  getReceiptRound(receipt) ?? 0;

const cloneAuthorityRotation = (
  event: AuthorityRotationEvent,
): AuthorityRotationEvent => ({
  eventId: event.eventId,
  slot: event.slot,
  agentId: event.agentId,
  previousAuthority: event.previousAuthority,
  newAuthority: event.newAuthority,
  mode: event.mode,
  sequence: event.sequence,
});

const cloneIdentityState = (state: IdentityStateView): IdentityStateView => ({
  identityId: state.identityId,
  tier: state.tier,
  openTaskCount: state.openTaskCount,
  openChallengeCount: state.openChallengeCount,
  activeStake: state.activeStake,
});

const cloneAttesterRecord = (
  record: AttesterRecordView,
): AttesterRecordView => ({
  identityId: record.identityId,
  category: record.category,
  selfDeclaredTier: record.selfDeclaredTier,
  effectiveTier: record.effectiveTier,
});

type StakeEventKind =
  | "initialized"
  | "deposited"
  | "unstake_requested"
  | "unstake_finalized"
  | "slashed";

interface ParsedStakeEvent {
  readonly kind: StakeEventKind;
  readonly identityId: string;
  readonly ownerId?: string;
  readonly slashAuthorityId?: string;
  readonly amountLamports?: bigint;
  readonly unlocksAtSlot?: number;
  readonly disputeReceiptId?: string;
}

interface MutableStakeState {
  identityId: string;
  ownerId?: string;
  slashAuthorityId?: string;
  activeLamports: bigint;
  pendingUnstakeLamports: bigint;
  unstakeUnlocksAtSlot?: number;
  slashedLamports: bigint;
  slashReceiptIds: string[];
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isStakeEventKind = (value: unknown): value is StakeEventKind =>
  value === "initialized" ||
  value === "deposited" ||
  value === "unstake_requested" ||
  value === "unstake_finalized" ||
  value === "slashed";

const parsePositiveLamports = (value: unknown): bigint | undefined => {
  if (typeof value === "bigint") {
    return value > 0n ? value : undefined;
  }
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value > 0 ? BigInt(value) : undefined;
  }
  if (typeof value === "string" && /^[0-9]+$/.test(value)) {
    const parsed = BigInt(value);
    return parsed > 0n ? parsed : undefined;
  }
  return undefined;
};

const parseStakePayloadEvent = (
  value: unknown,
): ParsedStakeEvent | undefined => {
  if (!isObject(value) || value.type !== STAKE_EVENT_MARKER) {
    return undefined;
  }

  const kind = value.kind;
  const identityId = asString(value.identityId);
  if (!isStakeEventKind(kind) || !identityId) {
    return undefined;
  }

  return {
    kind,
    identityId,
    ownerId: asString(value.ownerId),
    slashAuthorityId: asString(value.slashAuthorityId),
    amountLamports: parsePositiveLamports(value.amountLamports),
    unlocksAtSlot: asNumber(value.unlocksAtSlot),
    disputeReceiptId: asString(value.disputeReceiptId),
  };
};

const parseStakeEvents = (receipt: IndexedReceipt): ParsedStakeEvent[] => {
  const events: ParsedStakeEvent[] = [];
  const payloadEvents = receipt.payload.stakeEvents;

  if (Array.isArray(payloadEvents)) {
    for (const payloadEvent of payloadEvents) {
      const parsed = parseStakePayloadEvent(payloadEvent);
      if (parsed) {
        events.push(parsed);
      }
    }
  }

  if (
    receipt.kind === "dispute_resolved" &&
    isObject(receipt.payload.resolution)
  ) {
    const resolution = receipt.payload.resolution;
    const identityId = asString(resolution.slashedAgentId);
    const amountLamports = parsePositiveLamports(
      resolution.slashAmountLamports ?? resolution.slashAmount,
    );
    if (identityId && amountLamports !== undefined) {
      events.push({
        kind: "slashed",
        identityId,
        amountLamports,
        disputeReceiptId: receipt.receiptId,
      });
    }
  }

  return events;
};

const createEmptyStakeState = (identityId: string): MutableStakeState => ({
  identityId,
  activeLamports: 0n,
  pendingUnstakeLamports: 0n,
  slashedLamports: 0n,
  slashReceiptIds: [],
});

const subtractStakeLamports = (
  current: bigint,
  amount: bigint,
  receiptId: string,
): bigint => {
  if (amount > current) {
    throw new Error(`stake underflow while projecting receipt ${receiptId}`);
  }
  return current - amount;
};

const applyStakeEvent = (
  state: MutableStakeState,
  event: ParsedStakeEvent,
  receiptId: string,
): void => {
  switch (event.kind) {
    case "initialized":
      state.ownerId = event.ownerId ?? state.ownerId;
      state.slashAuthorityId = event.slashAuthorityId ?? state.slashAuthorityId;
      break;
    case "deposited":
      if (event.amountLamports !== undefined) {
        state.activeLamports += event.amountLamports;
      }
      break;
    case "unstake_requested":
      if (event.amountLamports !== undefined) {
        state.pendingUnstakeLamports = event.amountLamports;
        state.unstakeUnlocksAtSlot = event.unlocksAtSlot;
      }
      break;
    case "unstake_finalized":
      if (event.amountLamports !== undefined) {
        state.activeLamports = subtractStakeLamports(
          state.activeLamports,
          event.amountLamports,
          receiptId,
        );
        state.pendingUnstakeLamports = subtractStakeLamports(
          state.pendingUnstakeLamports,
          event.amountLamports,
          receiptId,
        );
        if (state.pendingUnstakeLamports === 0n) {
          state.unstakeUnlocksAtSlot = undefined;
        }
      }
      break;
    case "slashed":
      if (event.amountLamports !== undefined) {
        state.activeLamports = subtractStakeLamports(
          state.activeLamports,
          event.amountLamports,
          receiptId,
        );
        state.slashedLamports += event.amountLamports;
        state.slashReceiptIds.push(event.disputeReceiptId ?? receiptId);
      }
      break;
  }
};

const freezeStakeState = (state: MutableStakeState): StakeStateView => ({
  identityId: state.identityId,
  ownerId: state.ownerId,
  slashAuthorityId: state.slashAuthorityId,
  activeLamports: state.activeLamports.toString(),
  pendingUnstakeLamports: state.pendingUnstakeLamports.toString(),
  unstakeUnlocksAtSlot: state.unstakeUnlocksAtSlot,
  slashedLamports: state.slashedLamports.toString(),
  slashReceiptIds: [...new Set(state.slashReceiptIds)].sort(),
});

export class LocalDurableIndexer {
  private readonly receiptsByKey = new Map<string, StoredReceipt>();
  private readonly authorityRotationsByKey = new Map<
    string,
    StoredAuthorityRotation
  >();
  private readonly identityStatesById = new Map<string, StoredIdentityState>();
  private readonly attesterRecordsByIdentity = new Map<
    string,
    StoredAttesterRecord
  >();

  snapshot(): IndexerSnapshot {
    return {
      version: SNAPSHOT_VERSION,
      receipts: this.sortedReceipts().map((receipt) => ({
        ...receipt,
        payload: { ...receipt.payload },
      })),
      authorityRotations: this.sortedAuthorityRotations().map((event) =>
        cloneAuthorityRotation(event),
      ),
      identityStates: this.getIdentityStates().map((state) =>
        cloneIdentityState(state),
      ),
      attesterRecords: this.getAttesterRecords().map((record) =>
        cloneAttesterRecord(record),
      ),
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
        ...(getReceiptRound(indexed) !== undefined
          ? { round: getReceiptRound(indexed) }
          : {}),
        payload: { ...indexed.payload },
      } as LocalReceiptRecord;
      indexer.ingest([record]);
    }
    if (snapshot.authorityRotations) {
      indexer.ingestAuthorityRotations(snapshot.authorityRotations);
    }
    if (snapshot.identityStates) {
      indexer.ingestIdentityStates(snapshot.identityStates);
    }
    if (snapshot.attesterRecords) {
      indexer.ingestAttesterRecords(snapshot.attesterRecords);
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
        sequence: receipt.sequence ?? null,
        round: getReceiptRound(receipt),
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

  ingestAuthorityRotations(
    authorityRotations: readonly AuthorityRotationEvent[],
  ): IngestResult {
    let accepted = 0;
    let duplicates = 0;

    for (const event of authorityRotations) {
      const dedupeKey = `${event.eventId}:${event.slot}`;
      const canonical = stableStringify(event);
      const existing = this.authorityRotationsByKey.get(dedupeKey);

      if (existing) {
        if (existing.canonical !== canonical) {
          throw new Error(
            `duplicate authority rotation conflict for ${dedupeKey}`,
          );
        }

        duplicates += 1;
        continue;
      }

      this.authorityRotationsByKey.set(dedupeKey, {
        event: cloneAuthorityRotation(event),
        canonical,
      });
      accepted += 1;
    }

    return { accepted, duplicates };
  }

  ingestIdentityStates(
    identityStates: readonly IdentityStateView[],
  ): IngestResult {
    let accepted = 0;
    let duplicates = 0;

    for (const state of identityStates) {
      const canonical = stableStringify(state);
      const existing = this.identityStatesById.get(state.identityId);
      if (existing?.canonical === canonical) {
        duplicates += 1;
        continue;
      }

      this.identityStatesById.set(state.identityId, {
        state: cloneIdentityState(state),
        canonical,
      });
      accepted += 1;
    }

    return { accepted, duplicates };
  }

  ingestAttesterRecords(
    attesterRecords: readonly AttesterRecordView[],
  ): IngestResult {
    let accepted = 0;
    let duplicates = 0;

    for (const record of attesterRecords) {
      const canonical = stableStringify(record);
      const existing = this.attesterRecordsByIdentity.get(record.identityId);
      if (existing?.canonical === canonical) {
        duplicates += 1;
        continue;
      }

      this.attesterRecordsByIdentity.set(record.identityId, {
        record: cloneAttesterRecord(record),
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
      (receipt) => receipt.actorId === agentId,
    );
  }

  getHandoffChain(taskId: string): HandoffStep[] {
    return this.sortedReceipts()
      .filter((receipt) => receipt.taskId === taskId && isHandoff(receipt))
      .map((receipt) => {
        const toAgentId = getHandoffTarget(receipt);
        if (!toAgentId) {
          throw new Error(
            `handoff receipt ${receipt.receiptId} is missing toAgentId`,
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
      (summary) => summary.domain === domain,
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
            `handoff receipt ${receipt.receiptId} is missing toAgentId`,
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
          .map((task) => [task.taskId, task]),
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
          .map((agent) => [agent.agentId, agent]),
      ),
      handoffChainByTask: Object.fromEntries(
        [...handoffChainByTask.entries()]
          .sort(([leftTaskId], [rightTaskId]) =>
            leftTaskId.localeCompare(rightTaskId),
          )
          .map(([taskId, chain]) => [
            taskId,
            [...chain].sort(compareBySlotThenReceiptId),
          ]),
      ),
      domains: Object.fromEntries(
        this.getDomainSummaries().map((summary) => [summary.domain, summary]),
      ),
    };
  }

  getTaskInheritance(taskId: string): TaskInheritanceView {
    const taskReceipts = this.getTaskHistory(taskId);
    const handoffChain = this.getHandoffChain(taskId);
    const parentByAgent = new Map<string, string>();
    const allAgents = new Set<string>();

    for (const receipt of taskReceipts) {
      allAgents.add(receipt.actorId);
    }

    for (const handoff of handoffChain) {
      allAgents.add(handoff.fromAgentId);
      allAgents.add(handoff.toAgentId);
      const existingParent = parentByAgent.get(handoff.toAgentId);
      if (
        existingParent !== undefined &&
        existingParent !== handoff.fromAgentId
      ) {
        throw new Error(
          `conflicting inheritance path for ${handoff.toAgentId} on task ${taskId}`
        );
      }
      parentByAgent.set(handoff.toAgentId, handoff.fromAgentId);
    }

    const lineageByAgent: Record<string, string[]> = {};
    const depthByAgent: Record<string, number> = {};

    const buildLineage = (agentId: string): string[] => {
      const cached = lineageByAgent[agentId];
      if (cached) {
        return cached;
      }

      const parentId = parentByAgent.get(agentId);
      const lineage =
        parentId === undefined
          ? [agentId]
          : [...buildLineage(parentId), agentId];
      lineageByAgent[agentId] = lineage;
      depthByAgent[agentId] = Math.max(0, lineage.length - 1);
      return lineage;
    };

    for (const agentId of allAgents) {
      buildLineage(agentId);
    }

    const completionLineageByReceipt: Record<string, string[]> = {};
    for (const receipt of taskReceipts) {
      if (receipt.kind === "completion") {
        completionLineageByReceipt[receipt.receiptId] = [
          ...buildLineage(receipt.actorId),
        ];
      }
    }

    return {
      taskId,
      rootAgentIds: [...allAgents]
        .filter((agentId) => !parentByAgent.has(agentId))
        .sort(),
      lineageByAgent,
      depthByAgent,
      completionLineageByReceipt,
    };
  }

  getAgentProfile(agentId: string): AgentProfile {
    const receipts = this.sortedReceipts().filter(
      (receipt) => receipt.actorId === agentId,
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
    const identityStates = new Map(
      this.getIdentityStates().map(
        (state) => [state.identityId, state] as const,
      ),
    );
    const stakeStates = new Map(
      this.getStakeStates().map((state) => [state.identityId, state] as const),
    );
    const expiredCommitments =
      query.currentSlot === undefined
        ? new Set<string>()
        : new Set(
            this.getExpiredCommitments(query.currentSlot).map(
              (commitment) => commitment.commitReceiptId,
            ),
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

      const activeLamports = BigInt(
        stakeStates.get(receipt.actorId)?.activeLamports ?? "0",
      );
      const tier =
        identityStates.get(receipt.actorId)?.tier ??
        (activeLamports > 0n ? "bonded" : "tier0");
      if (!query.tier0 && tier === "tier0") {
        continue;
      }

      const weight = KIND_WEIGHTS[receipt.kind] ?? 0;
      const existing = scores.get(receipt.actorId) ?? {
        agentId: receipt.actorId,
        score: 0,
        receiptCount: 0,
        domain: query.domain,
        attestations: attestations.get(receipt.actorId) ?? 0,
        tier,
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

  getTeamReputation(team: TeamDefinition): TeamReputationView {
    const memberIds = dedupeStrings([...team.memberIds]);
    const memberSet = new Set(memberIds);
    const receipts = this.sortedReceipts().filter(
      (receipt) =>
        memberSet.has(receipt.actorId) &&
        receipt.kind !== ATTESTATION_KIND &&
        receipt.kind in KIND_WEIGHTS
    );
    const byKind: Record<string, number> = {};
    const domains: Record<string, number> = {};
    const contributedTaskIds = new Set<string>();
    const inheritedTaskIds = new Set<string>();
    let overall = 0;
    let internalHandoffs = 0;
    let inboundHandoffs = 0;
    let outboundHandoffs = 0;

    for (const receipt of receipts) {
      const weight = KIND_WEIGHTS[receipt.kind] ?? 0;
      overall += weight;
      byKind[receipt.kind] = (byKind[receipt.kind] ?? 0) + 1;
      domains[receipt.domain] = (domains[receipt.domain] ?? 0) + weight;
      contributedTaskIds.add(receipt.taskId);
    }

    for (const receipt of this.sortedReceipts()) {
      if (!isHandoff(receipt)) {
        continue;
      }
      const toAgentId = getHandoffTarget(receipt);
      if (!toAgentId) {
        continue;
      }
      const fromInside = memberSet.has(receipt.actorId);
      const toInside = memberSet.has(toAgentId);

      if (fromInside && toInside) {
        internalHandoffs += 1;
      } else if (!fromInside && toInside) {
        inboundHandoffs += 1;
        inheritedTaskIds.add(receipt.taskId);
      } else if (fromInside && !toInside) {
        outboundHandoffs += 1;
      }
    }

    const attestationWeights = this.collectAttestationCounts();
    let attestations = 0;
    for (const memberId of memberIds) {
      attestations += attestationWeights.get(memberId) ?? 0;
    }

    return {
      teamId: team.teamId,
      memberIds,
      overall,
      receiptCount: receipts.length,
      domains,
      byKind,
      attestations,
      internalHandoffs,
      inboundHandoffs,
      outboundHandoffs,
      inheritedTaskIds: [...inheritedTaskIds].sort(),
      contributedTaskIds: [...contributedTaskIds].sort(),
    };
  }

  getTeamReputations(
    teams: ReadonlyArray<TeamDefinition>
  ): TeamReputationView[] {
    return teams
      .map((team) => this.getTeamReputation(team))
      .sort(
        (left, right) =>
          right.overall - left.overall ||
          left.teamId.localeCompare(right.teamId)
      );
  }

  getIdentityStates(): IdentityStateView[] {
    return [...this.identityStatesById.values()]
      .map(({ state }) => cloneIdentityState(state))
      .sort((left, right) => left.identityId.localeCompare(right.identityId));
  }

  getAttesterRecords(): AttesterRecordView[] {
    return [...this.attesterRecordsByIdentity.values()]
      .map(({ record }) => cloneAttesterRecord(record))
      .sort((left, right) => left.identityId.localeCompare(right.identityId));
  }

  getStakeState(identityId: string): StakeStateView {
    const state = createEmptyStakeState(identityId);
    for (const receipt of this.sortedReceipts()) {
      for (const event of parseStakeEvents(receipt)) {
        if (event.identityId === identityId) {
          applyStakeEvent(state, event, receipt.receiptId);
        }
      }
    }
    return freezeStakeState(state);
  }

  getStakeStates(): StakeStateView[] {
    const states = new Map<string, MutableStakeState>();

    for (const receipt of this.sortedReceipts()) {
      for (const event of parseStakeEvents(receipt)) {
        const state =
          states.get(event.identityId) ??
          createEmptyStakeState(event.identityId);
        applyStakeEvent(state, event, receipt.receiptId);
        states.set(event.identityId, state);
      }
    }

    return [...states.values()]
      .map(freezeStakeState)
      .sort((left, right) => left.identityId.localeCompare(right.identityId));
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

  getAttestations(agentId: string): AgentAttestation[] {
    return this.sortedReceipts()
      .filter((receipt) => receipt.kind === ATTESTATION_KIND)
      .map((receipt) => ({
        receipt,
        targetId: asString(receipt.payload.target),
      }))
      .filter(
        (entry): entry is { receipt: IndexedReceipt; targetId: string } =>
          entry.targetId === agentId,
      )
      .map(({ receipt, targetId }) => ({
        receiptId: receipt.receiptId,
        slot: receipt.slot,
        taskId: receipt.taskId,
        targetId,
        attesterId: receipt.actorId,
        attestationKind: asString(receipt.payload.kind),
        evidenceUri: asString(receipt.payload.evidenceUri),
        evidenceHash: asString(receipt.payload.evidenceHash),
      }));
  }

  getAuthorityHistory(agentId: string): AuthorityRotation[] {
    return this.sortedAuthorityRotations()
      .filter((event) => event.agentId === agentId)
      .map((event) => ({
        eventId: event.eventId,
        slot: event.slot,
        agentId: event.agentId,
        previousAuthority: event.previousAuthority,
        newAuthority: event.newAuthority,
        mode: event.mode,
        sequence: event.sequence,
      }));
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
      (commitment) => commitment.expired,
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
          round: getChallengeRound(receipt),
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

  getChallengeRounds(
    targetReceiptId: string,
    currentSlot?: number,
  ): ChallengeRoundView[] {
    const receiptsById = new Map(
      this.sortedReceipts().map(
        (receipt) => [receipt.receiptId, receipt] as const,
      ),
    );
    return this.getChallengeStatuses(currentSlot)
      .map((challenge) => {
        const receipt = receiptsById.get(challenge.challengeReceiptId);
        return {
          ...challenge,
          slot: receipt?.slot ?? 0,
        };
      })
      .filter((challenge) => challenge.targetReceiptId === targetReceiptId)
      .sort(
        (left, right) =>
          left.round - right.round ||
          left.slot - right.slot ||
          left.challengeReceiptId.localeCompare(right.challengeReceiptId),
      );
  }

  getUnansweredChallenges(currentSlot: number): ChallengeStatus[] {
    return this.getChallengeStatuses(currentSlot).filter(
      (challenge) => challenge.expired,
    );
  }

  isChallengeUnansweredAfter(
    challengeReceiptId: string,
    currentSlot: number,
  ): boolean {
    const challenge = this.getChallengeStatuses(currentSlot).find(
      (candidate) => candidate.challengeReceiptId === challengeReceiptId,
    );
    return challenge?.expired ?? false;
  }

  private collectAttestationCounts(): Map<string, number> {
    const counts = new Map<string, number>();
    for (const receipt of this.sortedReceipts()) {
      if (receipt.kind !== ATTESTATION_KIND) {
        continue;
      }
      const weight =
        this.attesterRecordsByIdentity.get(receipt.actorId)?.record
          .effectiveTier ?? 0;
      if (weight <= 0) {
        continue;
      }
      const target = asString(receipt.payload.target);
      if (!target) {
        continue;
      }
      counts.set(target, (counts.get(target) ?? 0) + weight);
    }
    return counts;
  }

  private sortedReceipts(): IndexedReceipt[] {
    return [...this.receiptsByKey.values()]
      .map(({ receipt }) => receipt)
      .sort(compareBySlotThenReceiptId);
  }

  private sortedAuthorityRotations(): AuthorityRotationEvent[] {
    return [...this.authorityRotationsByKey.values()]
      .map(({ event }) => cloneAuthorityRotation(event))
      .sort(compareAuthorityRotations);
  }
}

const compareAuthorityRotations = (
  left: AuthorityRotationEvent,
  right: AuthorityRotationEvent,
): number => {
  if (left.slot !== right.slot) {
    return left.slot - right.slot;
  }

  return left.eventId.localeCompare(right.eventId);
};
