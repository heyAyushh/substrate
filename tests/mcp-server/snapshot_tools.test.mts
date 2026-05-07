import test from "node:test";
import { deepStrictEqual, ok, strictEqual, throws } from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { LocalReceiptRecord } from "@trust-substrate/indexer";
import {
  createAgentProfile,
  createSnapshotSummary,
  createTaskTrace,
  resolveSnapshotPath,
} from "../../packages/mcp-server/src/snapshot-tools.js";

const require = createRequire(import.meta.url);
const { LocalDurableIndexer } =
  require("@trust-substrate/indexer") as typeof import("@trust-substrate/indexer");

const STAKE_EVENT_MARKER = "trust-substrate.stake_event";
const STAKE_SLOT = 1;
const ASSIGNMENT_SLOT = 10;
const HANDOFF_SLOT = 20;
const COMPLETION_SLOT = 30;
const STAKE_AMOUNT_LAMPORTS = "100";
const LEADERBOARD_LIMIT = 2;
const EXPECTED_RECEIPT_COUNT = 4;
const EXPECTED_TASK_COUNT = 2;
const EXPECTED_AGENT_COUNT = 2;
const EXPECTED_ALPHA_RECEIPT_COUNT = 3;
const EXPECTED_TASK_RECEIPT_COUNT = 3;
const EXPECTED_HANDOFF_COUNT = 1;

const createReceipt = (
  overrides: Partial<LocalReceiptRecord> & {
    receiptId: string;
    slot: number;
    taskId: string;
    actorId: string;
    kind: string;
  },
): LocalReceiptRecord => ({
  domain: "ops",
  payload: {},
  ...overrides,
});

const createSnapshotFile = (projectRoot: string): string => {
  const indexer = new LocalDurableIndexer();
  indexer.ingest([
    createReceipt({
      receiptId: "stake-alpha",
      slot: STAKE_SLOT,
      taskId: "stake-alpha",
      actorId: "agent-alpha",
      kind: "stake_event",
      payload: {
        stakeEvents: [
          {
            type: STAKE_EVENT_MARKER,
            kind: "deposited",
            identityId: "agent-alpha",
            amountLamports: STAKE_AMOUNT_LAMPORTS,
          },
        ],
      },
    }),
    createReceipt({
      receiptId: "assign-1",
      slot: ASSIGNMENT_SLOT,
      taskId: "task-1",
      actorId: "agent-alpha",
      kind: "assignment",
      payload: { model: "gpt-5.4", tool: "planner" },
    }),
    createReceipt({
      receiptId: "handoff-1",
      slot: HANDOFF_SLOT,
      taskId: "task-1",
      actorId: "agent-alpha",
      kind: "handoff",
      payload: { toAgentId: "agent-beta", tool: "router" },
    }),
    createReceipt({
      receiptId: "complete-1",
      slot: COMPLETION_SLOT,
      taskId: "task-1",
      actorId: "agent-beta",
      kind: "completion",
      payload: { outcome: "accepted", tool: "builder" },
    }),
  ]);
  indexer.ingestProgramReputations([
    {
      identityId: "agent-alpha",
      domain: "ops",
      completed: "0",
      disputed: "0",
      resolved: "0",
      attested: "0",
      weightedCompleted: "3",
      weightedDisputed: "0",
      weightedResolved: "0",
      weightedAttested: "0",
      reviewerWeightSum: "1",
      slashPenaltySum: "0",
      lastAppliedSlot: String(COMPLETION_SLOT),
    },
  ]);

  const snapshotPath = join(projectRoot, "snapshots", "indexer.json");
  mkdirSync(dirname(snapshotPath), { recursive: true });
  indexer.saveSnapshot(snapshotPath);
  return snapshotPath;
};

test("resolveSnapshotPath keeps reads inside the project root", () => {
  const projectRoot = mkdtempSync(join(tmpdir(), "trust-mcp-root-"));
  const snapshotPath = createSnapshotFile(projectRoot);

  strictEqual(
    resolveSnapshotPath({
      projectRoot,
      snapshotPath: "snapshots/indexer.json",
    }),
    snapshotPath,
  );

  throws(
    () =>
      resolveSnapshotPath({
        projectRoot,
        snapshotPath: "../outside.json",
      }),
    /outside the project root/,
  );

  throws(
    () =>
      resolveSnapshotPath({
        projectRoot,
        snapshotPath: ".mcp.json",
      }),
    /hidden file/,
  );
});

test("createSnapshotSummary returns graph and leaderboard context", () => {
  const projectRoot = mkdtempSync(join(tmpdir(), "trust-mcp-summary-"));
  createSnapshotFile(projectRoot);

  const summary = createSnapshotSummary({
    projectRoot,
    snapshotPath: "snapshots/indexer.json",
    leaderboardLimit: LEADERBOARD_LIMIT,
  });

  strictEqual(summary.receiptCount, EXPECTED_RECEIPT_COUNT);
  strictEqual(summary.taskCount, EXPECTED_TASK_COUNT);
  strictEqual(summary.agentCount, EXPECTED_AGENT_COUNT);
  deepStrictEqual(
    summary.domains.map((domain) => domain.domain),
    ["ops"],
  );
  strictEqual(summary.leaderboard[0].agentId, "agent-alpha");
  ok(summary.snapshotPath.endsWith("snapshots/indexer.json"));
});

test("createAgentProfile combines profile, stake, and tool quality", () => {
  const projectRoot = mkdtempSync(join(tmpdir(), "trust-mcp-profile-"));
  createSnapshotFile(projectRoot);

  const profile = createAgentProfile({
    projectRoot,
    snapshotPath: "snapshots/indexer.json",
    agentId: "agent-alpha",
  });

  strictEqual(profile.agent.agentId, "agent-alpha");
  strictEqual(profile.agent.receiptCount, EXPECTED_ALPHA_RECEIPT_COUNT);
  strictEqual(profile.stake.activeLamports, STAKE_AMOUNT_LAMPORTS);
  deepStrictEqual(
    profile.toolQuality.map((stat) => stat.tool),
    ["planner", "router"],
  );
});

test("createTaskTrace returns receipts, handoffs, and file-edit trace", () => {
  const projectRoot = mkdtempSync(join(tmpdir(), "trust-mcp-task-"));
  createSnapshotFile(projectRoot);

  const trace = createTaskTrace({
    projectRoot,
    snapshotPath: "snapshots/indexer.json",
    taskId: "task-1",
  });

  strictEqual(trace.taskId, "task-1");
  strictEqual(trace.receipts.length, EXPECTED_TASK_RECEIPT_COUNT);
  strictEqual(trace.handoffs.length, EXPECTED_HANDOFF_COUNT);
  strictEqual(trace.handoffs[0].toAgentId, "agent-beta");
  deepStrictEqual(trace.agentTrace.metadata["dev.trust-substrate"].agentIds, [
    "agent-alpha",
    "agent-beta",
  ]);
});

test("createSnapshotSummary rejects malformed snapshot JSON", () => {
  const projectRoot = mkdtempSync(join(tmpdir(), "trust-mcp-bad-json-"));
  const snapshotPath = join(projectRoot, "snapshots", "indexer.json");
  mkdirSync(dirname(snapshotPath), { recursive: true });
  writeFileSync(snapshotPath, "{", "utf8");

  throws(
    () =>
      createSnapshotSummary({
        projectRoot,
        snapshotPath: "snapshots/indexer.json",
      }),
    /could not load indexer snapshot/,
  );
});
