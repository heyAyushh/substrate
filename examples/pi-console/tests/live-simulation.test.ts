import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import type { DashboardSnapshot } from "../src/lib/dashboard.ts";
import {
  createLiveSimulationController,
  executeLocalSimulation,
  LiveSimulationAlreadyRunningError,
} from "../dev/live-simulation.ts";

const TEST_SNAPSHOT: DashboardSnapshot = {
  identities: {
    alpha: "identity-alpha",
  },
  task: "task-live-simulation",
  delegationChain: [],
  receiptTimeline: [],
  leaderboard: {
    all: [],
    attestedOnly: [],
  },
  stake: {},
};

test("executeLocalSimulation writes the fresh dashboard snapshot", async () => {
  const temporaryDirectory = await mkdtemp(
    path.join(tmpdir(), "pi-console-live-sim-"),
  );
  const liveSnapshotPath = path.join(temporaryDirectory, "dashboard-data.json");

  try {
    const snapshot = await executeLocalSimulation({
      workspaceRoot: "/workspace/trust-substrate",
      liveSnapshotPath,
      execFileFn: async (command, args, options) => {
        assert.equal(command, process.execPath);
        assert.deepEqual(args, [
          "--experimental-strip-types",
          "examples/multi_agent/run.ts",
        ]);
        assert.equal(options.cwd, "/workspace/trust-substrate");

        return {
          stdout: JSON.stringify(TEST_SNAPSHOT),
          stderr: "",
        };
      },
    });

    assert.deepEqual(snapshot, TEST_SNAPSHOT);
    const persistedSnapshot = JSON.parse(
      await readFile(liveSnapshotPath, "utf8"),
    ) as DashboardSnapshot;
    assert.deepEqual(persistedSnapshot, TEST_SNAPSHOT);
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
});

test("createLiveSimulationController rejects overlapping runs", async () => {
  let resolveSnapshot: ((snapshot: DashboardSnapshot) => void) | undefined;
  const pendingSnapshot = new Promise<DashboardSnapshot>((resolve) => {
    resolveSnapshot = resolve;
  });

  let tick = 100;
  const controller = createLiveSimulationController({
    executeSimulation: () => pendingSnapshot,
    createRunId: () => "run-live-1",
    now: () => tick++,
  });

  const firstRun = controller.run();

  await assert.rejects(
    () => controller.run(),
    LiveSimulationAlreadyRunningError,
  );

  resolveSnapshot?.(TEST_SNAPSHOT);
  const result = await firstRun;

  assert.equal(result.runId, "run-live-1");
  assert.deepEqual(result.snapshot, TEST_SNAPSHOT);
});

test("createLiveSimulationController clears its lock after a failed run", async () => {
  let shouldFail = true;
  let runCount = 0;
  const controller = createLiveSimulationController({
    executeSimulation: async () => {
      runCount += 1;
      if (shouldFail) {
        shouldFail = false;
        throw new Error("simulation exploded");
      }

      return TEST_SNAPSHOT;
    },
    createRunId: () => `run-live-${runCount}`,
    now: () => 200 + runCount,
  });

  await assert.rejects(() => controller.run(), /simulation exploded/);

  const nextResult = await controller.run();

  assert.equal(nextResult.runId, "run-live-1");
  assert.deepEqual(nextResult.snapshot, TEST_SNAPSHOT);
});
