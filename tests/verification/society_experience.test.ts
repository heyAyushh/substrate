import test from "node:test";
import { deepStrictEqual, ok, strictEqual } from "node:assert/strict";
import { createRequire } from "node:module";

import {
  AGENT_ARCHETYPE_CHOICES,
  buildOnboardingMissionModel,
  CURATED_ONBOARDING_TEMPLATES,
  buildAgentPath,
  buildOnboardingLiveWindowModel,
  createMoreOnboardingTemplates,
  getPatternConfigOverrides,
  pickRandomAgentChoice,
} from "../../examples/multi_agent/society-ui-app/src/society-experience.ts";

const require = createRequire(import.meta.url);
const {
  runSocietySimulation,
} = require("../../examples/multi_agent/society_core.js");

const buildCuratedConfig = (
  template: (typeof CURATED_ONBOARDING_TEMPLATES)[number],
) => {
  const overrides = getPatternConfigOverrides(
    template.form.pattern,
    Number(template.form.gridSize),
  );

  return {
    agents: Number(template.form.agents),
    ticks: Number(template.form.ticks),
    initialTokens: Number(template.form.initialTokens),
    universalIncome: Number(template.form.universalIncome),
    livingCost: Number(template.form.livingCost),
    gridSize: Number(template.form.gridSize),
    receiptsPerCompressedTx: Number(template.form.receiptsPerCompressedTx),
    seed: template.form.seed,
    scenario: overrides.scenario,
    resourceCap: overrides.resourceCap,
    resourceRegrowth: overrides.resourceRegrowth,
    birthThreshold: overrides.birthThreshold,
    aidThreshold: overrides.aidThreshold,
    vision: overrides.vision,
    maxAge: overrides.maxAge,
    lifeDensity: overrides.lifeDensity,
    seasonLength: overrides.seasonLength,
    stipendSwing: overrides.stipendSwing,
    regrowthSwing: overrides.regrowthSwing,
    biosphereBoost: overrides.biosphereBoost,
    spawnSpacing: overrides.spawnSpacing,
    heroArchetype: AGENT_ARCHETYPE_CHOICES[0].id,
    initialCells: overrides.initialCells,
  };
};

test("curated onboarding templates open with the three wow default scenarios", () => {
  deepStrictEqual(
    CURATED_ONBOARDING_TEMPLATES.map((template) => template.name),
    ["Empire Ascent", "Reactor Breach", "Frontier Convoy"],
  );
});

test("onboarding scenario overrides map the curated worlds to stronger simulation math", () => {
  const empire = getPatternConfigOverrides("empire", 22);
  const reactor = getPatternConfigOverrides("reactor", 22);
  const frontier = getPatternConfigOverrides("frontier", 22);

  strictEqual(empire.scenario, "dynasty");
  strictEqual(reactor.scenario, "worldseed");
  strictEqual(frontier.scenario, "frontier");
  ok(empire.birthThreshold > frontier.birthThreshold);
  ok(reactor.maxAge < empire.maxAge);
  ok(reactor.resourceRegrowth <= empire.resourceRegrowth);
  ok(frontier.spawnSpacing <= empire.spawnSpacing);
});

test("curated onboarding worlds seed recognizable Conway-style patterns", () => {
  const empire = getPatternConfigOverrides("empire", 22);
  const reactor = getPatternConfigOverrides("reactor", 22);
  const frontier = getPatternConfigOverrides("frontier", 22);

  deepStrictEqual(empire.initialCells, [
    { x: 10, y: 10 },
    { x: 11, y: 10 },
    { x: 12, y: 10 },
    { x: 9, y: 11 },
    { x: 10, y: 11 },
    { x: 11, y: 11 },
  ]);
  deepStrictEqual(reactor.initialCells, [
    { x: 11, y: 9 },
    { x: 12, y: 9 },
    { x: 10, y: 10 },
    { x: 11, y: 10 },
    { x: 11, y: 11 },
  ]);
  deepStrictEqual(frontier.initialCells, [
    { x: 1, y: 10 },
    { x: 2, y: 11 },
    { x: 0, y: 12 },
    { x: 1, y: 12 },
    { x: 2, y: 12 },
  ]);
});

test("create more generates three fresh deterministic templates", () => {
  const first = createMoreOnboardingTemplates("society-more");
  const second = createMoreOnboardingTemplates("society-more");

  strictEqual(first.length, 3);
  deepStrictEqual(first, second);
  strictEqual(new Set(first.map((template) => template.id)).size, 3);
});

test("curated onboarding worlds stay inside a live-first event budget", () => {
  const results = CURATED_ONBOARDING_TEMPLATES.map((template) => ({
    template: template.name,
    result: runSocietySimulation(buildCuratedConfig(template)),
  }));

  const empire = results.find(
    (entry) => entry.template === "Empire Ascent",
  )?.result;
  const reactor = results.find(
    (entry) => entry.template === "Reactor Breach",
  )?.result;
  const frontier = results.find(
    (entry) => entry.template === "Frontier Convoy",
  )?.result;

  results.forEach(({ result }) => {
    ok(result.events.length <= 120);
    strictEqual(result.timeline.length, result.config.ticks + 1);
  });

  ok(empire);
  ok(reactor);
  ok(frontier);
  ok(empire.metrics.births > 0);
  ok(reactor.metrics.deaths > 0);
  ok(frontier.metrics.births > 0);
});

test("agent randomizer is deterministic and stays inside supported archetypes", () => {
  const random = pickRandomAgentChoice("hero-seed");
  const supported = new Set(AGENT_ARCHETYPE_CHOICES.map((choice) => choice.id));

  strictEqual(random.id, pickRandomAgentChoice("hero-seed").id);
  ok(supported.has(random.id));
});

test("agent path helper keeps trace order and appends the current cell", () => {
  const path = buildAgentPath(
    [
      {
        id: "event_1",
        tick: 0,
        agentId: "agent_1",
        action: "genesis",
        cell: { x: 1, y: 1 },
      },
      {
        id: "event_2",
        tick: 1,
        agentId: "agent_1",
        action: "heartbeat",
        cell: { x: 2, y: 1 },
      },
      {
        id: "event_3",
        tick: 2,
        agentId: "agent_1",
        action: "aid",
        cell: { x: 2, y: 2 },
      },
    ],
    "agent_1",
    { x: 3, y: 2 },
  );

  deepStrictEqual(
    path.map((point) => `${point.x},${point.y}`),
    ["1,1", "2,1", "2,2", "3,2"],
  );
});

test("onboarding live window model keeps world pulse and picked agent together", () => {
  const model = buildOnboardingLiveWindowModel({
    frame: {
      tick: 7,
      liveAgents: 5,
      liveCells: 11,
      totalTokens: 94,
      receipts: 13,
      compressedTxs: 2,
      births: [{ x: 1, y: 1 }],
      deaths: [
        { x: 4, y: 5 },
        { x: 5, y: 5 },
      ],
    },
    templateName: "Empire Ascent",
    selectedAgent: {
      id: "agent_hero",
      name: "Juno Relay",
      x: 11,
      y: 9,
      tokens: 27,
      alive: true,
      reputation: 18,
      inheritedReputation: 4,
    },
    visibleEvents: [
      {
        id: "event_3",
        tick: 7,
        action: "inherit",
        agentName: "Juno Relay",
        cell: { x: 11, y: 9 },
      },
      {
        id: "event_2",
        tick: 7,
        action: "death",
        agentName: "Mira Ward",
        cell: { x: 4, y: 5 },
      },
      {
        id: "event_1",
        tick: 6,
        action: "harvest",
        agentName: "Toma Vale",
        cell: { x: 9, y: 8 },
      },
    ],
  });

  strictEqual(model.statusLine, "Empire Ascent running at tick 7");
  deepStrictEqual(
    model.worldMetrics.map((metric) => [metric.label, metric.value]),
    [
      ["Agents", 5],
      ["Squares", 11],
      ["Births", 1],
      ["Deaths", 2],
      ["Receipts", 13],
      ["Tokens", 94],
    ],
  );
  deepStrictEqual(
    model.traceItems.map((item) => item.label),
    ["inherit · Juno Relay", "death · Mira Ward", "harvest · Toma Vale"],
  );
  strictEqual(model.lineSummary?.headline, "Juno Relay at 11,9");
  deepStrictEqual(model.lineSummary?.stats, [
    { label: "Tokens", value: 27 },
    { label: "Trust", value: 18 },
    { label: "Inherited", value: 4 },
    { label: "State", value: "live" },
  ]);
});

test("mission-first onboarding starts by picking a world", () => {
  const model = buildOnboardingMissionModel({
    step: 0,
    template: CURATED_ONBOARDING_TEMPLATES[0],
    selectedArchetypeId: AGENT_ARCHETYPE_CHOICES[0].id,
    selectedAgentEvents: [],
  });

  strictEqual(model.stage, "world");
  strictEqual(model.headline, "Agents need durable memory");
  strictEqual(model.primaryActionLabel, "Next: follow an agent");
  deepStrictEqual(
    model.progressItems.map((item) => [
      item.id,
      item.label,
      item.complete,
      item.current,
    ]),
    [
      ["world", "Choose a world", false, true],
      ["agent", "Follow an agent", false, false],
      ["board", "Open records", false, false],
    ],
  );
});

test("mission-first onboarding never blocks entry", () => {
  const waitingModel = buildOnboardingMissionModel({
    step: 2,
    template: CURATED_ONBOARDING_TEMPLATES[1],
    selectedArchetypeId: AGENT_ARCHETYPE_CHOICES[2].id,
    selectedAgent: {
      id: "agent_hero",
      name: "Juno Relay",
      x: 11,
      y: 9,
      tokens: 27,
      alive: true,
      reputation: 18,
      inheritedReputation: 4,
    },
    selectedAgentEvents: [
      {
        id: "event_0",
        tick: 0,
        action: "genesis",
        agentName: "Juno Relay",
        cell: { x: 11, y: 9 },
      },
    ],
  });

  strictEqual(waitingModel.stage, "board");
  strictEqual(
    waitingModel.primaryActionLabel,
    "Prepare agents and start live world",
  );
  strictEqual(waitingModel.primaryActionDisabled, false);
  strictEqual(waitingModel.observationPending, false);

  const resolvedModel = buildOnboardingMissionModel({
    step: 2,
    template: CURATED_ONBOARDING_TEMPLATES[1],
    selectedArchetypeId: AGENT_ARCHETYPE_CHOICES[2].id,
    selectedAgent: {
      id: "agent_hero",
      name: "Juno Relay",
      x: 11,
      y: 9,
      tokens: 27,
      alive: true,
      reputation: 18,
      inheritedReputation: 4,
    },
    selectedAgentEvents: [
      {
        id: "event_2",
        tick: 7,
        action: "harvest",
        agentName: "Juno Relay",
        cell: { x: 11, y: 9 },
      },
      {
        id: "event_3",
        tick: 8,
        action: "inherit",
        agentName: "Juno Relay",
        cell: { x: 12, y: 9 },
      },
    ],
  });

  strictEqual(
    resolvedModel.primaryActionLabel,
    "Prepare agents and start live world",
  );
  strictEqual(resolvedModel.primaryActionDisabled, false);
  strictEqual(resolvedModel.observationPending, false);
  strictEqual(
    resolvedModel.focusMoment?.title,
    "Juno Relay just carried value forward",
  );
  strictEqual(
    resolvedModel.focusMoment?.whyItMatters,
    "Death does not erase history. Value and trust can continue through a child agent.",
  );
});

test("mission-first onboarding can explain events from any live agent", () => {
  const model = buildOnboardingMissionModel({
    step: 2,
    template: CURATED_ONBOARDING_TEMPLATES[0],
    selectedArchetypeId: AGENT_ARCHETYPE_CHOICES[0].id,
    selectedAgent: {
      id: "agent_hero",
      name: "Elio Root",
      x: 10,
      y: 10,
      tokens: 50,
      alive: true,
      reputation: 2,
      inheritedReputation: 0,
    },
    selectedAgentEvents: [
      {
        id: "event_hero_heartbeat",
        tick: 2,
        action: "heartbeat",
        agentId: "agent_hero",
        agentName: "Elio Root",
        cell: { x: 10, y: 10 },
      },
    ],
    visibleEvents: [
      {
        id: "event_other_aid",
        tick: 2,
        action: "aid",
        agentId: "agent_other",
        agentName: "Orin Root",
        cell: { x: 9, y: 10 },
      },
    ],
  });

  strictEqual(model.primaryActionLabel, "Prepare agents and start live world");
  strictEqual(model.primaryActionDisabled, false);
  strictEqual(
    model.focusMoment?.title,
    "Orin Root just kept another agent alive",
  );
});
