const test = require("node:test");
const { deepStrictEqual, ok, strictEqual } = require("node:assert/strict");

const {
  DEFAULT_SOCIETY_CONFIG,
  advanceLiveSocietySession,
  createDistinctAgentPalette,
  createLiveSocietySession,
  coordinatesFromGrid,
  deserializeLiveSocietySession,
  evolveLifeGrid,
  finalizeLiveSocietySession,
  gridFromCoordinates,
  packLiveSocietyWorldState,
  peekNextSocietyAction,
  restorePackedLiveSocietySession,
  runSocietySimulation,
  serializeLiveSocietySession,
} = require("../../examples/multi_agent/society_core.js");

test("society simulation is deterministic and emits proof-of-life heartbeats", () => {
  const config = {
    ...DEFAULT_SOCIETY_CONFIG,
    agents: 6,
    ticks: 8,
    initialTokens: 48,
    universalIncome: 6,
    livingCost: 4,
    gridSize: 12,
    scenario: "genesis",
    seed: "pi-proof-of-life",
    receiptsPerCompressedTx: 4,
  };

  const first = runSocietySimulation(config);
  const second = runSocietySimulation(config);

  deepStrictEqual(first, second);
  strictEqual(first.timeline.length, config.ticks + 1);
  strictEqual(first.timeline[0].agents.length, config.agents);
  ok(first.events.some((event) => event.action === "heartbeat"));
  ok(first.receipts.some((receipt) => receipt.payload.action === "heartbeat"));
  ok(
    first.receipts.filter((receipt) => receipt.payload.action === "heartbeat")
      .length > 0,
  );
  ok(first.compressedTxs.length > 0);
  ok(
    first.compressedTxs.every(
      (batch) => batch.receipts.length <= config.receiptsPerCompressedTx,
    ),
  );
});

test("Conway evolution does not wrap around board edges", () => {
  const size = 5;
  const initial = gridFromCoordinates(size, [
    { x: 0, y: 0 },
    { x: 4, y: 0 },
    { x: 0, y: 4 },
  ]);

  const evolved = evolveLifeGrid(initial, size);

  strictEqual(
    coordinatesFromGrid(evolved.cells, size).some(
      (cell) => cell.x === 4 && cell.y === 4,
    ),
    false,
  );
});

test("block still-life holds its shape for a tick", () => {
  const block = [
    { x: 2, y: 2 },
    { x: 3, y: 2 },
    { x: 2, y: 3 },
    { x: 3, y: 3 },
  ];
  const result = runSocietySimulation({
    ...DEFAULT_SOCIETY_CONFIG,
    agents: block.length,
    ticks: 1,
    initialTokens: 24,
    universalIncome: 0,
    livingCost: 0,
    birthThreshold: 200,
    gridSize: 8,
    seed: "block-still-life",
    initialCells: block,
  });

  deepStrictEqual(
    coordinatesFromGrid(result.timeline.at(-1).cells, 8).sort(
      (left, right) => left.y - right.y || left.x - right.x,
    ),
    block,
  );
});

test("newborn agents use the same equal endowment as genesis agents", () => {
  const config = {
    ...DEFAULT_SOCIETY_CONFIG,
    agents: 1,
    ticks: 1,
    initialTokens: 40,
    universalIncome: 50,
    livingCost: 0,
    birthThreshold: 80,
    gridSize: 6,
    seed: "equal-births",
    initialCells: [{ x: 2, y: 2 }],
  };

  const result = runSocietySimulation(config);
  const birthEvent = result.events.find((event) => event.action === "birth");
  const child = result.agents.find((agent) => agent.bornTick === 1);

  ok(birthEvent);
  ok(child);
  strictEqual(birthEvent.tokenDelta, config.initialTokens);
  strictEqual(child.startingTokens, config.initialTokens);
  strictEqual(
    result.tokenizedAgents.some((agent) => agent.agentId === child.id),
    true,
  );
});

test("inheritance handoffs move an estate to living descendants", () => {
  const config = {
    ...DEFAULT_SOCIETY_CONFIG,
    agents: 1,
    ticks: 2,
    initialTokens: 40,
    universalIncome: 50,
    livingCost: 0,
    birthThreshold: 80,
    maxAge: 2,
    gridSize: 6,
    seed: "inheritance-chain",
    initialCells: [{ x: 2, y: 2 }],
  };

  const result = runSocietySimulation(config);
  const founder = result.agents.find((agent) => agent.bornTick === 0);
  const child = result.agents.find((agent) => agent.bornTick === 1);
  const inheritEvent =
    child &&
    result.events.find(
      (event) =>
        event.action === "inherit" && event.counterpartyId === child.id,
    );

  ok(founder);
  ok(child);
  ok(inheritEvent);
  strictEqual(founder.alive, false);
  ok(child.tokens > child.startingTokens);
  ok(
    result.receipts.some(
      (receipt) =>
        receipt.kind === "handoff" && receipt.payload.action === "inherit",
    ),
  );
});

test("resource fields regrow and frames keep exact replay state", () => {
  const result = runSocietySimulation({
    ...DEFAULT_SOCIETY_CONFIG,
    agents: 4,
    ticks: 4,
    initialTokens: 48,
    universalIncome: 5,
    livingCost: 4,
    gridSize: 10,
    resourceCap: 7,
    resourceRegrowth: 2,
    seed: "resource-regrowth",
  });

  ok(Array.isArray(result.timeline[0].resources));
  strictEqual(result.timeline[0].resources.length, result.grid.size ** 2);
  ok(
    result.timeline.some(
      (frame, index) =>
        index > 0 &&
        frame.resourceTotal !== result.timeline[index - 1].resourceTotal,
    ),
  );
  deepStrictEqual(result.grid.cells, result.timeline.at(-1).cells);
  deepStrictEqual(result.grid.resources, result.timeline.at(-1).resources);
});

test("agent profiles and graph keep economic identities on top of Conway-style cells", () => {
  const result = runSocietySimulation({
    ...DEFAULT_SOCIETY_CONFIG,
    agents: 3,
    ticks: 2,
    initialTokens: 48,
    universalIncome: 6,
    livingCost: 4,
    gridSize: 8,
    seed: "identity-check",
    initialCells: [
      { x: 2, y: 2 },
      { x: 4, y: 2 },
      { x: 3, y: 4 },
    ],
  });

  const firstAgent = result.agents[0];
  const firstReceipt = result.receipts[0];
  const firstAgentNode = result.graph.nodes.find(
    (node) => node.id === firstAgent.id,
  );
  const validKinds = new Set([
    "assignment",
    "handoff",
    "completion",
    "dispute",
    "dispute_resolved",
    "challenge",
    "challenge_response",
  ]);

  ok(firstAgent.name.length > 0);
  ok(firstAgent.identityId.startsWith("identity_"));
  ok(firstAgent.prompt.includes("prove life"));
  ok(firstAgent.prompt.includes("Conway-style cell"));
  ok(firstAgent.image.startsWith("data:image/svg+xml"));
  strictEqual(firstReceipt.payload.actorIdentityId, firstAgent.identityId);
  strictEqual(firstReceipt.payload.actorPrompt, firstAgent.prompt);
  ok(firstAgentNode);
  strictEqual(firstAgentNode.identityId, firstAgent.identityId);
  ok(result.graph.summary.receipts === result.receipts.length);
  ok(result.receipts.every((receipt) => validKinds.has(receipt.kind)));
});

test("custom starting cells still become the initial occupied board", () => {
  const initialCells = [
    { x: 1, y: 1 },
    { x: 3, y: 1 },
    { x: 2, y: 3 },
  ];
  const result = runSocietySimulation({
    ...DEFAULT_SOCIETY_CONFIG,
    agents: 3,
    ticks: 1,
    initialTokens: 48,
    universalIncome: 6,
    livingCost: 4,
    gridSize: 6,
    initialCells,
    seed: "custom-start-cells",
  });

  deepStrictEqual(
    coordinatesFromGrid(result.timeline[0].cells, 6).sort(
      (left, right) => left.y - right.y || left.x - right.x,
    ),
    initialCells,
  );
  deepStrictEqual(
    result.timeline[0].cells,
    gridFromCoordinates(6, initialCells),
  );
});

test("live society sessions serialize into a compact resumable state", () => {
  const session = createLiveSocietySession({
    ...DEFAULT_SOCIETY_CONFIG,
    agents: 5,
    ticks: 6,
    gridSize: 10,
    seed: "surfpool-authoritative-session",
  });

  while (true) {
    const progressed = advanceLiveSocietySession(session);
    if (!progressed || session.currentTick >= 3) break;
  }

  const serialized = serializeLiveSocietySession(session);
  const restored = deserializeLiveSocietySession(serialized);

  ok(Buffer.byteLength(serialized, "utf8") < 64 * 1024);
  deepStrictEqual(restored.config, session.config);
  deepStrictEqual(restored.resources, session.resources);
  deepStrictEqual(restored.caps, session.caps);
  strictEqual(restored.currentTick, session.currentTick);
  strictEqual(restored.sequence, session.sequence);
  strictEqual(restored.previousReceiptId, session.previousReceiptId);
  strictEqual(restored.allAgents.length, session.allAgents.length);
});

test("packed live world state fits the on-chain budget and resumes exactly", () => {
  const config = {
    ...DEFAULT_SOCIETY_CONFIG,
    agents: 12,
    ticks: 10,
    gridSize: 18,
    scenario: "worldseed",
    seed: "packed-surfpool-world",
  };
  const original = createLiveSocietySession(config);

  while (true) {
    const progressed = advanceLiveSocietySession(original);
    if (!progressed || original.currentTick >= 4) break;
  }

  const packed = packLiveSocietyWorldState(original);
  const restored = restorePackedLiveSocietySession(packed, {
    events: original.events,
    receipts: original.receipts,
    timeline: original.timeline,
  });

  ok(packed.byteLength < 9 * 1024);
  deepStrictEqual(restored.config, original.config);
  deepStrictEqual(restored.resources, original.resources);
  deepStrictEqual(restored.caps, original.caps);
  strictEqual(restored.currentTick, original.currentTick);
  strictEqual(restored.sequence, original.sequence);
  strictEqual(restored.previousReceiptId, original.previousReceiptId);
  strictEqual(restored.allAgents.length, original.allAgents.length);

  while (advanceLiveSocietySession(original)) continue;
  while (advanceLiveSocietySession(restored)) continue;

  deepStrictEqual(
    finalizeLiveSocietySession(restored),
    finalizeLiveSocietySession(original),
  );
});

test("short founder layouts are padded to the requested population", () => {
  const result = runSocietySimulation({
    ...DEFAULT_SOCIETY_CONFIG,
    agents: 6,
    ticks: 1,
    gridSize: 8,
    seed: "founder-padding",
    initialCells: [
      { x: 1, y: 1 },
      { x: 3, y: 1 },
      { x: 2, y: 3 },
      { x: 5, y: 5 },
    ],
  });

  strictEqual(result.timeline[0].agents.length, 6);
  strictEqual(
    new Set(result.timeline[0].agents.map((agent) => `${agent.x},${agent.y}`))
      .size,
    6,
  );
});

test("a chosen hero founder keeps the requested archetype across snapshots", () => {
  const result = runSocietySimulation({
    ...DEFAULT_SOCIETY_CONFIG,
    agents: 4,
    ticks: 2,
    gridSize: 8,
    seed: "hero-founder",
    heroArchetype: "Mutualist",
    initialCells: [
      { x: 1, y: 1 },
      { x: 5, y: 1 },
      { x: 1, y: 5 },
      { x: 5, y: 5 },
    ],
  });

  const openingHero = result.timeline[0].agents.find((agent) => agent.isHero);
  const finalHero = result.agents.find((agent) => agent.isHero);
  const heroNode = result.graph.nodes.find((node) => node.isHero);

  ok(openingHero);
  ok(finalHero);
  ok(heroNode);
  strictEqual(openingHero.archetype, "Mutualist");
  strictEqual(finalHero.archetype, "Mutualist");
  strictEqual(heroNode.archetype, "Mutualist");
});

test("inheritance passes reputation forward with the estate", () => {
  const result = runSocietySimulation({
    ...DEFAULT_SOCIETY_CONFIG,
    agents: 1,
    ticks: 2,
    initialTokens: 40,
    universalIncome: 50,
    livingCost: 0,
    birthThreshold: 80,
    maxAge: 2,
    gridSize: 6,
    seed: "inheritance-reputation",
    initialCells: [{ x: 2, y: 2 }],
  });

  const child = result.agents.find((agent) => agent.bornTick === 1);
  const inheritEvent =
    child &&
    result.events.find(
      (event) =>
        event.action === "inherit" && event.counterpartyId === child.id,
    );

  ok(child);
  ok(inheritEvent);
  ok(child.inheritedTokens > 0);
  ok(child.inheritedReputation > 0);
  strictEqual(
    child.reputation,
    child.earnedReputation + child.inheritedReputation,
  );
  strictEqual(typeof inheritEvent.payloadExtras.reputationAmount, "number");
});

test("worldseed scenario adds seasonal biosphere state to heartbeat receipts", () => {
  const result = runSocietySimulation({
    ...DEFAULT_SOCIETY_CONFIG,
    agents: 6,
    ticks: 8,
    gridSize: 10,
    scenario: "worldseed",
    seed: "worldseed-cycle",
  });

  strictEqual(result.config.scenario, "worldseed");
  strictEqual(result.timeline[0].biosphere.length, result.grid.size ** 2);
  ok(result.timeline.every((frame) => typeof frame.season === "string"));
  ok(
    result.timeline.some(
      (frame, index) =>
        index > 0 && frame.season !== result.timeline[index - 1].season,
    ),
  );
  ok(
    result.timeline.some(
      (frame, index) =>
        index > 0 &&
        frame.biosphereTotal !== result.timeline[index - 1].biosphereTotal,
    ),
  );
  ok(
    result.receipts.some(
      (receipt) =>
        receipt.payload.action === "heartbeat" &&
        typeof receipt.payload.season === "string" &&
        typeof receipt.payload.biosphereDelta === "number",
    ),
  );
});

test("live stepping reaches the same final society result as the full simulation", () => {
  const config = {
    ...DEFAULT_SOCIETY_CONFIG,
    agents: 6,
    ticks: 8,
    initialTokens: 48,
    universalIncome: 6,
    livingCost: 4,
    gridSize: 12,
    scenario: "frontier",
    seed: "live-stepper-parity",
    receiptsPerCompressedTx: 4,
  };

  const session = createLiveSocietySession(config);
  let nextAction = advanceLiveSocietySession(session);

  while (nextAction) {
    nextAction = advanceLiveSocietySession(session);
  }

  const finalized = finalizeLiveSocietySession(session);
  const baseline = runSocietySimulation(config);

  deepStrictEqual(finalized, baseline);
});

test("peeking the next live action does not mutate the confirmed session", () => {
  const config = {
    ...DEFAULT_SOCIETY_CONFIG,
    agents: 4,
    ticks: 4,
    gridSize: 8,
    seed: "peek-no-mutate",
  };

  const session = createLiveSocietySession(config);
  const beforePeek = finalizeLiveSocietySession(session);
  const preview = peekNextSocietyAction(session);
  const afterPeek = finalizeLiveSocietySession(session);

  ok(preview);
  deepStrictEqual(afterPeek, beforePeek);
});

test("agent palette stays deterministic and yields distinct visible colors", () => {
  const agentIds = [
    "agent_1",
    "agent_2",
    "agent_3",
    "agent_4",
    "agent_5",
    "agent_6",
  ];

  const first = createDistinctAgentPalette({
    agentIds,
    configuredAgentCount: 6,
    seed: "palette-check",
  });
  const second = createDistinctAgentPalette({
    agentIds,
    configuredAgentCount: 6,
    seed: "palette-check",
  });

  deepStrictEqual(first, second);
  strictEqual(new Set(Object.values(first)).size, agentIds.length);
  ok(Object.values(first).every((value) => /^hsl\(/.test(value)));
});
