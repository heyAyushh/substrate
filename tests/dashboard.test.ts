import assert from "node:assert/strict";
import test from "node:test";

import {
  LiveDashboardSnapshotUnavailableError,
  LIVE_SIMULATION_ROUTE,
  LIVE_SNAPSHOT_URL,
  loadDashboardSnapshot,
  runLiveSimulation,
  type DashboardSnapshot,
} from "../src/lib/dashboard.ts";

const TEST_SNAPSHOT: DashboardSnapshot = {
  identities: {
    planner: "identity-planner",
  },
  task: "task-live-sim",
  delegationChain: [],
  receiptTimeline: [],
  leaderboard: {
    all: [],
    attestedOnly: [],
  },
  stake: {},
};

test("loadDashboardSnapshot reads the live snapshot endpoint", async () => {
  const requests: string[] = [];

  const snapshot = await loadDashboardSnapshot(async (input) => {
    requests.push(String(input));
    return new Response(JSON.stringify(TEST_SNAPSHOT), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    });
  });

  assert.deepEqual(snapshot, TEST_SNAPSHOT);
  assert.deepEqual(requests, [LIVE_SNAPSHOT_URL]);
});

test("loadDashboardSnapshot does not fall back to the static snapshot when live data is missing", async () => {
  const requests: string[] = [];

  await assert.rejects(
    () =>
      loadDashboardSnapshot(async (input) => {
        requests.push(String(input));
        return new Response(
          JSON.stringify({
            error: "Live dashboard snapshot unavailable",
          }),
          {
            status: 404,
            headers: {
              "Content-Type": "application/json",
            },
          },
        );
      }),
    LiveDashboardSnapshotUnavailableError,
  );

  assert.deepEqual(requests, [LIVE_SNAPSHOT_URL]);
});

test("runLiveSimulation posts to the live simulation endpoint and returns the fresh snapshot", async () => {
  const requests: Array<{ url: string; method: string | undefined }> = [];

  const result = await runLiveSimulation(async (input, init) => {
    requests.push({
      url: String(input),
      method: init?.method,
    });

    return new Response(
      JSON.stringify({
        runId: "run-live-123",
        startedAt: 100,
        completedAt: 150,
        snapshot: TEST_SNAPSHOT,
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      },
    );
  });

  assert.deepEqual(requests, [
    {
      url: LIVE_SIMULATION_ROUTE,
      method: "POST",
    },
  ]);
  assert.equal(result.runId, "run-live-123");
  assert.deepEqual(result.snapshot, TEST_SNAPSHOT);
});
