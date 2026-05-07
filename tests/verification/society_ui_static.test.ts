import test from "node:test";
import { ok } from "node:assert/strict";
import { readFile } from "node:fs/promises";

const APP_SOURCE_PATH = "examples/multi_agent/society-ui-app/src/App.tsx";
const MAIN_SOURCE_PATH = "examples/multi_agent/society-ui-app/src/main.tsx";

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
    source.includes("Launch from onboarding to prepare the Surfpool session"),
    "the empty Surfpool panel should point to the onboarding launch action",
  );
  ok(
    !source.includes("Surfpool live"),
    "idle state must not imply Surfpool is already running",
  );
  ok(
    !source.includes("Start the live world"),
    "idle state should not imply a hidden dashboard start button",
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

test("society UI presents the board as a state reader, not the truth source", async () => {
  const source = await readFile(APP_SOURCE_PATH, "utf8");

  ok(
    source.includes("The board reads the signed Surfpool world state."),
    "the UI should say the board reads committed state",
  );
  ok(
    !source.includes("The board remains the source of truth."),
    "the UI must not claim the board is the source of truth",
  );
});

test("society UI surfaces every deployable program in the live demo", async () => {
  const source = await readFile(APP_SOURCE_PATH, "utf8");

  for (const program of [
    "identity_registry",
    "attester_registry",
    "delegation_engine",
    "task_registry",
    "receipt_emitter",
    "proof_verifier",
    "reputation_accumulator",
    "agent_stake",
    "dispute_resolver",
  ]) {
    ok(source.includes(program), `live UI must include ${program}`);
  }
  ok(
    source.includes("ProgramCoverageCard"),
    "live UI should include a program coverage card",
  );
  ok(
    source.includes("Task program is the board anchor"),
    "live UI must identify the task program as the board anchor",
  );
});

test("society UI displays chain-bound agent action envelopes", async () => {
  const source = await readFile(APP_SOURCE_PATH, "utf8");

  ok(
    source.includes("actionEnvelope"),
    "live UI should render the canonical action envelope",
  );
  ok(
    source.includes("envelope tx"),
    "live UI should label transaction-bound action envelopes",
  );
});

test("society UI renders the full protocol evidence graph", async () => {
  const source = await readFile(APP_SOURCE_PATH, "utf8");

  ok(
    source.includes("ProtocolEvidenceCard"),
    "live UI should render the protocol evidence graph",
  );
  ok(
    source.includes("Protocol evidence graph"),
    "live UI should label the evidence graph plainly",
  );
  ok(
    source.includes("program evidence stays visible"),
    "missing program evidence must be visible instead of hidden",
  );
  ok(
    source.includes("actionEnvelopes"),
    "the evidence graph should summarize chain-bound action envelopes",
  );
});

test("society UI launches new live worlds from onboarding only", async () => {
  const source = await readFile(APP_SOURCE_PATH, "utf8");

  ok(
    source.includes("LivePreparationPanel"),
    "the dashboard should still render a visible live preparation status panel",
  );
  ok(
    source.includes("startOnboardingLiveWorld"),
    "the onboarding flow should own starting the Surfpool world",
  );
  ok(
    source.includes("onStartLiveWorld"),
    "the onboarding overlay should receive the explicit live launch action",
  );
  ok(
    source.includes("agents and start live world"),
    "the onboarding CTA should prepare the chosen agent count and start the world",
  );
  ok(
    !source.includes('id="quick-agents"'),
    "the dashboard must not ask for the agent count again",
  );
  ok(
    !source.includes("Agents to prepare"),
    "agent count selection should stay out of the main dashboard",
  );
  ok(
    !source.includes("onClick={() => void startLiveSession()}"),
    "the dashboard must not keep a direct start-new-world button",
  );
  ok(
    source.includes("Agent readiness"),
    "the dashboard should show agent readiness after live start",
  );
  ok(
    source.includes("SOL stake"),
    "the dashboard should make SOL stake readiness visible",
  );
  ok(
    source.includes('"$SUBSOL"'),
    "the society board should label its game currency as $SUBSOL",
  );
  ok(
    !source.includes("souls") && !source.includes("Souls"),
    "the society board should not expose the old souls currency label",
  );
  ok(
    source.includes("Surfpool RPC"),
    "the dashboard should show Surfpool readiness while the user waits",
  );
});

test("society board agent clicks keep the grid visible", async () => {
  const source = await readFile(APP_SOURCE_PATH, "utf8");

  ok(
    source.includes('selectAgentView(agent.id, "world")'),
    "clicking an agent on the canvas should select it without leaving the board",
  );
  ok(
    !source.includes(
      'selectAgentView(agent.id, onboardingComplete ? "agents" : "world")',
    ),
    "canvas clicks must not switch the whole page to the agent detail view",
  );
  ok(
    source.includes("drawAgentSelectionRing"),
    "selected and hovered agents should have a visible board highlight",
  );
});

test("society UI keeps interactive panels visibly focusable", async () => {
  const source = await readFile(APP_SOURCE_PATH, "utf8");

  ok(
    source.includes("INTERACTIVE_PANEL_CLASS"),
    "clickable cards should share a dedicated interactive panel class",
  );
  ok(
    source.includes("focus-visible:ring-2"),
    "interactive cards should have a visible keyboard focus ring",
  );
  ok(
    source.includes("aria-busy={isStartingLive}"),
    "the onboarding launch control should expose its loading state to assistive tech",
  );
});

test("society playground keeps the original transparent board surface", async () => {
  const source = await readFile(APP_SOURCE_PATH, "utf8");

  ok(
    source.includes("PLAYGROUND_BOARD_SURFACE_CLASS"),
    "the board should have a dedicated surface class instead of inheriting graph card styling",
  );
  ok(
    source.includes('const PLAYGROUND_BOARD_SURFACE_CLASS = "relative"'),
    "the canvas wrapper should stay transparent so the page checks show through",
  );
  ok(
    source.includes("PLAYGROUND_DETAIL_PANEL_CLASS") &&
      source.includes("bg-background/35 p-3 shadow-none backdrop-blur-[3px]"),
    "the board detail panel should keep a transparent card treatment",
  );
  ok(
    !source.includes('cn(GRAPH_SURFACE_CLASS, "p-2")'),
    "the playground canvas must not be wrapped in the heavier graph/card surface",
  );
  ok(
    source.includes("absolute inset-0"),
    "death overlays should keep the same coordinate space as the transparent canvas",
  );
});

test("society world layout does not crush side panels on laptop widths", async () => {
  const source = await readFile(APP_SOURCE_PATH, "utf8");

  ok(
    !source.includes("lg:grid-cols-[320px_minmax(0,1fr)_320px]"),
    "the three-column board layout must not activate at the laptop breakpoint",
  );
  ok(
    source.includes("lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]"),
    "laptop widths should use two flexible columns instead of fixed sidebars",
  );
  ok(
    source.includes(
      "xl:grid-cols-[minmax(280px,320px)_minmax(420px,1fr)_minmax(280px,320px)]",
    ),
    "full three-column mode should wait for wider screens",
  );
  ok(
    source.includes("lg:col-span-2 xl:col-span-1"),
    "the agents panel should move below the board before the wide breakpoint",
  );
});

test("society readiness copy wraps instead of clipping", async () => {
  const source = await readFile(APP_SOURCE_PATH, "utf8");

  ok(
    source.includes("PREPARATION_STEP_DETAIL_CLASS"),
    "readiness step details should share a wrapping text class",
  );
  ok(
    source.includes("whitespace-normal") && source.includes("break-words"),
    "long readiness copy should wrap inside its card",
  );
  ok(
    !source.includes("mt-1 truncate font-mono text-xs text-muted-foreground"),
    "readiness details must not be forced into clipped single-line text",
  );
});

test("society app wires Agentation behind local-only opt-in", async () => {
  const source = await readFile(MAIN_SOURCE_PATH, "utf8");

  ok(
    source.includes('await import("agentation")'),
    "Agentation should be loaded in the Society app shell",
  );
  ok(
    source.includes("import.meta.env.DEV"),
    "Agentation should appear automatically in local dev mode",
  );
  ok(
    source.includes(
      'new URLSearchParams(window.location.search).has("agentation")',
    ),
    "the production Society server should allow explicit localhost opt-in with ?agentation=1",
  );
  ok(
    source.includes("LOCAL_AGENTATION_HOSTS.has(window.location.hostname)"),
    "the URL opt-in must be restricted to localhost-style hosts",
  );
});

test("society playground keeps tight spacing around the canvas", async () => {
  const source = await readFile(APP_SOURCE_PATH, "utf8");

  ok(
    source.includes("PLAYGROUND_STACK_CLASS"),
    "the board stack should use a named spacing class",
  );
  ok(
    source.includes("content-start gap-1.5"),
    "the canvas stack should keep only a small gap between board components",
  );
  ok(
    source.includes("PLAYGROUND_EMPTY_STATE_CLASS"),
    "the hover/detail empty state under the canvas should be smaller than global empty panels",
  );
  ok(
    source.includes("min-h-20") && !source.includes("content-start gap-2.5"),
    "the playground should not keep the old loose vertical spacing",
  );
});

test("society playground fullscreen fits a desktop viewport without scrolling", async () => {
  const source = await readFile(APP_SOURCE_PATH, "utf8");

  ok(
    source.includes("PLAYGROUND_FULLSCREEN_CLASS"),
    "fullscreen mode should use a named layout class",
  );
  ok(
    source.includes("max-h-svh") && source.includes("overflow-hidden"),
    "fullscreen mode should fit the viewport instead of becoming a scroll container",
  );
  ok(
    source.includes("grid-rows-[auto_minmax(0,1fr)_auto_auto_auto]"),
    "fullscreen mode should give the canvas the flexible row while keeping status panels visible",
  );
  ok(
    source.includes("PLAYGROUND_FULLSCREEN_BOARD_CLASS") &&
      source.includes('"min-h-0 overflow-hidden"'),
    "the fullscreen board surface should be allowed to shrink inside the viewport grid",
  );
  ok(
    source.includes("PLAYGROUND_FULLSCREEN_CANVAS_CLASS") &&
      source.includes('"h-full min-h-0"'),
    "the fullscreen canvas should fill its available row without enforcing a tall minimum",
  );
  ok(
    !source.includes("md:h-[calc(100svh-230px)]"),
    "fullscreen canvas height must not rely on a fixed viewport subtraction that can force scroll",
  );
  ok(
    !source.includes("h-svh overflow-auto bg-background p-3"),
    "fullscreen mode must not keep the old explicit scrolling wrapper",
  );
});
