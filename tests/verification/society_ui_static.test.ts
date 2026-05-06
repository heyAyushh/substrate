import test from "node:test";
import { ok } from "node:assert/strict";
import { readFile } from "node:fs/promises";

const APP_SOURCE_PATH = "examples/multi_agent/society-ui-app/src/App.tsx";

test("society UI only starts or resumes sessions from explicit user actions", async () => {
  const source = await readFile(APP_SOURCE_PATH, "utf8");
  const latestFetchIndex = source.indexOf('fetch("/api/society/live/latest")');
  const resumeHandlerIndex = source.indexOf("const resumeLatestLiveSession");

  ok(
    latestFetchIndex > resumeHandlerIndex && resumeHandlerIndex > -1,
    "latest session fetch must stay inside the explicit resume handler",
  );
  ok(
    source.includes("onClick={() => void resumeLatestLiveSession()}"),
    "latest session resume must be bound to a visible user action",
  );
  ok(
    !source.includes("bootLiveSession"),
    "page load must not boot a live session automatically",
  );
  ok(
    !source.includes("didBootLiveSessionRef"),
    "page load must not guard an automatic live boot",
  );
  ok(
    !source.includes("shouldSkipAutoLiveBoot"),
    "the UI should not need an opt-out flag for automatic live booting",
  );
});

test("society UI labels idle Surfpool state honestly", async () => {
  const source = await readFile(APP_SOURCE_PATH, "utf8");

  ok(
    source.includes("Surfpool ready"),
    "the idle header should say Surfpool is ready, not already live",
  );
  ok(
    source.includes("World idle"),
    "the idle header should make it clear no world is running yet",
  );
  ok(
    source.includes("No world open in this browser"),
    "the idle body should describe the browser view, not global server state",
  );
  ok(
    source.includes("Click Go live to load the Surfpool session"),
    "the empty Surfpool panel should point to the explicit start action",
  );
  ok(
    !source.includes("Surfpool live"),
    "idle state must not imply Surfpool is already running",
  );
  ok(
    !source.includes("Start the live world"),
    "idle state should use the visible Go live button text",
  );
  ok(
    !source.includes("No live world running"),
    "idle copy must not contradict a resumable server-side session",
  );
  ok(
    !source.includes("Waiting for the first committed action."),
    "idle commentary must not imply a write has already started",
  );
});
