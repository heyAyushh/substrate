import test from "node:test";
import { ok, rejects, strictEqual } from "node:assert/strict";

import {
  shouldApplyLiveReputation,
  shouldSyncLiveTaskStatus,
  supportsReputationApply,
  supportsTaskStatusSync,
} from "../../examples/multi_agent/society_chain_kinds.ts";
import { createSocietyLiveManager } from "../../examples/multi_agent/society_live.ts";

const createManager = (options?: {
  failCommitOnce?: boolean;
  autoPlaySessions?: boolean;
  stepDelayMs?: number;
}) => {
  const committedGenesis: string[] = [];
  const committedActions: string[] = [];
  let shouldFailCommit = Boolean(options?.failCommitOnce);
  let finalized = false;

  const manager = createSocietyLiveManager({
    async createChainSession({ sessionId, runId }) {
      return {
        sessionId,
        runId,
        committedGenesis,
        committedActions,
      };
    },
    async commitGenesisAction({ event, chainSession }) {
      chainSession.committedGenesis.push(event.id);
      return {
        address: `genesis_${event.id}`,
        signature: `sig_genesis_${event.id}`,
        slot: 1000 + chainSession.committedGenesis.length,
      };
    },
    async commitLiveAction({ event, chainSession }) {
      if (shouldFailCommit) {
        shouldFailCommit = false;
        throw new Error(`forced commit failure for ${event.id}`);
      }
      chainSession.committedActions.push(event.id);
      return {
        address: `receipt_${event.id}`,
        signature: `sig_${event.id}`,
        slot: 2000 + chainSession.committedActions.length,
      };
    },
    async finalizeChainSession() {
      finalized = true;
      return {
        proof: {
          id: "proof_live_demo",
          url: "/proofs/live-demo.json",
          hash: "proof_hash_live_demo",
          status: "committed",
          file: "/tmp/live-demo.json",
        },
        audit: {
          address: "audit_receipt_live_demo",
          signature: "audit_signature_live_demo",
          slot: 2999,
        },
      };
    },
    async syncChainSessionState({ simulation }) {
      return simulation;
    },
    autoPlaySessions: options?.autoPlaySessions,
    stepDelayMs: options?.stepDelayMs,
  });

  return {
    manager,
    committedGenesis,
    committedActions,
    wasFinalized: () => finalized,
  };
};

test("starting a live society session commits genesis actions before the session is ready", async () => {
  const { manager, committedGenesis } = createManager({
    autoPlaySessions: false,
  });
  const started = await manager.startSession({
    agents: 4,
    ticks: 3,
    gridSize: 8,
    seed: "live-start",
  });

  strictEqual(started.snapshot.status, "paused");
  strictEqual(
    committedGenesis.length,
    started.snapshot.confirmedFrame.agents.length,
  );
  strictEqual(started.snapshot.confirmedEvents.length, committedGenesis.length);
  strictEqual(started.snapshot.pendingAction, undefined);
});

test("live society sessions default to paused until the user plays or steps", async () => {
  const { manager, committedActions } = createManager();
  const started = await manager.startSession({
    agents: 3,
    ticks: 2,
    gridSize: 8,
    seed: "live-default-paused",
  });

  strictEqual(started.snapshot.status, "paused");
  strictEqual(committedActions.length, 0);
});

test("latest live session snapshot follows the newest started session", async () => {
  const { manager } = createManager({
    autoPlaySessions: false,
  });

  strictEqual(manager.getLatestSessionSnapshot(), undefined);

  const first = await manager.startSession({
    agents: 2,
    ticks: 1,
    gridSize: 6,
    seed: "latest-first",
  });
  strictEqual(manager.getLatestSessionSnapshot()?.sessionId, first.sessionId);

  const second = await manager.startSession({
    agents: 2,
    ticks: 1,
    gridSize: 6,
    seed: "latest-second",
  });
  strictEqual(manager.getLatestSessionSnapshot()?.sessionId, second.sessionId);
});

test("starting a new live society session pauses the previous running session", async () => {
  const { manager } = createManager({
    autoPlaySessions: true,
    stepDelayMs: 10_000,
  });

  const first = await manager.startSession({
    agents: 2,
    ticks: 2,
    gridSize: 6,
    seed: "first-running-world",
  });
  strictEqual(manager.getSessionSnapshot(first.sessionId).status, "running");

  const second = await manager.startSession({
    agents: 2,
    ticks: 2,
    gridSize: 6,
    seed: "second-running-world",
  });

  strictEqual(manager.getSessionSnapshot(first.sessionId).status, "paused");
  strictEqual(manager.getSessionSnapshot(second.sessionId).status, "running");
});

test("starting a live society session runs automatically when autoplay is enabled", async () => {
  const { manager } = createManager({
    autoPlaySessions: true,
    stepDelayMs: 1,
  });
  const started = await manager.startSession({
    agents: 3,
    ticks: 2,
    gridSize: 8,
    seed: "live-autoplay",
  });

  strictEqual(started.snapshot.status, "running");

  let attempts = 0;
  while (
    manager.getSessionSnapshot(started.sessionId).committedActions.length ===
      0 &&
    attempts < 20
  ) {
    attempts += 1;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }

  ok(
    manager.getSessionSnapshot(started.sessionId).committedActions.length > 0,
    "autoplay session did not commit a live action",
  );
});

test("stepping a live session emits pending then confirmed updates", async () => {
  const { manager } = createManager({ autoPlaySessions: false });
  const started = await manager.startSession({
    agents: 3,
    ticks: 2,
    gridSize: 8,
    seed: "live-step",
  });
  const updates: string[] = [];

  const unsubscribe = manager.subscribe(started.sessionId, (message) => {
    updates.push(message.type);
  });

  await manager.stepSession(started.sessionId);
  unsubscribe();

  strictEqual(updates[0], "snapshot");
  strictEqual(updates[1], "pending");
  strictEqual(updates[2], "confirmed");
});

test("failed live commits clear pending state and preserve confirmed progress", async () => {
  const { manager } = createManager({
    failCommitOnce: true,
    autoPlaySessions: false,
  });
  const started = await manager.startSession({
    agents: 3,
    ticks: 2,
    gridSize: 8,
    seed: "live-failure",
  });
  const beforeStep = manager.getSessionSnapshot(started.sessionId);

  await rejects(
    manager.stepSession(started.sessionId),
    /forced commit failure/,
  );

  const afterFailure = manager.getSessionSnapshot(started.sessionId);
  strictEqual(afterFailure.pendingAction, undefined);
  strictEqual(
    afterFailure.confirmedEvents.length,
    beforeStep.confirmedEvents.length,
  );
});

test("completing a live session writes the final proof reference", async () => {
  const { manager, wasFinalized } = createManager({
    autoPlaySessions: false,
  });
  const started = await manager.startSession({
    agents: 2,
    ticks: 1,
    gridSize: 6,
    seed: "live-complete",
  });

  while (true) {
    const snapshot = manager.getSessionSnapshot(started.sessionId);
    if (snapshot.status === "complete") break;
    const progressed = await manager.stepSession(started.sessionId);
    if (!progressed) break;
  }

  const completed = manager.getSessionSnapshot(started.sessionId);
  strictEqual(completed.status, "complete");
  ok(completed.proof);
  ok(wasFinalized());
});

test("live receipt routing only syncs and scores eligible receipt kinds", () => {
  strictEqual(supportsTaskStatusSync("assignment"), true);
  strictEqual(supportsTaskStatusSync("handoff"), true);
  strictEqual(supportsTaskStatusSync("completion"), true);
  strictEqual(supportsTaskStatusSync("genesis"), false);
  strictEqual(supportsTaskStatusSync("challenge"), false);

  strictEqual(supportsReputationApply("completion"), true);
  strictEqual(supportsReputationApply("dispute"), true);
  strictEqual(supportsReputationApply("dispute_resolved"), true);
  strictEqual(supportsReputationApply("assignment"), false);
  strictEqual(supportsReputationApply("genesis"), false);

  strictEqual(
    shouldSyncLiveTaskStatus({ action: "death", kind: "dispute" }),
    false,
  );
  strictEqual(
    shouldApplyLiveReputation({ action: "death", kind: "dispute" }),
    false,
  );
  strictEqual(
    shouldSyncLiveTaskStatus({ action: "birth", kind: "assignment" }),
    true,
  );
  strictEqual(
    shouldApplyLiveReputation({ action: "heartbeat", kind: "completion" }),
    true,
  );
});
