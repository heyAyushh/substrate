import {
  compareBySlotThenReceiptId,
  stableStringify
} from "./utils.js";
import {
  type AgentHistoryView,
  type DomainSummary,
  type ExecutionGraph,
  type HandoffStep,
  type IndexedReceipt,
  type IngestResult,
  type LocalReceiptRecord,
  type TaskHistoryView
} from "./types.js";

interface StoredReceipt {
  receipt: IndexedReceipt;
  canonical: string;
}

const createDedupeKey = (receipt: LocalReceiptRecord): string =>
  `${receipt.receiptId}:${receipt.slot}`;

const isHandoff = (receipt: LocalReceiptRecord): boolean => receipt.kind === "handoff";

const getHandoffTarget = (receipt: LocalReceiptRecord): string | undefined => {
  const target = receipt.payload.toAgentId;
  return typeof target === "string" && target.length > 0 ? target : undefined;
};

const cloneReceipt = (receipt: LocalReceiptRecord, sequence: number): IndexedReceipt => ({
  receiptId: receipt.receiptId,
  slot: receipt.slot,
  taskId: receipt.taskId,
  actorId: receipt.actorId,
  kind: receipt.kind,
  domain: receipt.domain,
  payload: { ...receipt.payload },
  sequence,
  dedupeKey: createDedupeKey(receipt)
});

const dedupeStrings = (values: string[]): string[] => [...new Set(values)].sort();

export class LocalDurableIndexer {
  private readonly receiptsByKey = new Map<string, StoredReceipt>();

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
        payload: receipt.payload
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
        canonical
      });
      accepted += 1;
    }

    return { accepted, duplicates };
  }

  getTaskHistory(taskId: string): IndexedReceipt[] {
    return this.sortedReceipts().filter((receipt) => receipt.taskId === taskId);
  }

  getAgentHistory(agentId: string): IndexedReceipt[] {
    return this.sortedReceipts().filter((receipt) => receipt.actorId === agentId);
  }

  getHandoffChain(taskId: string): HandoffStep[] {
    return this.sortedReceipts()
      .filter((receipt) => receipt.taskId === taskId && isHandoff(receipt))
      .map((receipt) => {
        const toAgentId = getHandoffTarget(receipt);
        if (!toAgentId) {
          throw new Error(`handoff receipt ${receipt.receiptId} is missing toAgentId`);
        }

        return {
          receiptId: receipt.receiptId,
          slot: receipt.slot,
          taskId: receipt.taskId,
          fromAgentId: receipt.actorId,
          toAgentId
        };
      });
  }

  getDomainSummary(domain: string): DomainSummary {
    const summaries = this.getDomainSummaries().filter((summary) => summary.domain === domain);
    if (summaries.length === 0) {
      return {
        domain,
        receiptCount: 0,
        taskIds: [],
        agentIds: [],
        handoffCount: 0,
        latestSlot: 0
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
          latestSlot: receipt.slot
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
        agentIds: summary.agentIds.sort()
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
        domains: []
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
        domains: []
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
          throw new Error(`handoff receipt ${receipt.receiptId} is missing toAgentId`);
        }

        const handoffChain = handoffChainByTask.get(receipt.taskId) ?? [];
        handoffChain.push({
          receiptId: receipt.receiptId,
          slot: receipt.slot,
          taskId: receipt.taskId,
          fromAgentId: receipt.actorId,
          toAgentId
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
            receipts: [...task.receipts]
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
            receipts: [...agent.receipts]
          }))
          .sort((left, right) => left.agentId.localeCompare(right.agentId))
          .map((agent) => [agent.agentId, agent])
      ),
      handoffChainByTask: Object.fromEntries(
        [...handoffChainByTask.entries()]
          .sort(([leftTaskId], [rightTaskId]) => leftTaskId.localeCompare(rightTaskId))
          .map(([taskId, chain]) => [taskId, [...chain].sort(compareBySlotThenReceiptId)])
      ),
      domains: Object.fromEntries(
        this.getDomainSummaries().map((summary) => [summary.domain, summary])
      )
    };
  }

  private sortedReceipts(): IndexedReceipt[] {
    return [...this.receiptsByKey.values()]
      .map(({ receipt }) => receipt)
      .sort(compareBySlotThenReceiptId);
  }
}
