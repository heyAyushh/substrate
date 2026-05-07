(function attachSocietyCore(factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  if (typeof window === "object") {
    window.TrustSubstrateSociety = api;
  }
})(function createSocietyCore() {
  const DEFAULT_GRID_SIZE = 16;
  const DEFAULT_AGENT_COUNT = 8;
  const DEFAULT_TICK_COUNT = 24;
  const DEFAULT_INITIAL_TOKENS = 48;
  const DEFAULT_UNIVERSAL_INCOME = 6;
  const DEFAULT_LIVING_COST = 4;
  const DEFAULT_RESOURCE_CAP = 7;
  const DEFAULT_RESOURCE_REGROWTH = 2;
  const DEFAULT_VISION = 2;
  const DEFAULT_BIRTH_THRESHOLD = 96;
  const DEFAULT_AID_THRESHOLD = 32;
  const DEFAULT_MAX_AGE = 18;
  const DEFAULT_RECEIPTS_PER_COMPRESSED_TX = 6;
  const DEFAULT_SEED = "substrate-society";
  const DEFAULT_SCENARIO = "genesis";
  const DEFAULT_LIFE_DENSITY = 0.34;
  const DEFAULT_SEASON_LENGTH = 3;
  const ONCHAIN_SOCIETY_WORLD_STATE_LIMIT_BYTES = 9 * 1024;

  const MINIMUM_GRID_SIZE = 6;
  const MAXIMUM_GRID_SIZE = 42;
  const MINIMUM_AGENT_COUNT = 1;
  const MAXIMUM_AGENT_COUNT = 40;
  const MINIMUM_TICK_COUNT = 1;
  const MAXIMUM_TICK_COUNT = 160;
  const MINIMUM_TOKEN_BALANCE = 1;
  const MAXIMUM_TOKEN_BALANCE = 1000000;
  const MINIMUM_BATCH_SIZE = 1;
  const MAXIMUM_BATCH_SIZE = 24;
  const MINIMUM_RESOURCE_CAP = 2;
  const MAXIMUM_RESOURCE_CAP = 20;
  const MINIMUM_RESOURCE_REGROWTH = 0;
  const MAXIMUM_RESOURCE_REGROWTH = 10;
  const MINIMUM_VISION = 1;
  const MAXIMUM_VISION = 4;
  const MINIMUM_MAX_AGE = 1;
  const MAXIMUM_MAX_AGE = 120;
  const MINIMUM_STIPEND = 0;
  const MAXIMUM_STIPEND = 1000;
  const MINIMUM_SEASON_LENGTH = 1;
  const MAXIMUM_SEASON_LENGTH = 12;
  const MINIMUM_SPAWN_SPACING = 1;
  const MAXIMUM_SPAWN_SPACING = 4;
  const MINIMUM_SWING = -4;
  const MAXIMUM_SWING = 4;
  const MINIMUM_BIOSPHERE_BOOST = 0;
  const MAXIMUM_BIOSPHERE_BOOST = 6;

  const GENESIS_SLOT = 1000;
  const SLOT_STRIDE = 2;
  const HASH_CHUNK_COUNT = 8;
  const HASH_CHUNK_WIDTH = 8;
  const HASH_SEED_BASE = 2166136261;
  const HASH_PRIME = 16777619;
  const PROFILE_HASH_WIDTH = 8;
  const IDENTITY_HASH_WIDTH = 16;
  const CELL_AGENT_HASH_WIDTH = 12;
  const BIOSPHERE_DENSITY_STEPS = 1000;
  const PACKED_WORLD_STATE_VERSION = 1;
  const ONCHAIN_WORLD_STATE_VERSION = 1;
  const NO_PARENT_AGENT_INDEX = -1;
  const MISSING_HERO_ARCHETYPE_INDEX = -1;
  const COMPACT_AGENT_FLAG_ALIVE = 1 << 0;
  const COMPACT_AGENT_FLAG_HERO = 1 << 1;
  const MAX_ONCHAIN_SOCIETY_WORLD_CHECKPOINT_BYTES = 760;
  const ONCHAIN_AGENT_MODE_RICH = 2;
  const ONCHAIN_AGENT_MODE_LEAN = 1;
  const ONCHAIN_AGENT_MODE_MINIMAL = 0;

  const AVATAR_IMAGE_SIZE = 96;
  const AVATAR_CENTER = AVATAR_IMAGE_SIZE / 2;
  const AVATAR_CORNER_RADIUS = 12;
  const AVATAR_OUTER_RADIUS = 42;
  const AVATAR_INNER_RADIUS = 18;
  const AVATAR_MARK_EDGE = 18;
  const AVATAR_MARK_OPPOSITE_EDGE = AVATAR_IMAGE_SIZE - AVATAR_MARK_EDGE;
  const AVATAR_OUTER_OPACITY = 0.22;
  const AVATAR_MARK_OPACITY = 0.34;
  const AVATAR_INNER_OPACITY = 0.12;
  const AVATAR_STROKE_WIDTH = 1;
  const AVATAR_TEXT_SIZE = 18;
  const AVATAR_TEXT_WEIGHT = 600;
  const AVATAR_TEXT_Y = 57;
  const AVATAR_ROTATION_STEPS = 4;
  const AVATAR_ROTATION_DEGREES = 45;

  const SURVIVAL_MIN = 2;
  const SURVIVAL_MAX = 3;
  const BIRTH_NEIGHBORS = 3;

  const SEASON_STATES = Object.freeze([
    Object.freeze({ name: "Spark", stipendDelta: 1, regrowthDelta: 0 }),
    Object.freeze({ name: "Bloom", stipendDelta: 0, regrowthDelta: 1 }),
    Object.freeze({ name: "Harvest", stipendDelta: 1, regrowthDelta: 0 }),
    Object.freeze({ name: "Frost", stipendDelta: -1, regrowthDelta: -1 }),
  ]);

  const STAKE_EVENT_MARKER = "trust-substrate.stake_event";
  const TOKEN_PROGRAM_AGENT_STAKE = "agent_stake";
  const SOCIETY_TOKEN_OWNER_ID = "society_seed_authority";
  const SOCIETY_SLASH_AUTHORITY_ID = "society_verdict_authority";
  const COMMONS_AGENT_ID = "society_commons";
  const COMMONS_IDENTITY_ID = "identity_society_commons";

  const AGENT_GIVEN_NAMES = Object.freeze([
    "Ada",
    "Byron",
    "Cyra",
    "Dax",
    "Elio",
    "Faye",
    "Ira",
    "Juno",
    "Kian",
    "Lena",
    "Mira",
    "Noor",
    "Orin",
    "Pia",
    "Rune",
    "Sena",
  ]);

  const AGENT_ROLE_NAMES = Object.freeze([
    "Beacon",
    "Vector",
    "Lattice",
    "Signal",
    "Proof",
    "Orbit",
    "Relay",
    "Root",
    "Delta",
    "Quorum",
    "Ledger",
    "Trace",
  ]);

  const AGENT_ARCHETYPES = Object.freeze([
    Object.freeze({
      name: "Forager",
      resourceBias: 4,
      neighborBias: 0,
      aidBias: 1,
      description:
        "Moves first toward rich patches and converts yield into durable balance.",
    }),
    Object.freeze({
      name: "Steward",
      resourceBias: 2,
      neighborBias: 2,
      aidBias: 3,
      description:
        "Stays near the pack, shares surpluses, and preserves local continuity.",
    }),
    Object.freeze({
      name: "Scout",
      resourceBias: 3,
      neighborBias: -1,
      aidBias: 1,
      description:
        "Explores farther lines of sight and breaks ties in favor of frontier cells.",
    }),
    Object.freeze({
      name: "Builder",
      resourceBias: 2,
      neighborBias: 1,
      aidBias: 2,
      description:
        "Compounds wealth into children early and tends to create long family lines.",
    }),
    Object.freeze({
      name: "Mutualist",
      resourceBias: 1,
      neighborBias: 3,
      aidBias: 4,
      description:
        "Keeps the convoy alive by feeding weak neighbors before hoarding excess.",
    }),
  ]);
  const AGENT_ARCHETYPE_NAMES = Object.freeze(
    AGENT_ARCHETYPES.map((archetype) => archetype.name),
  );
  const AGENT_ARCHETYPE_BY_NAME = Object.freeze(
    Object.fromEntries(
      AGENT_ARCHETYPES.map((archetype) => [archetype.name, archetype]),
    ),
  );

  const AVATAR_PALETTE = Object.freeze([
    Object.freeze({ background: "#111111", foreground: "#f5f5f5" }),
    Object.freeze({ background: "#1f1f1f", foreground: "#e5e5e5" }),
    Object.freeze({ background: "#2b2b2b", foreground: "#fafafa" }),
    Object.freeze({ background: "#f4f4f5", foreground: "#18181b" }),
    Object.freeze({ background: "#e5e7eb", foreground: "#111827" }),
    Object.freeze({ background: "#d4d4d8", foreground: "#18181b" }),
  ]);

  const ACTION_KIND = Object.freeze({
    genesis: "assignment",
    heartbeat: "completion",
    birth: "assignment",
    aid: "handoff",
    inherit: "handoff",
    death: "dispute",
  });
  const COMPACT_EVENT_ACTIONS = Object.freeze([
    "genesis",
    "heartbeat",
    "birth",
    "aid",
    "inherit",
    "death",
  ]);

  const GRAPH_NODE_TYPE = Object.freeze({
    task: "task",
    agent: "agent",
    receipt: "receipt",
    batch: "batch",
    stake: "stake",
    commons: "commons",
  });

  const GRAPH_EDGE_TYPE = Object.freeze({
    assigned: "assigned",
    emitted: "emitted",
    next: "next",
    compressedInto: "compressed_into",
    committedBatch: "committed_batch",
    lineageParent: "lineage_parent",
    birthReceipt: "birth_receipt",
    tokenizedInto: "tokenized_into",
    stakeSeed: "stake_seed",
    transferTo: "transfer_to",
  });

  const TRUST_SUBSTRATE_PROGRAMS = Object.freeze([
    {
      name: "identity_registry",
      role: "agent identity account",
    },
    {
      name: "task_registry",
      role: "simulation task account and task status",
    },
    {
      name: "receipt_emitter",
      role: "append-only batch receipt account",
    },
    {
      name: "reputation_accumulator",
      role: "society domain catalog entry",
    },
    {
      name: TOKEN_PROGRAM_AGENT_STAKE,
      role: "per-agent starting token account",
    },
  ]);

  const SCENARIO_PRESETS = Object.freeze({
    genesis: Object.freeze({
      universalIncome: 6,
      livingCost: 4,
      resourceCap: 7,
      resourceRegrowth: 2,
      vision: 2,
      birthThreshold: 96,
      aidThreshold: 36,
      maxAge: 18,
      lifeDensity: 0.36,
      initialResourceFill: 0.72,
      peakCount: 3,
      seasonLength: 3,
      stipendSwing: 1,
      regrowthSwing: 1,
      biosphereBoost: 1,
      spawnSpacing: 2,
    }),
    frontier: Object.freeze({
      universalIncome: 7,
      livingCost: 6,
      resourceCap: 9,
      resourceRegrowth: 2,
      vision: 3,
      birthThreshold: 88,
      aidThreshold: 24,
      maxAge: 14,
      lifeDensity: 0.24,
      initialResourceFill: 0.58,
      peakCount: 4,
      seasonLength: 2,
      stipendSwing: 1,
      regrowthSwing: 1,
      biosphereBoost: 0,
      spawnSpacing: 1,
    }),
    convoy: Object.freeze({
      universalIncome: 5,
      livingCost: 6,
      resourceCap: 6,
      resourceRegrowth: 1,
      vision: 2,
      birthThreshold: 104,
      aidThreshold: 18,
      maxAge: 16,
      lifeDensity: 0.28,
      initialResourceFill: 0.68,
      peakCount: 3,
      seasonLength: 2,
      stipendSwing: 0,
      regrowthSwing: 1,
      biosphereBoost: 1,
      spawnSpacing: 2,
    }),
    dynasty: Object.freeze({
      universalIncome: 6,
      livingCost: 4,
      resourceCap: 8,
      resourceRegrowth: 2,
      vision: 2,
      birthThreshold: 90,
      aidThreshold: 28,
      maxAge: 22,
      lifeDensity: 0.44,
      initialResourceFill: 0.78,
      peakCount: 4,
      seasonLength: 4,
      stipendSwing: 1,
      regrowthSwing: 1,
      biosphereBoost: 2,
      spawnSpacing: 2,
    }),
    worldseed: Object.freeze({
      universalIncome: 6,
      livingCost: 5,
      resourceCap: 8,
      resourceRegrowth: 1,
      vision: 3,
      birthThreshold: 92,
      aidThreshold: 22,
      maxAge: 18,
      lifeDensity: 0.52,
      initialResourceFill: 0.64,
      peakCount: 5,
      seasonLength: 2,
      stipendSwing: 1,
      regrowthSwing: 2,
      biosphereBoost: 2,
      spawnSpacing: 2,
    }),
  });
  const SCENARIO_NAMES = Object.freeze(Object.keys(SCENARIO_PRESETS));

  const DEFAULT_SOCIETY_CONFIG = Object.freeze({
    agents: DEFAULT_AGENT_COUNT,
    ticks: DEFAULT_TICK_COUNT,
    initialTokens: DEFAULT_INITIAL_TOKENS,
    universalIncome: DEFAULT_UNIVERSAL_INCOME,
    livingCost: DEFAULT_LIVING_COST,
    gridSize: DEFAULT_GRID_SIZE,
    resourceCap: DEFAULT_RESOURCE_CAP,
    resourceRegrowth: DEFAULT_RESOURCE_REGROWTH,
    birthThreshold: DEFAULT_BIRTH_THRESHOLD,
    aidThreshold: DEFAULT_AID_THRESHOLD,
    vision: DEFAULT_VISION,
    maxAge: DEFAULT_MAX_AGE,
    lifeDensity: DEFAULT_LIFE_DENSITY,
    scenario: DEFAULT_SCENARIO,
    receiptsPerCompressedTx: DEFAULT_RECEIPTS_PER_COMPRESSED_TX,
    seed: DEFAULT_SEED,
    seasonLength: DEFAULT_SEASON_LENGTH,
    stipendSwing: 0,
    regrowthSwing: 0,
    biosphereBoost: 0,
    spawnSpacing: 2,
    heroArchetype: undefined,
  });

  const clampInteger = (value, min, max, fallback) => {
    const number = Number.parseInt(String(value), 10);
    if (!Number.isFinite(number)) return fallback;
    return Math.min(Math.max(number, min), max);
  };

  const clampFloat = (value, min, max, fallback) => {
    const number = Number.parseFloat(String(value));
    if (!Number.isFinite(number)) return fallback;
    return Math.min(Math.max(number, min), max);
  };

  const stableStringify = (value) => {
    if (value === null || typeof value !== "object") {
      return JSON.stringify(value);
    }
    if (Array.isArray(value)) {
      return `[${value.map(stableStringify).join(",")}]`;
    }
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(",")}}`;
  };

  const textEncoder = new TextEncoder();
  const textDecoder = new TextDecoder();

  const encodeUtf8 = (value) => textEncoder.encode(value);

  const decodeUtf8 = (value) =>
    textDecoder.decode(
      value instanceof Uint8Array ? value : new Uint8Array(value || []),
    );

  const encodeBase64Bytes = (value) => {
    if (typeof Buffer === "function") {
      return Buffer.from(value).toString("base64");
    }
    let binary = "";
    for (const byte of value) {
      binary += String.fromCharCode(byte);
    }
    return btoa(binary);
  };

  const decodeBase64Bytes = (value) => {
    if (!value) return new Uint8Array();
    if (typeof Buffer === "function") {
      return Uint8Array.from(Buffer.from(value, "base64"));
    }
    const binary = atob(value);
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
  };

  const packBooleanBitset = (values) => {
    const bytes = new Uint8Array(Math.ceil(values.length / 8));
    values.forEach((entry, index) => {
      if (!entry) return;
      bytes[index >> 3] |= 1 << (index & 7);
    });
    return bytes;
  };

  const unpackBooleanBitset = (bytes, length) =>
    Array.from({ length }, (_, index) => {
      const bucket = bytes[index >> 3] || 0;
      return Boolean(bucket & (1 << (index & 7)));
    });

  const hashHex = (value) => {
    const text = stableStringify(value);
    const chunks = [];
    for (let chunk = 0; chunk < HASH_CHUNK_COUNT; chunk += 1) {
      let hash = (HASH_SEED_BASE + chunk) >>> 0;
      for (let index = 0; index < text.length; index += 1) {
        hash ^= text.charCodeAt(index) + chunk;
        hash = Math.imul(hash, HASH_PRIME) >>> 0;
      }
      chunks.push(hash.toString(16).padStart(HASH_CHUNK_WIDTH, "0"));
    }
    return chunks.join("");
  };

  const hashIndex = (value, length) =>
    Number.parseInt(hashHex(value).slice(0, PROFILE_HASH_WIDTH), 16) % length;

  const makeRng = (seed) => {
    let state = Number.parseInt(hashHex(seed).slice(0, 8), 16) >>> 0;
    return () => {
      state = (state + 0x6d2b79f5) >>> 0;
      let value = state;
      value = Math.imul(value ^ (value >>> 15), value | 1);
      value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
      return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
  };

  const pickProfileValue = (values, value) =>
    values[hashIndex(value, values.length)];

  const isInsideBoard = (x, y, size) =>
    x >= 0 && x < size && y >= 0 && y < size;

  const indexFor = (x, y, size) => {
    const wrappedX = (x + size) % size;
    const wrappedY = (y + size) % size;
    return wrappedY * size + wrappedX;
  };

  const gridFromCoordinates = (size, coordinates) => {
    const grid = new Array(size * size).fill(false);
    for (const coordinate of coordinates || []) {
      const x = clampInteger(coordinate && coordinate.x, 0, size - 1, 0);
      const y = clampInteger(coordinate && coordinate.y, 0, size - 1, 0);
      grid[indexFor(x, y, size)] = true;
    }
    return grid;
  };

  const coordinatesFromGrid = (grid, size) => {
    const coordinates = [];
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        if (grid[indexFor(x, y, size)]) coordinates.push({ x, y });
      }
    }
    return coordinates;
  };

  const countLiveNeighbors = (grid, size, x, y) => {
    let total = 0;
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (dx === 0 && dy === 0) continue;
        const neighborX = x + dx;
        const neighborY = y + dy;
        if (!isInsideBoard(neighborX, neighborY, size)) continue;
        if (grid[indexFor(neighborX, neighborY, size)]) total += 1;
      }
    }
    return total;
  };

  const evolveLifeGrid = (grid, size) => {
    const next = new Array(grid.length).fill(false);
    const births = [];
    const deaths = [];
    const survivors = [];
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const index = indexFor(x, y, size);
        const neighbors = countLiveNeighbors(grid, size, x, y);
        const isAlive = grid[index];
        const staysAlive = isAlive
          ? neighbors >= SURVIVAL_MIN && neighbors <= SURVIVAL_MAX
          : neighbors === BIRTH_NEIGHBORS;
        next[index] = staysAlive;
        if (!isAlive && staysAlive) births.push({ x, y });
        if (isAlive && !staysAlive) deaths.push({ x, y });
        if (isAlive && staysAlive) survivors.push({ x, y });
      }
    }
    return { cells: next, births, deaths, survivors };
  };

  const cellKey = (cell) => `${cell.x},${cell.y}`;

  const sanitizeInitialCells = (input, size) => {
    if (!Array.isArray(input && input.initialCells)) return undefined;
    const seen = new Set();
    return input.initialCells
      .map((cell) => ({
        x: clampInteger(cell && cell.x, 0, size - 1, 0),
        y: clampInteger(cell && cell.y, 0, size - 1, 0),
      }))
      .filter((cell) => {
        const key = cellKey(cell);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  };

  const normalizeScenario = (input) => {
    const raw =
      (input && (input.scenario || input.initialMode)) || DEFAULT_SCENARIO;
    if (raw === "chaos") return "frontier";
    if (raw === "seeded") return "genesis";
    return Object.prototype.hasOwnProperty.call(SCENARIO_PRESETS, raw)
      ? raw
      : DEFAULT_SCENARIO;
  };

  const normalizeActionSource = (input) => {
    const source =
      input && input.actionSource && typeof input.actionSource === "object"
        ? input.actionSource
        : {};
    const kind =
      source.kind === "pi-agent" ||
      source.kind === "pi-llm" ||
      source.kind === "external"
        ? source.kind
        : "simulation";
    const fallbackDriver =
      kind === "pi-agent" || kind === "pi-llm"
        ? `${kind}-driver`
        : "society-board-deterministic-driver";

    return {
      kind,
      driver:
        typeof source.driver === "string" && source.driver.trim().length > 0
          ? source.driver.trim()
          : fallbackDriver,
      ...(typeof source.runtimeSessionId === "string"
        ? { runtimeSessionId: source.runtimeSessionId }
        : {}),
      ...(typeof source.modelId === "string"
        ? { modelId: source.modelId }
        : {}),
      ...(typeof source.note === "string" ? { note: source.note } : {}),
    };
  };

  const normalizeConfig = (input) => {
    const gridSize = clampInteger(
      input && input.gridSize,
      MINIMUM_GRID_SIZE,
      MAXIMUM_GRID_SIZE,
      DEFAULT_GRID_SIZE,
    );
    const scenario = normalizeScenario(input);
    const scenarioDefaults = SCENARIO_PRESETS[scenario];

    const requestedHeroArchetype =
      input && typeof input.heroArchetype === "string"
        ? AGENT_ARCHETYPES.find(
            (candidate) => candidate.name === input.heroArchetype,
          )
        : undefined;

    return {
      agents: clampInteger(
        input && input.agents,
        MINIMUM_AGENT_COUNT,
        MAXIMUM_AGENT_COUNT,
        DEFAULT_AGENT_COUNT,
      ),
      ticks: clampInteger(
        input && input.ticks,
        MINIMUM_TICK_COUNT,
        MAXIMUM_TICK_COUNT,
        DEFAULT_TICK_COUNT,
      ),
      initialTokens: clampInteger(
        input && input.initialTokens,
        MINIMUM_TOKEN_BALANCE,
        MAXIMUM_TOKEN_BALANCE,
        DEFAULT_INITIAL_TOKENS,
      ),
      universalIncome: clampInteger(
        input && input.universalIncome,
        MINIMUM_STIPEND,
        MAXIMUM_STIPEND,
        scenarioDefaults.universalIncome,
      ),
      livingCost: clampInteger(
        input && input.livingCost,
        MINIMUM_STIPEND,
        MAXIMUM_STIPEND,
        scenarioDefaults.livingCost,
      ),
      gridSize,
      resourceCap: clampInteger(
        input && input.resourceCap,
        MINIMUM_RESOURCE_CAP,
        MAXIMUM_RESOURCE_CAP,
        scenarioDefaults.resourceCap,
      ),
      resourceRegrowth: clampInteger(
        input && input.resourceRegrowth,
        MINIMUM_RESOURCE_REGROWTH,
        MAXIMUM_RESOURCE_REGROWTH,
        scenarioDefaults.resourceRegrowth,
      ),
      birthThreshold: clampInteger(
        input && input.birthThreshold,
        MINIMUM_TOKEN_BALANCE,
        MAXIMUM_TOKEN_BALANCE,
        scenarioDefaults.birthThreshold,
      ),
      aidThreshold: clampInteger(
        input && input.aidThreshold,
        0,
        MAXIMUM_TOKEN_BALANCE,
        scenarioDefaults.aidThreshold,
      ),
      vision: clampInteger(
        input && input.vision,
        MINIMUM_VISION,
        MAXIMUM_VISION,
        scenarioDefaults.vision,
      ),
      maxAge: clampInteger(
        input && input.maxAge,
        MINIMUM_MAX_AGE,
        MAXIMUM_MAX_AGE,
        scenarioDefaults.maxAge,
      ),
      lifeDensity: clampFloat(
        input && input.lifeDensity,
        0,
        1,
        DEFAULT_LIFE_DENSITY,
      ),
      scenario,
      initialMode: scenario,
      receiptsPerCompressedTx: clampInteger(
        input && input.receiptsPerCompressedTx,
        MINIMUM_BATCH_SIZE,
        MAXIMUM_BATCH_SIZE,
        DEFAULT_RECEIPTS_PER_COMPRESSED_TX,
      ),
      seed: String((input && input.seed) || DEFAULT_SEED),
      initialCells: sanitizeInitialCells(input, gridSize),
      initialResourceFill: scenarioDefaults.initialResourceFill,
      peakCount: scenarioDefaults.peakCount,
      seasonLength: clampInteger(
        input && input.seasonLength,
        MINIMUM_SEASON_LENGTH,
        MAXIMUM_SEASON_LENGTH,
        scenarioDefaults.seasonLength,
      ),
      stipendSwing: clampInteger(
        input && input.stipendSwing,
        MINIMUM_SWING,
        MAXIMUM_SWING,
        scenarioDefaults.stipendSwing,
      ),
      regrowthSwing: clampInteger(
        input && input.regrowthSwing,
        MINIMUM_SWING,
        MAXIMUM_SWING,
        scenarioDefaults.regrowthSwing,
      ),
      biosphereBoost: clampInteger(
        input && input.biosphereBoost,
        MINIMUM_BIOSPHERE_BOOST,
        MAXIMUM_BIOSPHERE_BOOST,
        scenarioDefaults.biosphereBoost,
      ),
      spawnSpacing: clampInteger(
        input && input.spawnSpacing,
        MINIMUM_SPAWN_SPACING,
        MAXIMUM_SPAWN_SPACING,
        scenarioDefaults.spawnSpacing,
      ),
      heroArchetype: requestedHeroArchetype && requestedHeroArchetype.name,
      actionSource: normalizeActionSource(input),
    };
  };

  const restoreSerializedConfig = (input) => {
    const normalized = normalizeConfig(input);
    return {
      ...normalized,
      ...input,
      initialCells: sanitizeInitialCells(input, normalized.gridSize),
      heroArchetype:
        typeof input?.heroArchetype === "string"
          ? normalized.heroArchetype
          : undefined,
    };
  };

  const initialsForName = (name) =>
    name
      .split(" ")
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();

  const createAgentName = ({ id, cell, generation }) => {
    const givenName = pickProfileValue(AGENT_GIVEN_NAMES, {
      id,
      cell,
      generation,
      field: "given",
    });
    const roleName = pickProfileValue(AGENT_ROLE_NAMES, {
      id,
      cell,
      generation,
      field: "role",
    });
    return `${givenName} ${roleName}`;
  };

  const createAgentIdentityId = ({ id, config }) =>
    `identity_${hashHex({
      seed: config.seed,
      agentId: id,
      field: "identity",
    }).slice(0, IDENTITY_HASH_WIDTH)}`;

  const createAgentArchetype = ({ id, cell, generation }) =>
    pickProfileValue(AGENT_ARCHETYPES, {
      id,
      cell,
      generation,
      field: "archetype",
    });

  const createAgentPrompt = ({
    name,
    identityId,
    generation,
    parentIds,
    archetype,
    config,
  }) =>
    [
      `You are ${name}.`,
      `Identity: ${identityId}.`,
      `Archetype: ${archetype.name}.`,
      `Generation: ${generation}.`,
      `You prove life on Solana every tick by holding a Conway-style cell, harvesting local resources, accepting the universal stipend of ${config.universalIncome}, and paying the living cost of ${config.livingCost}.`,
      `Respect the convoy constraints: equal birth endowment, continuous upkeep, and finite land with regrowing resources.`,
      parentIds.length > 0
        ? `You carry inheritance ties to ${parentIds.join(", ")}.`
        : "You are a genesis agent with the same birth endowment as every future child.",
      archetype.description,
    ].join(" ");

  const createAgentImage = ({ name, identityId, cell, generation }) => {
    const palette = pickProfileValue(AVATAR_PALETTE, {
      identityId,
      cell,
      generation,
    });
    const initials = initialsForName(name);
    const markRotation =
      hashIndex({ identityId, field: "rotation" }, AVATAR_ROTATION_STEPS) *
      AVATAR_ROTATION_DEGREES;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${AVATAR_IMAGE_SIZE}" height="${AVATAR_IMAGE_SIZE}" viewBox="0 0 ${AVATAR_IMAGE_SIZE} ${AVATAR_IMAGE_SIZE}" role="img" aria-label="${name}"><rect width="${AVATAR_IMAGE_SIZE}" height="${AVATAR_IMAGE_SIZE}" rx="${AVATAR_CORNER_RADIUS}" fill="${palette.background}"/><circle cx="${AVATAR_CENTER}" cy="${AVATAR_CENTER}" r="${AVATAR_OUTER_RADIUS}" fill="none" stroke="${palette.foreground}" stroke-opacity="${AVATAR_OUTER_OPACITY}" stroke-width="${AVATAR_STROKE_WIDTH}"/><path d="M${AVATAR_CENTER} ${AVATAR_MARK_EDGE} L${AVATAR_MARK_OPPOSITE_EDGE} ${AVATAR_CENTER} L${AVATAR_CENTER} ${AVATAR_MARK_OPPOSITE_EDGE} L${AVATAR_MARK_EDGE} ${AVATAR_CENTER} Z" fill="none" stroke="${palette.foreground}" stroke-opacity="${AVATAR_MARK_OPACITY}" stroke-width="${AVATAR_STROKE_WIDTH}" transform="rotate(${markRotation} ${AVATAR_CENTER} ${AVATAR_CENTER})"/><circle cx="${AVATAR_CENTER}" cy="${AVATAR_CENTER}" r="${AVATAR_INNER_RADIUS}" fill="${palette.foreground}" fill-opacity="${AVATAR_INNER_OPACITY}"/><text x="${AVATAR_CENTER}" y="${AVATAR_TEXT_Y}" text-anchor="middle" font-family="Arial, sans-serif" font-size="${AVATAR_TEXT_SIZE}" font-weight="${AVATAR_TEXT_WEIGHT}" fill="${palette.foreground}">${initials}</text></svg>`;
    return `data:image/svg+xml,${encodeURIComponent(svg)}`;
  };

  const createDistinctAgentPalette = ({
    agentIds,
    configuredAgentCount,
    seed,
  }) => {
    const orderedAgentIds = [];
    const seen = new Set();
    for (const agentId of agentIds || []) {
      if (!agentId || seen.has(agentId)) continue;
      seen.add(agentId);
      orderedAgentIds.push(agentId);
    }

    const paletteSize = Math.max(
      MINIMUM_AGENT_COUNT,
      clampInteger(
        configuredAgentCount,
        MINIMUM_AGENT_COUNT,
        MAXIMUM_AGENT_COUNT,
        DEFAULT_AGENT_COUNT,
      ),
      orderedAgentIds.length,
    );
    const baseHue =
      hashIndex(
        {
          seed: seed || DEFAULT_SEED,
          paletteSize,
          field: "agent-palette",
        },
        3600,
      ) / 10;
    const hueStep = 360 / paletteSize;

    return orderedAgentIds.reduce((palette, agentId, index) => {
      const hue =
        index < paletteSize
          ? (baseHue + hueStep * index) % 360
          : (baseHue +
              hueStep * paletteSize +
              (index - paletteSize) * 137.508) %
            360;
      palette[agentId] = `hsl(${hue.toFixed(1)} 72% 64%)`;
      return palette;
    }, {});
  };

  const createCellAgent = ({
    config,
    cell,
    bornTick,
    tokens,
    parentIds = [],
    generation = 0,
    forcedArchetype,
    isHero = false,
  }) => {
    const id = `cell_${hashHex({
      seed: config.seed,
      bornTick,
      cell,
      parentIds,
    }).slice(0, CELL_AGENT_HASH_WIDTH)}`;
    const identityId = createAgentIdentityId({ id, config });
    const name = createAgentName({ id, cell, generation });
    const archetype =
      forcedArchetype &&
      AGENT_ARCHETYPES.find((candidate) => candidate.name === forcedArchetype)
        ? AGENT_ARCHETYPES.find(
            (candidate) => candidate.name === forcedArchetype,
          )
        : createAgentArchetype({ id, cell, generation });
    const prompt = createAgentPrompt({
      name,
      identityId,
      generation,
      parentIds,
      archetype,
      config,
    });
    const image = createAgentImage({ name, identityId, cell, generation });

    return {
      id,
      identityId,
      name,
      prompt,
      image,
      imageAlt: `${name} agent avatar`,
      archetype: archetype.name,
      isHero,
      tokens,
      startingTokens: tokens,
      originX: cell.x,
      originY: cell.y,
      x: cell.x,
      y: cell.y,
      alive: true,
      score: 0,
      receipts: 0,
      bornTick,
      lastTick: bornTick,
      age: 0,
      livenessProofs: 0,
      descendants: 0,
      generation,
      parentIds,
      childrenIds: [],
      harvestTotal: 0,
      aidGiven: 0,
      aidReceived: 0,
      inheritedTokens: 0,
      earnedReputation: 0,
      inheritedReputation: 0,
      reputation: 0,
    };
  };

  const calculateReputation = (agent) =>
    agent.earnedReputation + agent.inheritedReputation;

  const calculateScore = (agent) =>
    agent.reputation + Math.floor(agent.tokens / 12);

  const distance = (left, right) =>
    Math.abs(left.x - right.x) + Math.abs(left.y - right.y);

  const isMooreAdjacent = (left, right) =>
    Math.max(Math.abs(left.x - right.x), Math.abs(left.y - right.y)) === 1;

  const createPeakMap = (config, rng) => {
    const peaks = [];
    for (let index = 0; index < config.peakCount; index += 1) {
      peaks.push({
        x: Math.floor(rng() * config.gridSize),
        y: Math.floor(rng() * config.gridSize),
        strength: config.resourceCap,
        reach: clampInteger(
          Math.round(config.gridSize / 3 + rng() * (config.gridSize / 4)),
          2,
          config.gridSize,
          4,
        ),
      });
    }
    return peaks;
  };

  const createResourceCaps = (config, rng) => {
    const peaks = createPeakMap(config, rng);
    const caps = new Array(config.gridSize * config.gridSize).fill(1);

    for (let y = 0; y < config.gridSize; y += 1) {
      for (let x = 0; x < config.gridSize; x += 1) {
        const peakValue = peaks.reduce((best, peak) => {
          const dist = distance({ x, y }, peak);
          const contribution = Math.max(
            1,
            peak.strength - Math.floor((dist * peak.strength) / peak.reach),
          );
          return Math.max(best, contribution);
        }, 1);
        const noise = hashIndex(
          { x, y, seed: config.seed, field: "resource-noise" },
          3,
        );
        caps[indexFor(x, y, config.gridSize)] = clampInteger(
          peakValue + noise,
          1,
          config.resourceCap,
          1,
        );
      }
    }

    return caps;
  };

  const createResources = (config, caps) =>
    caps.map((cap, index) => {
      const bias = hashIndex(
        { seed: config.seed, index, field: "resource-fill" },
        3,
      );
      return clampInteger(
        Math.round(cap * config.initialResourceFill) + bias - 1,
        0,
        cap,
        cap,
      );
    });

  const allCoordinates = (size) => {
    const coordinates = [];
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        coordinates.push({ x, y });
      }
    }
    return coordinates;
  };

  const rankInitialCells = (config, caps, rng) =>
    allCoordinates(config.gridSize)
      .map((cell) => ({
        cell,
        score:
          caps[indexFor(cell.x, cell.y, config.gridSize)] * 10 +
          Math.floor(rng() * 6),
      }))
      .sort((left, right) => right.score - left.score);

  const fillFounderCells = (chosen, ranked, config) => {
    const desiredSpacing = Math.max(
      MINIMUM_SPAWN_SPACING,
      config.spawnSpacing || MINIMUM_SPAWN_SPACING,
    );

    for (let index = 0; index < ranked.length; index += 1) {
      if (chosen.length >= config.agents) break;
      const candidate = ranked[index].cell;
      if (chosen.some((cell) => cellKey(cell) === cellKey(candidate))) {
        continue;
      }
      const crowded = chosen.some(
        (cell) => distance(cell, candidate) < desiredSpacing,
      );
      const remainingCandidates = ranked.length - index;
      const remainingSlots = config.agents - chosen.length;
      if (crowded && remainingCandidates > remainingSlots) continue;
      chosen.push(candidate);
    }

    if (chosen.length < config.agents) {
      for (const candidate of ranked) {
        if (chosen.length >= config.agents) break;
        if (chosen.some((cell) => cellKey(cell) === cellKey(candidate.cell))) {
          continue;
        }
        chosen.push(candidate.cell);
      }
    }

    return chosen.slice(0, config.agents);
  };

  const chooseInitialCells = (config, caps, rng) => {
    const ranked = rankInitialCells(config, caps, rng);
    const chosen = config.initialCells
      ? config.initialCells.slice(0, config.agents)
      : [];
    return fillFounderCells(chosen, ranked, config);
  };

  const liveAgents = (agents) => agents.filter((agent) => agent.alive);

  const mapLiveAgentsByCell = (agents) =>
    new Map(
      liveAgents(agents).map((agent) => [
        cellKey({ x: agent.x, y: agent.y }),
        agent,
      ]),
    );

  const createOccupancyGrid = (agents, size) =>
    gridFromCoordinates(
      size,
      liveAgents(agents).map((agent) => ({ x: agent.x, y: agent.y })),
    );

  const orthogonalSight = (agent, config) => {
    const seen = new Set([cellKey(agent)]);
    const candidates = [{ x: agent.x, y: agent.y }];
    const directions = [
      { x: 1, y: 0 },
      { x: -1, y: 0 },
      { x: 0, y: 1 },
      { x: 0, y: -1 },
    ];

    for (const direction of directions) {
      for (let step = 1; step <= config.vision; step += 1) {
        const cell = {
          x: (agent.x + direction.x * step + config.gridSize) % config.gridSize,
          y: (agent.y + direction.y * step + config.gridSize) % config.gridSize,
        };
        const key = cellKey(cell);
        if (seen.has(key)) continue;
        seen.add(key);
        candidates.push(cell);
      }
    }

    return candidates;
  };

  const countNearbyAgents = (cell, agents) =>
    agents.reduce((total, agent) => {
      if (!agent.alive) return total;
      return total + (distance(cell, agent) === 1 ? 1 : 0);
    }, 0);

  const chooseTargetCell = ({
    agent,
    allAgents,
    occupiedAtStart,
    claimed,
    resources,
    caps,
    config,
  }) => {
    const archetype = AGENT_ARCHETYPES.find(
      (candidate) => candidate.name === agent.archetype,
    );
    const candidates = orthogonalSight(agent, config);
    let bestCell = { x: agent.x, y: agent.y };
    let bestScore = -Infinity;

    for (const cell of candidates) {
      const key = cellKey(cell);
      const occupied = occupiedAtStart.get(key);
      if (claimed.has(key)) continue;
      if (occupied && occupied.id !== agent.id) continue;

      const index = indexFor(cell.x, cell.y, config.gridSize);
      const resource = resources[index];
      const cap = caps[index];
      const dist = distance(cell, agent);
      const neighbors = countNearbyAgents(cell, allAgents);
      const tieBreak =
        hashIndex(
          {
            tick: agent.lastTick + 1,
            agentId: agent.id,
            cell,
            field: "candidate",
          },
          100,
        ) / 1000;
      const score =
        resource * (archetype.resourceBias + 4) +
        cap * 2 +
        neighbors * archetype.neighborBias -
        dist * 3 +
        tieBreak;

      if (score > bestScore) {
        bestScore = score;
        bestCell = cell;
      }
    }

    return bestCell;
  };

  const createEvent = ({
    tick,
    agent,
    action,
    tokenDelta,
    cell,
    counterpartyId,
    parentIds,
    note,
    payloadExtras,
  }) => ({
    id: `event_${hashHex({
      tick,
      agentId: agent.id,
      action,
      tokenDelta,
      cell,
      counterpartyId,
      parentIds,
      note,
      payloadExtras,
    }).slice(0, 16)}`,
    tick,
    agentId: agent.id,
    agentName: agent.name,
    actorIdentityId: agent.identityId,
    actorPrompt: agent.prompt,
    actorImage: agent.image,
    action,
    receiptKind: ACTION_KIND[action],
    tokenDelta,
    cell,
    counterpartyId,
    parentIds: parentIds || [],
    parentCoordinates: (parentIds || []).map(() => ({
      x: agent.x,
      y: agent.y,
    })),
    note,
    payloadExtras: payloadExtras || {},
  });

  const isStartingTokenEvent = (event) =>
    (event.action === "genesis" || event.action === "birth") &&
    event.tokenDelta > 0;

  const createStartingStakeEvents = (event) => {
    if (!isStartingTokenEvent(event)) return [];
    const common = {
      type: STAKE_EVENT_MARKER,
      identityId: event.agentId,
      ownerId: SOCIETY_TOKEN_OWNER_ID,
      slashAuthorityId: SOCIETY_SLASH_AUTHORITY_ID,
    };
    return [
      {
        ...common,
        eventId: `stake_event_${hashHex({
          eventId: event.id,
          kind: "initialized",
        }).slice(0, 16)}`,
        kind: "initialized",
      },
      {
        ...common,
        eventId: `stake_event_${hashHex({
          eventId: event.id,
          kind: "deposited",
          amountLamports: event.tokenDelta,
        }).slice(0, 16)}`,
        kind: "deposited",
        amountLamports: String(event.tokenDelta),
      },
    ];
  };

  const createReceipt = (event, sequence, previousReceiptId) => {
    const stakeEvents = createStartingStakeEvents(event);
    const payload = {
      domain: "society",
      eventId: event.id,
      action: event.action,
      tokenDelta: event.tokenDelta,
      actorIdentityId: event.actorIdentityId,
      actorPrompt: event.actorPrompt,
      actorImage: event.actorImage,
      cell: event.cell,
      counterpartyId: event.counterpartyId,
      parentIds: event.parentIds,
      parentCoordinates: event.parentCoordinates,
      note: event.note,
      ...event.payloadExtras,
      ...(stakeEvents.length > 0 ? { stakeEvents } : {}),
    };
    const payloadHash = hashHex(payload);

    return {
      receiptId: `receipt_${hashHex({ event, sequence }).slice(0, 32)}`,
      slot: GENESIS_SLOT + sequence * SLOT_STRIDE,
      sequence,
      actorId: event.agentId,
      actorName: event.agentName,
      taskId: "task_society_pi_life",
      kind: event.receiptKind,
      domain: "society",
      previousReceiptId,
      payloadHash,
      payload,
    };
  };

  const createGenesisEvents = (agents, config) =>
    agents.map((agent) =>
      createEvent({
        tick: 0,
        agent,
        action: "genesis",
        tokenDelta: agent.tokens,
        cell: { x: agent.x, y: agent.y },
        note: `seeded with an equal birth endowment of ${config.initialTokens}`,
        payloadExtras: {
          archetype: agent.archetype,
          age: agent.age,
        },
      }),
    );

  const createHeartbeatEvent = ({
    tick,
    agent,
    tokenDelta,
    harvested,
    resourceBefore,
    resourceAfter,
    movedFrom,
    stipend,
    upkeep,
    season,
    biosphereDelta,
    biosphereTotal,
  }) =>
    createEvent({
      tick,
      agent,
      action: "heartbeat",
      tokenDelta,
      cell: { x: agent.x, y: agent.y },
      note: `proved life after harvesting ${harvested}, stipend ${stipend}, upkeep ${upkeep}`,
      payloadExtras: {
        archetype: agent.archetype,
        age: agent.age,
        movedFrom,
        harvested,
        stipend,
        upkeep,
        resourceBefore,
        resourceAfter,
        endingTokens: agent.tokens,
        ...(season ? { season } : {}),
        ...(typeof biosphereDelta === "number"
          ? { biosphereDelta, biosphereTotal }
          : {}),
      },
    });

  const createAidEvent = ({ tick, fromAgent, toAgent, amount }) =>
    createEvent({
      tick,
      agent: fromAgent,
      action: "aid",
      tokenDelta: -amount,
      cell: { x: fromAgent.x, y: fromAgent.y },
      counterpartyId: toAgent.id,
      note: `sent ${amount} tokens to ${toAgent.name}`,
      payloadExtras: {
        recipientName: toAgent.name,
        recipientIdentityId: toAgent.identityId,
        transferAmount: amount,
        reputation: fromAgent.reputation,
      },
    });

  const createBirthEvent = ({ tick, parent, child }) =>
    createEvent({
      tick,
      agent: child,
      action: "birth",
      tokenDelta: child.tokens,
      cell: { x: child.x, y: child.y },
      parentIds: [parent.id],
      note: `born with the shared endowment of ${child.startingTokens}`,
      payloadExtras: {
        parentIdentityId: parent.identityId,
        generation: child.generation,
        archetype: child.archetype,
        parentReputation: parent.reputation,
      },
    });

  const createDeathEvent = ({ tick, agent, reason, estate }) =>
    createEvent({
      tick,
      agent,
      action: "death",
      tokenDelta: 0,
      cell: { x: agent.x, y: agent.y },
      note: `${reason} closed the agent with estate ${estate}`,
      payloadExtras: {
        reason,
        estate,
        age: agent.age,
      },
    });

  const createInheritanceEvent = ({
    tick,
    fromAgent,
    amount,
    reputationAmount = 0,
    counterpartyId,
    counterpartyName,
  }) =>
    createEvent({
      tick,
      agent: fromAgent,
      action: "inherit",
      tokenDelta: -amount,
      cell: { x: fromAgent.x, y: fromAgent.y },
      counterpartyId,
      note: `passed ${amount} tokens to ${counterpartyName}`,
      payloadExtras: {
        transferAmount: amount,
        reputationAmount,
        recipientName: counterpartyName,
      },
    });

  const createCompressedTxs = (receipts, config) => {
    const batches = [];
    for (
      let start = 0;
      start < receipts.length;
      start += config.receiptsPerCompressedTx
    ) {
      const batchReceipts = receipts.slice(
        start,
        start + config.receiptsPerCompressedTx,
      );
      const batchId = `ctx_${String(batches.length + 1).padStart(3, "0")}`;
      const eventRoot = hashHex(
        batchReceipts.map((receipt) => receipt.payload),
      );
      batches.push({
        batchId,
        slotStart: batchReceipts[0].slot,
        slotEnd: batchReceipts[batchReceipts.length - 1].slot,
        eventRoot,
        compression: {
          method: "receipt-merkle-batch",
          receiptCount: batchReceipts.length,
          callCount: 1,
        },
        receipts: batchReceipts.map((receipt) => ({
          receiptId: receipt.receiptId,
          kind: receipt.kind,
          actorId: receipt.actorId,
          payloadHash: receipt.payloadHash,
        })),
      });
    }
    return batches;
  };

  const createTokenizedAgents = (events, receipts) => {
    const receiptByEventId = new Map(
      receipts.map((receipt) => [receipt.payload.eventId, receipt]),
    );
    return events.filter(isStartingTokenEvent).map((event) => {
      const receipt = receiptByEventId.get(event.id);
      return {
        agentId: event.agentId,
        agentName: event.agentName,
        agentIdentityId: event.actorIdentityId,
        agentPrompt: event.actorPrompt,
        agentImage: event.actorImage,
        sourceEventId: event.id,
        sourceReceiptId: receipt && receipt.receiptId,
        tick: event.tick,
        cell: event.cell,
        startingTokens: event.tokenDelta,
        tokenProgram: TOKEN_PROGRAM_AGENT_STAKE,
        stakeEvents: createStartingStakeEvents(event),
      };
    });
  };

  const supportsBiosphereTimeline = (config) => config.scenario === "worldseed";

  const countLiveCells = (grid) =>
    Array.isArray(grid) ? grid.filter(Boolean).length : 0;

  const createInitialBiosphere = (config) =>
    allCoordinates(config.gridSize).map((cell) => {
      const density =
        hashIndex(
          {
            seed: config.seed,
            cell,
            field: "biosphere-seed",
          },
          BIOSPHERE_DENSITY_STEPS,
        ) / BIOSPHERE_DENSITY_STEPS;
      return density < config.lifeDensity;
    });

  const seasonForTick = (tick, config) =>
    SEASON_STATES[
      Math.floor(tick / Math.max(MINIMUM_SEASON_LENGTH, config.seasonLength)) %
        SEASON_STATES.length
    ];

  const snapshotAgents = (agents) =>
    agents.map((agent) => ({
      id: agent.id,
      name: agent.name,
      identityId: agent.identityId,
      prompt: agent.prompt,
      image: agent.image,
      imageAlt: agent.imageAlt,
      archetype: agent.archetype,
      isHero: agent.isHero,
      tokens: agent.tokens,
      startingTokens: agent.startingTokens,
      x: agent.x,
      y: agent.y,
      alive: agent.alive,
      score: agent.score,
      receipts: agent.receipts,
      bornTick: agent.bornTick,
      lastTick: agent.lastTick,
      age: agent.age,
      livenessProofs: agent.livenessProofs,
      descendants: agent.descendants,
      generation: agent.generation,
      parentIds: agent.parentIds,
      harvestTotal: agent.harvestTotal,
      aidGiven: agent.aidGiven,
      aidReceived: agent.aidReceived,
      inheritedTokens: agent.inheritedTokens,
      earnedReputation: agent.earnedReputation,
      inheritedReputation: agent.inheritedReputation,
      reputation: agent.reputation,
    }));

  const createLeaderboard = (agents) =>
    snapshotAgents(agents)
      .sort(
        (left, right) =>
          right.score - left.score ||
          right.tokens - left.tokens ||
          right.livenessProofs - left.livenessProofs ||
          left.name.localeCompare(right.name),
      )
      .map((agent, index) => ({
        rank: index + 1,
        ...agent,
      }));

  const createReceiptGraph = ({
    agents,
    events,
    receipts,
    compressedTxs,
    tokenizedAgents,
    commonsBalance,
  }) => {
    const eventById = new Map(events.map((event) => [event.id, event]));
    const receiptBatchIds = new Map();
    for (const batch of compressedTxs) {
      for (const receipt of batch.receipts) {
        receiptBatchIds.set(receipt.receiptId, batch.batchId);
      }
    }

    const nodes = [
      {
        id: "task_society_pi_life",
        type: GRAPH_NODE_TYPE.task,
        label: "PI Society",
        domain: "society",
      },
      {
        id: COMMONS_AGENT_ID,
        type: GRAPH_NODE_TYPE.commons,
        label: "Society commons",
        balance: commonsBalance,
        identityId: COMMONS_IDENTITY_ID,
      },
      ...agents.map((agent) => ({
        id: agent.id,
        type: GRAPH_NODE_TYPE.agent,
        label: agent.name,
        name: agent.name,
        identityId: agent.identityId,
        prompt: agent.prompt,
        image: agent.image,
        imageAlt: agent.imageAlt,
        archetype: agent.archetype,
        isHero: agent.isHero,
        tokens: agent.tokens,
        startingTokens: agent.startingTokens,
        score: agent.score,
        receipts: agent.receipts,
        alive: agent.alive,
        x: agent.x,
        y: agent.y,
        bornTick: agent.bornTick,
        lastTick: agent.lastTick,
        age: agent.age,
        livenessProofs: agent.livenessProofs,
        descendants: agent.descendants,
        generation: agent.generation,
        parentIds: agent.parentIds,
        earnedReputation: agent.earnedReputation,
        inheritedReputation: agent.inheritedReputation,
        reputation: agent.reputation,
      })),
      ...receipts.map((receipt) => {
        const event = eventById.get(receipt.payload.eventId);
        return {
          id: receipt.receiptId,
          type: GRAPH_NODE_TYPE.receipt,
          label: `${receipt.kind} #${receipt.sequence}`,
          kind: receipt.kind,
          action: event ? event.action : receipt.payload.action,
          actorId: receipt.actorId,
          actorName: receipt.actorName,
          actorIdentityId: receipt.payload.actorIdentityId,
          actorPrompt: receipt.payload.actorPrompt,
          actorImage: receipt.payload.actorImage,
          tick: event ? event.tick : 0,
          batchId: receiptBatchIds.get(receipt.receiptId),
          previousReceiptId: receipt.previousReceiptId,
          payloadHash: receipt.payloadHash,
          slot: receipt.slot,
          cell: receipt.payload.cell,
          counterpartyId: receipt.payload.counterpartyId,
          parentIds: receipt.payload.parentIds || [],
          parentCoordinates: receipt.payload.parentCoordinates || [],
        };
      }),
      ...compressedTxs.map((batch) => ({
        id: batch.batchId,
        type: GRAPH_NODE_TYPE.batch,
        label: batch.batchId,
        eventRoot: batch.eventRoot,
        receiptCount: batch.receipts.length,
        slotStart: batch.slotStart,
        slotEnd: batch.slotEnd,
        compression: batch.compression.method,
      })),
      ...tokenizedAgents.map((agent) => ({
        id: `stake_${agent.agentId}`,
        type: GRAPH_NODE_TYPE.stake,
        label: `${agent.agentName} token account`,
        agentId: agent.agentId,
        sourceEventId: agent.sourceEventId,
        sourceReceiptId: agent.sourceReceiptId,
        startingTokens: agent.startingTokens,
        tokenProgram: agent.tokenProgram,
      })),
    ];

    const edges = [
      ...agents.map((agent) => ({
        from: "task_society_pi_life",
        to: agent.id,
        type: GRAPH_EDGE_TYPE.assigned,
      })),
      ...receipts.map((receipt) => ({
        from: receipt.actorId,
        to: receipt.receiptId,
        type: GRAPH_EDGE_TYPE.emitted,
      })),
      ...receipts
        .filter((receipt) => Boolean(receipt.previousReceiptId))
        .map((receipt) => ({
          from: receipt.previousReceiptId,
          to: receipt.receiptId,
          type: GRAPH_EDGE_TYPE.next,
        })),
      ...receipts.map((receipt) => ({
        from: receipt.receiptId,
        to: receiptBatchIds.get(receipt.receiptId),
        type: GRAPH_EDGE_TYPE.compressedInto,
      })),
      ...compressedTxs.map((batch) => ({
        from: "task_society_pi_life",
        to: batch.batchId,
        type: GRAPH_EDGE_TYPE.committedBatch,
      })),
      ...receipts.flatMap((receipt) =>
        (receipt.payload.parentIds || []).map((parentId) => ({
          from: parentId,
          to: receipt.receiptId,
          type: GRAPH_EDGE_TYPE.lineageParent,
        })),
      ),
      ...receipts
        .filter((receipt) => receipt.payload.action === "birth")
        .map((receipt) => ({
          from: receipt.receiptId,
          to: receipt.actorId,
          type: GRAPH_EDGE_TYPE.birthReceipt,
        })),
      ...receipts
        .filter((receipt) => receipt.payload.counterpartyId)
        .map((receipt) => ({
          from: receipt.receiptId,
          to: receipt.payload.counterpartyId,
          type: GRAPH_EDGE_TYPE.transferTo,
        })),
      ...tokenizedAgents.map((agent) => ({
        from: agent.agentId,
        to: `stake_${agent.agentId}`,
        type: GRAPH_EDGE_TYPE.tokenizedInto,
      })),
      ...tokenizedAgents
        .filter((agent) => agent.sourceReceiptId)
        .map((agent) => ({
          from: agent.sourceReceiptId,
          to: `stake_${agent.agentId}`,
          type: GRAPH_EDGE_TYPE.stakeSeed,
        })),
    ].filter((edge) => Boolean(edge.from && edge.to));

    return {
      programs: TRUST_SUBSTRATE_PROGRAMS,
      nodes,
      edges,
      summary: {
        agents: agents.length,
        receipts: receipts.length,
        batches: compressedTxs.length,
        tokenizedAgents: tokenizedAgents.length,
        edges: edges.length,
      },
    };
  };

  const summarizeTimeline = ({
    tick,
    allAgents,
    resources,
    caps,
    receipts,
    compressedTxs,
    births,
    deaths,
    commonsBalance,
    gridSize,
    biosphere,
    season,
  }) => {
    const occupancyGrid = createOccupancyGrid(allAgents, gridSize);
    const alive = liveAgents(allAgents);
    const summary = {
      tick,
      cells: occupancyGrid,
      resources: resources.slice(),
      resourceCaps: caps.slice(),
      agents: snapshotAgents(alive),
      leaderboard: createLeaderboard(allAgents),
      liveCells: occupancyGrid.filter(Boolean).length,
      liveAgents: alive.length,
      totalTokens: allAgents.reduce((total, agent) => total + agent.tokens, 0),
      receipts: receipts.length,
      compressedTxs: compressedTxs.length,
      births: births.map((cell) => ({ x: cell.x, y: cell.y })),
      deaths: deaths.map((cell) => ({ x: cell.x, y: cell.y })),
      survivors: alive
        .filter((agent) => agent.bornTick < tick || tick === 0)
        .map((agent) => ({ x: agent.x, y: agent.y })),
      resourceTotal: resources.reduce((total, value) => total + value, 0),
      commonsBalance,
    };

    if (Array.isArray(biosphere)) {
      summary.biosphere = biosphere.slice();
      summary.biosphereTotal = countLiveCells(biosphere);
    }
    if (season) {
      summary.season = season.name;
    }

    return summary;
  };

  const regrowResources = (resources, caps, config) =>
    resources.map((value, index) =>
      Math.min(caps[index], value + config.resourceRegrowth),
    );

  const chooseBirthCell = (
    agent,
    occupiedKeys,
    caps,
    config,
    preferredCells = [],
  ) => {
    const preferredCandidates = preferredCells
      .filter((cell) => isInsideBoard(cell.x, cell.y, config.gridSize))
      .filter((cell) => !occupiedKeys.has(cellKey(cell)))
      .sort((left, right) => left.y - right.y || left.x - right.x);
    if (preferredCandidates.length > 0) {
      return preferredCandidates[0];
    }

    const candidates = [
      { x: agent.x - 1, y: agent.y - 1 },
      { x: agent.x, y: agent.y - 1 },
      { x: agent.x + 1, y: agent.y - 1 },
      { x: agent.x - 1, y: agent.y },
      { x: agent.x + 1, y: agent.y },
      { x: agent.x - 1, y: agent.y + 1 },
      { x: agent.x, y: agent.y + 1 },
      { x: agent.x + 1, y: agent.y + 1 },
    ]
      .filter((cell) => isInsideBoard(cell.x, cell.y, config.gridSize))
      .filter((cell) => !occupiedKeys.has(cellKey(cell)))
      .sort((left, right) => {
        const leftCap = caps[indexFor(left.x, left.y, config.gridSize)];
        const rightCap = caps[indexFor(right.x, right.y, config.gridSize)];
        return rightCap - leftCap || left.y - right.y || left.x - right.x;
      });

    return candidates[0];
  };

  const findLivingDescendants = (agent, allAgents) =>
    allAgents.filter(
      (candidate) => candidate.alive && candidate.parentIds.includes(agent.id),
    );

  const appendEventToSession = (session, event) => {
    session.sequence += 1;
    session.events.push(event);
    const receipt = createReceipt(
      event,
      session.sequence,
      session.previousReceiptId,
    );
    session.receipts.push(receipt);
    session.previousReceiptId = receipt.receiptId;
    const actor = session.allAgents.find((agent) => agent.id === event.agentId);
    if (actor) {
      actor.receipts += 1;
    }
    if (event.tokenDelta !== 0) {
      session.totalTokenVolume += Math.abs(event.tokenDelta);
    }
    return receipt;
  };

  const createLiveTickRuntime = (session, tick) => {
    session.resources = regrowResources(
      session.resources,
      session.caps,
      session.config,
    );
    const currentSeason = supportsBiosphereTimeline(session.config)
      ? seasonForTick(tick, session.config)
      : undefined;
    const previousBiosphereTotal = countLiveCells(session.biosphere);
    if (
      supportsBiosphereTimeline(session.config) &&
      Array.isArray(session.biosphere)
    ) {
      session.biosphere = evolveLifeGrid(
        session.biosphere,
        session.config.gridSize,
      ).cells;
    }
    const currentBiosphereTotal = countLiveCells(session.biosphere);
    session.tickRuntime = {
      tick,
      currentSeason,
      biosphereDelta: currentBiosphereTotal - previousBiosphereTotal,
      currentBiosphereTotal,
      occupiedAtStart: mapLiveAgentsByCell(session.allAgents),
      claimed: new Set(),
      births: [],
      deaths: [],
      queuedEvents: [],
      livingAtTickStart: liveAgents(session.allAgents)
        .slice()
        .sort((left, right) => left.id.localeCompare(right.id)),
      agentCursor: 0,
    };
    return session.tickRuntime;
  };

  const buildConwayLifePlan = (occupiedAtStart, size) => {
    const evolution = evolveLifeGrid(
      gridFromCoordinates(
        size,
        Array.from(occupiedAtStart.keys()).map((key) => {
          const [x, y] = key.split(",").map(Number);
          return { x, y };
        }),
      ),
      size,
    );
    return {
      birthCells: evolution.births,
      survivorKeys: new Set(evolution.survivors.map(cellKey)),
    };
  };

  const ensureLiveTickRuntime = (session) => {
    if (session.tickRuntime) return session.tickRuntime;
    if (session.currentTick >= session.config.ticks) return undefined;
    return createLiveTickRuntime(session, session.currentTick + 1);
  };

  const packTickRuntime = (runtime) => {
    if (!runtime) return undefined;
    return {
      tick: runtime.tick,
      currentSeason: runtime.currentSeason,
      biosphereDelta: runtime.biosphereDelta,
      currentBiosphereTotal: runtime.currentBiosphereTotal,
      occupiedAtStart: Array.from(runtime.occupiedAtStart.entries()).map(
        ([key, agent]) => [key, agent.id],
      ),
      claimed: Array.from(runtime.claimed.values()),
      births: runtime.births.map((cell) => ({ x: cell.x, y: cell.y })),
      deaths: runtime.deaths.map((cell) => ({ x: cell.x, y: cell.y })),
      queuedEvents: runtime.queuedEvents.map((event) => ({ ...event })),
      livingAtTickStart: runtime.livingAtTickStart.map((agent) => agent.id),
      agentCursor: runtime.agentCursor,
    };
  };

  const unpackTickRuntime = (runtime, allAgents) => {
    if (!runtime) return undefined;
    const agentsById = new Map(allAgents.map((agent) => [agent.id, agent]));
    return {
      tick: runtime.tick,
      currentSeason: runtime.currentSeason,
      biosphereDelta: runtime.biosphereDelta,
      currentBiosphereTotal: runtime.currentBiosphereTotal,
      occupiedAtStart: new Map(
        runtime.occupiedAtStart
          .map(([key, agentId]) => {
            const agent = agentsById.get(agentId);
            return agent ? [key, agent] : undefined;
          })
          .filter(Boolean),
      ),
      claimed: new Set(runtime.claimed),
      births: runtime.births.map((cell) => ({ x: cell.x, y: cell.y })),
      deaths: runtime.deaths.map((cell) => ({ x: cell.x, y: cell.y })),
      queuedEvents: runtime.queuedEvents.map((event) => ({ ...event })),
      livingAtTickStart: runtime.livingAtTickStart
        .map((agentId) => agentsById.get(agentId))
        .filter(Boolean),
      agentCursor: runtime.agentCursor,
    };
  };

  const COMPACT_AGENT_INDEX = Object.freeze({
    originX: 0,
    originY: 1,
    x: 2,
    y: 3,
    bornTick: 4,
    lastTick: 5,
    startingTokens: 6,
    tokens: 7,
    receipts: 8,
    age: 9,
    livenessProofs: 10,
    generation: 11,
    harvestTotal: 12,
    aidGiven: 13,
    aidReceived: 14,
    inheritedTokens: 15,
    earnedReputation: 16,
    inheritedReputation: 17,
    flags: 18,
    archetypeIndex: 19,
    parentIndex: 20,
  });

  const compactScenarioIndex = (scenario) =>
    Math.max(0, SCENARIO_NAMES.indexOf(scenario));

  const restoreScenarioName = (index) =>
    SCENARIO_NAMES[index] || DEFAULT_SCENARIO;

  const compactArchetypeIndex = (name) =>
    Math.max(0, AGENT_ARCHETYPE_NAMES.indexOf(name));

  const restoreArchetypeName = (index) =>
    AGENT_ARCHETYPE_NAMES[index] || AGENT_ARCHETYPE_NAMES[0];

  const clonePlainValue = (value) =>
    typeof structuredClone === "function"
      ? structuredClone(value)
      : JSON.parse(JSON.stringify(value));

  const compactConfig = (config) => ({
    a: config.agents,
    t: config.ticks,
    it: config.initialTokens,
    ui: config.universalIncome,
    lc: config.livingCost,
    gs: config.gridSize,
    rc: config.resourceCap,
    rr: config.resourceRegrowth,
    bt: config.birthThreshold,
    at: config.aidThreshold,
    vi: config.vision,
    ma: config.maxAge,
    ld: config.lifeDensity,
    sc: compactScenarioIndex(config.scenario),
    rp: config.receiptsPerCompressedTx,
    sd: config.seed,
    sl: config.seasonLength,
    ss: config.stipendSwing,
    rs: config.regrowthSwing,
    bb: config.biosphereBoost,
    sp: config.spawnSpacing,
    ha:
      typeof config.heroArchetype === "string"
        ? compactArchetypeIndex(config.heroArchetype)
        : MISSING_HERO_ARCHETYPE_INDEX,
    ic: Array.isArray(config.initialCells)
      ? config.initialCells.map((cell) => [cell.x, cell.y])
      : undefined,
  });

  const restoreCompactConfig = (config) =>
    restoreSerializedConfig({
      agents: config.a,
      ticks: config.t,
      initialTokens: config.it,
      universalIncome: config.ui,
      livingCost: config.lc,
      gridSize: config.gs,
      resourceCap: config.rc,
      resourceRegrowth: config.rr,
      birthThreshold: config.bt,
      aidThreshold: config.at,
      vision: config.vi,
      maxAge: config.ma,
      lifeDensity: config.ld,
      scenario: restoreScenarioName(config.sc),
      receiptsPerCompressedTx: config.rp,
      seed: config.sd,
      seasonLength: config.sl,
      stipendSwing: config.ss,
      regrowthSwing: config.rs,
      biosphereBoost: config.bb,
      spawnSpacing: config.sp,
      heroArchetype:
        config.ha === MISSING_HERO_ARCHETYPE_INDEX
          ? undefined
          : restoreArchetypeName(config.ha),
      initialCells: Array.isArray(config.ic)
        ? config.ic.map(([x, y]) => ({ x, y }))
        : undefined,
    });

  const packResources = (resources) =>
    encodeBase64Bytes(Uint8Array.from(resources));

  const unpackResources = (resources) =>
    Array.from(decodeBase64Bytes(resources));

  const packBiosphere = (biosphere) =>
    Array.isArray(biosphere)
      ? encodeBase64Bytes(packBooleanBitset(biosphere))
      : undefined;

  const unpackBiosphere = (biosphere, config) =>
    biosphere
      ? unpackBooleanBitset(
          decodeBase64Bytes(biosphere),
          config.gridSize * config.gridSize,
        )
      : undefined;

  const packQueuedEvent = (event, agentIndexes) => ({
    a: COMPACT_EVENT_ACTIONS.indexOf(event.action),
    i: agentIndexes.get(event.agentId),
    d: event.tokenDelta,
    c: [event.cell.x, event.cell.y],
    k: event.counterpartyId,
    p: (event.parentIds || [])
      .map((parentId) => agentIndexes.get(parentId))
      .filter((index) => Number.isInteger(index)),
    n: event.note,
    x: event.payloadExtras,
  });

  const unpackQueuedEvent = (event, allAgents) => {
    const agent = allAgents[event.i];
    const parentIds = Array.isArray(event.p)
      ? event.p.map((parentIndex) => allAgents[parentIndex]?.id).filter(Boolean)
      : [];
    return createEvent({
      tick: event.t,
      agent,
      action: COMPACT_EVENT_ACTIONS[event.a],
      tokenDelta: event.d,
      cell: { x: event.c[0], y: event.c[1] },
      counterpartyId: event.k,
      parentIds,
      note: event.n,
      payloadExtras: event.x || {},
    });
  };

  const packLiveWorldTickRuntime = (runtime, allAgents) => {
    if (!runtime) return undefined;
    const agentIndexes = new Map(
      allAgents.map((agent, index) => [agent.id, index]),
    );
    const occupiedAtStartByAgentId = new Map();
    runtime.occupiedAtStart.forEach((agent, key) => {
      const [x, y] = key.split(",").map((value) => Number.parseInt(value, 10));
      occupiedAtStartByAgentId.set(agent.id, [x, y]);
    });
    return {
      t: runtime.tick,
      bd: runtime.biosphereDelta,
      ac: runtime.agentCursor,
      l: runtime.livingAtTickStart.map((agent) => agentIndexes.get(agent.id)),
      o: runtime.livingAtTickStart.map(
        (agent) => occupiedAtStartByAgentId.get(agent.id) || [agent.x, agent.y],
      ),
      b: runtime.births.map((cell) => [cell.x, cell.y]),
      d: runtime.deaths.map((cell) => [cell.x, cell.y]),
      q: runtime.queuedEvents.map((event) => {
        const packed = packQueuedEvent(event, agentIndexes);
        return {
          ...packed,
          t: runtime.tick,
        };
      }),
    };
  };

  const restoreCompactAgents = (agents, config) => {
    const restoredAgents = agents.map((entry, index, source) => {
      const parentIndex = entry[COMPACT_AGENT_INDEX.parentIndex];
      const parentIds =
        parentIndex === NO_PARENT_AGENT_INDEX
          ? []
          : [restoredAgentsOrId(source, index, parentIndex, config)];
      const originCell = {
        x: entry[COMPACT_AGENT_INDEX.originX],
        y: entry[COMPACT_AGENT_INDEX.originY],
      };
      const bornTick = entry[COMPACT_AGENT_INDEX.bornTick];
      const generation = entry[COMPACT_AGENT_INDEX.generation];
      const id = `cell_${hashHex({
        seed: config.seed,
        bornTick,
        cell: originCell,
        parentIds,
      }).slice(0, CELL_AGENT_HASH_WIDTH)}`;
      const identityId = createAgentIdentityId({ id, config });
      const name = createAgentName({ id, cell: originCell, generation });
      const archetype = restoreArchetypeName(
        entry[COMPACT_AGENT_INDEX.archetypeIndex],
      );
      const prompt = createAgentPrompt({
        name,
        identityId,
        generation,
        parentIds,
        archetype: AGENT_ARCHETYPE_BY_NAME[archetype],
        config,
      });
      const image = createAgentImage({
        name,
        identityId,
        cell: originCell,
        generation,
      });
      const flags = entry[COMPACT_AGENT_INDEX.flags];
      const agent = {
        id,
        identityId,
        name,
        prompt,
        image,
        imageAlt: `${name} agent avatar`,
        archetype,
        isHero: Boolean(flags & COMPACT_AGENT_FLAG_HERO),
        tokens: entry[COMPACT_AGENT_INDEX.tokens],
        startingTokens: entry[COMPACT_AGENT_INDEX.startingTokens],
        originX: originCell.x,
        originY: originCell.y,
        x: entry[COMPACT_AGENT_INDEX.x],
        y: entry[COMPACT_AGENT_INDEX.y],
        alive: Boolean(flags & COMPACT_AGENT_FLAG_ALIVE),
        score: 0,
        receipts: entry[COMPACT_AGENT_INDEX.receipts],
        bornTick,
        lastTick: entry[COMPACT_AGENT_INDEX.lastTick],
        age: entry[COMPACT_AGENT_INDEX.age],
        livenessProofs: entry[COMPACT_AGENT_INDEX.livenessProofs],
        descendants: 0,
        generation,
        parentIds,
        childrenIds: [],
        harvestTotal: entry[COMPACT_AGENT_INDEX.harvestTotal],
        aidGiven: entry[COMPACT_AGENT_INDEX.aidGiven],
        aidReceived: entry[COMPACT_AGENT_INDEX.aidReceived],
        inheritedTokens: entry[COMPACT_AGENT_INDEX.inheritedTokens],
        earnedReputation: entry[COMPACT_AGENT_INDEX.earnedReputation],
        inheritedReputation: entry[COMPACT_AGENT_INDEX.inheritedReputation],
        reputation: 0,
      };
      agent.reputation = calculateReputation(agent);
      agent.score = calculateScore(agent);
      return agent;
    });

    restoredAgents.forEach((agent) => {
      agent.parentIds.forEach((parentId) => {
        const parent = restoredAgents.find(
          (candidate) => candidate.id === parentId,
        );
        if (!parent) return;
        parent.childrenIds.push(agent.id);
        parent.descendants = parent.childrenIds.length;
      });
    });

    return restoredAgents;
  };

  const restoredAgentsOrId = (source, index, parentIndex, config) => {
    const restoredParent = source[parentIndex];
    const parentParentIndex = restoredParent[COMPACT_AGENT_INDEX.parentIndex];
    const parentIds =
      parentParentIndex === NO_PARENT_AGENT_INDEX
        ? []
        : [restoredAgentsOrId(source, parentIndex, parentParentIndex, config)];
    const originCell = {
      x: restoredParent[COMPACT_AGENT_INDEX.originX],
      y: restoredParent[COMPACT_AGENT_INDEX.originY],
    };
    return `cell_${hashHex({
      seed: config.seed,
      bornTick: restoredParent[COMPACT_AGENT_INDEX.bornTick],
      cell: originCell,
      parentIds,
    }).slice(0, CELL_AGENT_HASH_WIDTH)}`;
  };

  const packCompactAgent = (agent, agentIndexes) => [
    agent.originX ?? agent.x,
    agent.originY ?? agent.y,
    agent.x,
    agent.y,
    agent.bornTick,
    agent.lastTick,
    agent.startingTokens,
    agent.tokens,
    agent.receipts,
    agent.age,
    agent.livenessProofs,
    agent.generation,
    agent.harvestTotal,
    agent.aidGiven,
    agent.aidReceived,
    agent.inheritedTokens,
    agent.earnedReputation,
    agent.inheritedReputation,
    (agent.alive ? COMPACT_AGENT_FLAG_ALIVE : 0) |
      (agent.isHero ? COMPACT_AGENT_FLAG_HERO : 0),
    compactArchetypeIndex(agent.archetype),
    agent.parentIds.length > 0
      ? (agentIndexes.get(agent.parentIds[0]) ?? NO_PARENT_AGENT_INDEX)
      : NO_PARENT_AGENT_INDEX,
  ];

  const unpackLiveWorldTickRuntime = (
    runtime,
    allAgents,
    config,
    biosphere,
  ) => {
    if (!runtime) return undefined;
    const livingAtTickStart = runtime.l
      .map((agentIndex) => allAgents[agentIndex])
      .filter(Boolean);
    const occupiedAtStart = new Map(
      livingAtTickStart.map((agent, index) => [
        cellKey({
          x: runtime.o[index][0],
          y: runtime.o[index][1],
        }),
        agent,
      ]),
    );
    return {
      tick: runtime.t,
      currentSeason: supportsBiosphereTimeline(config)
        ? seasonForTick(runtime.t, config)
        : undefined,
      biosphereDelta: runtime.bd,
      currentBiosphereTotal: countLiveCells(biosphere),
      occupiedAtStart,
      claimed: new Set(
        livingAtTickStart
          .slice(0, runtime.ac)
          .map((agent) => cellKey({ x: agent.x, y: agent.y })),
      ),
      births: (runtime.b || []).map(([x, y]) => ({ x, y })),
      deaths: (runtime.d || []).map(([x, y]) => ({ x, y })),
      queuedEvents: (runtime.q || []).map((event) =>
        unpackQueuedEvent(event, allAgents),
      ),
      livingAtTickStart,
      agentCursor: runtime.ac,
    };
  };

  const packLiveSocietyWorldState = (session) => {
    const agentIndexes = new Map(
      session.allAgents.map((agent, index) => [agent.id, index]),
    );
    const payload = {
      v: PACKED_WORLD_STATE_VERSION,
      c: compactConfig(session.config),
      r: packResources(session.resources),
      b: packBiosphere(session.biosphere),
      a: session.allAgents.map((agent) =>
        packCompactAgent(agent, agentIndexes),
      ),
      q: session.sequence,
      p: session.previousReceiptId || "",
      tv: session.totalTokenVolume,
      cb: session.commonsBalance,
      ct: session.currentTick,
      tr: packLiveWorldTickRuntime(session.tickRuntime, session.allAgents),
    };
    const encoded = encodeUtf8(JSON.stringify(payload));
    if (encoded.byteLength > ONCHAIN_SOCIETY_WORLD_STATE_LIMIT_BYTES) {
      throw new Error(
        `Packed society world state exceeded ${ONCHAIN_SOCIETY_WORLD_STATE_LIMIT_BYTES} bytes`,
      );
    }
    return encoded;
  };

  const unpackLiveSocietyWorldState = (serialized) => {
    const encoded =
      typeof serialized === "string"
        ? encodeUtf8(serialized)
        : serialized instanceof Uint8Array
          ? serialized
          : new Uint8Array(serialized || []);
    const payload = JSON.parse(decodeUtf8(encoded));
    if (payload.v !== PACKED_WORLD_STATE_VERSION) {
      throw new Error(`Unsupported packed society world version ${payload.v}`);
    }
    const config = restoreCompactConfig(payload.c);
    const caps = createResourceCaps(config, makeRng(config.seed));
    const biosphere = unpackBiosphere(payload.b, config);
    const allAgents = restoreCompactAgents(payload.a || [], config);
    return {
      config,
      caps,
      resources: unpackResources(payload.r),
      biosphere,
      allAgents,
      events: [],
      receipts: [],
      timeline: [],
      sequence: payload.q,
      previousReceiptId: payload.p || undefined,
      totalTokenVolume: payload.tv,
      commonsBalance: payload.cb,
      currentTick: payload.ct,
      tickRuntime: unpackLiveWorldTickRuntime(
        payload.tr,
        allAgents,
        config,
        biosphere,
      ),
    };
  };

  const restorePackedLiveSocietySession = (serialized, history = {}) => {
    const session = unpackLiveSocietyWorldState(serialized);
    return {
      ...session,
      events: Array.isArray(history.events)
        ? clonePlainValue(history.events)
        : [],
      receipts: Array.isArray(history.receipts)
        ? clonePlainValue(history.receipts)
        : [],
      timeline: Array.isArray(history.timeline)
        ? clonePlainValue(history.timeline)
        : [],
    };
  };

  const serializeLiveSocietySession = (session) =>
    JSON.stringify({
      config: session.config,
      caps: session.caps,
      resources: session.resources,
      biosphere: session.biosphere,
      allAgents: session.allAgents,
      sequence: session.sequence,
      previousReceiptId: session.previousReceiptId,
      totalTokenVolume: session.totalTokenVolume,
      commonsBalance: session.commonsBalance,
      currentTick: session.currentTick,
      tickRuntime: packTickRuntime(session.tickRuntime),
    });

  const deserializeLiveSocietySession = (serialized) => {
    const parsed =
      typeof serialized === "string" ? JSON.parse(serialized) : serialized;
    const config = restoreSerializedConfig(parsed?.config);
    const allAgents = Array.isArray(parsed?.allAgents)
      ? parsed.allAgents.map((agent) => ({
          ...agent,
          originX: typeof agent.originX === "number" ? agent.originX : agent.x,
          originY: typeof agent.originY === "number" ? agent.originY : agent.y,
        }))
      : [];
    return {
      config,
      caps: parsed.caps,
      resources: parsed.resources,
      biosphere: parsed.biosphere,
      allAgents,
      events: [],
      receipts: [],
      timeline: [],
      sequence: parsed.sequence,
      previousReceiptId: parsed.previousReceiptId,
      totalTokenVolume: parsed.totalTokenVolume,
      commonsBalance: parsed.commonsBalance,
      currentTick: parsed.currentTick,
      tickRuntime: unpackTickRuntime(parsed.tickRuntime, allAgents),
    };
  };

  const summarizeCurrentLiveFrame = (session) => {
    if (!session.tickRuntime) {
      return session.timeline[session.timeline.length - 1];
    }
    return summarizeTimeline({
      tick: session.tickRuntime.tick,
      allAgents: session.allAgents,
      resources: session.resources,
      caps: session.caps,
      receipts: session.receipts,
      compressedTxs: createCompressedTxs(session.receipts, session.config),
      births: session.tickRuntime.births,
      deaths: session.tickRuntime.deaths,
      commonsBalance: session.commonsBalance,
      gridSize: session.config.gridSize,
      biosphere: session.biosphere,
      season: session.tickRuntime.currentSeason,
    });
  };

  const compactSeasonIndex = (seasonName) =>
    seasonName
      ? Math.max(
          0,
          SEASON_STATES.findIndex((season) => season.name === seasonName),
        )
      : undefined;

  const packOnchainCheckpointAgent = (agent, mode) => {
    if (mode === ONCHAIN_AGENT_MODE_MINIMAL) {
      return [agent.x, agent.y, agent.tokens];
    }
    if (mode === ONCHAIN_AGENT_MODE_LEAN) {
      return [agent.x, agent.y, agent.tokens, agent.reputation];
    }
    return [
      agent.x,
      agent.y,
      agent.tokens,
      agent.reputation,
      agent.age,
      agent.livenessProofs,
      compactArchetypeIndex(agent.archetype),
      agent.isHero ? 1 : 0,
    ];
  };

  const buildOnchainSocietyWorldCheckpoint = (session, agentMode) => {
    const frame = summarizeCurrentLiveFrame(session);
    return {
      v: ONCHAIN_WORLD_STATE_VERSION,
      gs: session.config.gridSize,
      sc: compactScenarioIndex(session.config.scenario),
      sm: compactSeasonIndex(frame.season),
      ft: frame.tick,
      la: frame.liveAgents,
      lc: frame.liveCells,
      tt: frame.totalTokens,
      rt: frame.resourceTotal,
      rc: frame.receipts,
      cx: frame.compressedTxs,
      cb: frame.commonsBalance,
      bs:
        typeof frame.biosphereTotal === "number"
          ? frame.biosphereTotal
          : undefined,
      bc: frame.births.length,
      dc: frame.deaths.length,
      am: agentMode,
      ag: frame.agents.map((agent) =>
        packOnchainCheckpointAgent(agent, agentMode),
      ),
    };
  };

  const packOnchainSocietyWorldState = (session) => {
    const agentModes = [
      ONCHAIN_AGENT_MODE_RICH,
      ONCHAIN_AGENT_MODE_LEAN,
      ONCHAIN_AGENT_MODE_MINIMAL,
    ];
    for (const agentMode of agentModes) {
      const encoded = encodeUtf8(
        JSON.stringify(buildOnchainSocietyWorldCheckpoint(session, agentMode)),
      );
      if (encoded.byteLength <= MAX_ONCHAIN_SOCIETY_WORLD_CHECKPOINT_BYTES) {
        return encoded;
      }
    }
    throw new Error(
      `On-chain society world checkpoint exceeded ${MAX_ONCHAIN_SOCIETY_WORLD_CHECKPOINT_BYTES} bytes`,
    );
  };

  const queueLiveAgentEvents = (session) => {
    const runtime = session.tickRuntime;
    if (!runtime || runtime.agentCursor >= runtime.livingAtTickStart.length) {
      return;
    }

    const agent = runtime.livingAtTickStart[runtime.agentCursor];
    runtime.agentCursor += 1;

    const previousCell = { x: agent.x, y: agent.y };
    const conwayPlan = buildConwayLifePlan(
      runtime.occupiedAtStart,
      session.config.gridSize,
    );
    runtime.claimed.add(cellKey(previousCell));

    const resourceIndex = indexFor(
      previousCell.x,
      previousCell.y,
      session.config.gridSize,
    );
    const resourceBefore = session.resources[resourceIndex];
    const harvested = resourceBefore;
    session.resources[resourceIndex] = 0;

    agent.tokens += harvested;
    agent.harvestTotal += harvested;
    agent.tokens += session.config.universalIncome;
    agent.tokens -= session.config.livingCost;
    agent.age += 1;
    agent.lastTick = runtime.tick;

    const applyConwayPressure =
      runtime.livingAtTickStart.length >= 3 &&
      (conwayPlan.survivorKeys.size > 0 || conwayPlan.birthCells.length > 0);
    const survivesConway =
      !applyConwayPressure ||
      conwayPlan.survivorKeys.has(cellKey(previousCell));
    if (
      !survivesConway ||
      agent.tokens <= 0 ||
      agent.age >= session.config.maxAge
    ) {
      const estate = Math.max(agent.tokens, 0);
      const reputationEstate = Math.max(agent.reputation, 0);
      agent.tokens = 0;
      agent.alive = false;
      agent.score = calculateScore(agent);
      runtime.deaths.push({ x: agent.x, y: agent.y });
      runtime.queuedEvents.push(
        createDeathEvent({
          tick: runtime.tick,
          agent,
          reason: !survivesConway
            ? "Conway under/overpopulation"
            : estate === 0
              ? "upkeep exhaustion"
              : "age limit reached",
          estate,
        }),
      );

      if (estate > 0) {
        const heirs = findLivingDescendants(agent, session.allAgents).sort(
          (left, right) => left.id.localeCompare(right.id),
        );
        if (heirs.length === 0) {
          session.commonsBalance += estate;
          runtime.queuedEvents.push(
            createInheritanceEvent({
              tick: runtime.tick,
              fromAgent: agent,
              amount: estate,
              reputationAmount: reputationEstate,
              counterpartyId: COMMONS_AGENT_ID,
              counterpartyName: "Society commons",
            }),
          );
        } else {
          let remaining = estate;
          let remainingReputation = reputationEstate;
          const share = Math.floor(estate / heirs.length);
          const reputationShare = Math.floor(reputationEstate / heirs.length);
          heirs.forEach((heir, heirIndex) => {
            const amount = heirIndex === heirs.length - 1 ? remaining : share;
            const reputationAmount =
              heirIndex === heirs.length - 1
                ? remainingReputation
                : reputationShare;
            remaining -= amount;
            remainingReputation -= reputationAmount;
            heir.tokens += amount;
            heir.inheritedTokens += amount;
            heir.inheritedReputation += reputationAmount;
            heir.reputation = calculateReputation(heir);
            heir.score = calculateScore(heir);
            runtime.queuedEvents.push(
              createInheritanceEvent({
                tick: runtime.tick,
                fromAgent: agent,
                amount,
                reputationAmount,
                counterpartyId: heir.id,
                counterpartyName: heir.name,
              }),
            );
          });
        }
      }
      return;
    }

    agent.livenessProofs += 1;
    agent.earnedReputation += 2;
    agent.reputation = calculateReputation(agent);
    agent.score = calculateScore(agent);
    runtime.queuedEvents.push(
      createHeartbeatEvent({
        tick: runtime.tick,
        agent,
        tokenDelta:
          harvested +
          session.config.universalIncome -
          session.config.livingCost,
        harvested,
        resourceBefore,
        resourceAfter: session.resources[resourceIndex],
        movedFrom: previousCell,
        stipend: session.config.universalIncome,
        upkeep: session.config.livingCost,
        season: runtime.currentSeason && runtime.currentSeason.name,
        biosphereDelta: runtime.biosphereDelta,
        biosphereTotal: runtime.currentBiosphereTotal,
      }),
    );

    const neighborCandidates = liveAgents(session.allAgents)
      .filter(
        (candidate) =>
          candidate.id !== agent.id &&
          isMooreAdjacent(agent, candidate) &&
          agent.tokens - candidate.tokens >= session.config.aidThreshold,
      )
      .sort(
        (left, right) =>
          left.tokens - right.tokens || left.id.localeCompare(right.id),
      );
    const archetype = AGENT_ARCHETYPES.find(
      (candidate) => candidate.name === agent.archetype,
    );
    if (neighborCandidates.length > 0 && archetype.aidBias > 1) {
      const recipient = neighborCandidates[0];
      const amount = Math.max(
        1,
        Math.min(
          12,
          Math.floor(
            (agent.tokens - recipient.tokens) / (archetype.aidBias + 2),
          ),
        ),
      );
      if (amount > 0 && agent.tokens - amount > session.config.livingCost) {
        agent.tokens -= amount;
        recipient.tokens += amount;
        agent.aidGiven += amount;
        recipient.aidReceived += amount;
        agent.earnedReputation += Math.max(1, Math.floor(amount / 4));
        agent.reputation = calculateReputation(agent);
        recipient.reputation = calculateReputation(recipient);
        agent.score = calculateScore(agent);
        recipient.score = calculateScore(recipient);
        runtime.queuedEvents.push(
          createAidEvent({
            tick: runtime.tick,
            fromAgent: agent,
            toAgent: recipient,
            amount,
          }),
        );
      }
    }

    const preferredBirthCells = conwayPlan.birthCells.filter(
      (cell) =>
        isMooreAdjacent(agent, cell) && !runtime.claimed.has(cellKey(cell)),
    );
    const birthFloor =
      preferredBirthCells.length > 0
        ? session.config.initialTokens
        : session.config.birthThreshold;
    if (agent.tokens >= birthFloor) {
      const occupiedKeys = new Set(
        liveAgents(session.allAgents).map((candidate) =>
          cellKey({ x: candidate.x, y: candidate.y }),
        ),
      );
      const birthCell = chooseBirthCell(
        agent,
        new Set([...occupiedKeys, ...runtime.claimed]),
        session.caps,
        session.config,
        preferredBirthCells,
      );
      if (birthCell) {
        agent.tokens -= session.config.initialTokens;
        agent.descendants += 1;
        agent.earnedReputation += 3;
        const child = createCellAgent({
          config: session.config,
          cell: birthCell,
          bornTick: runtime.tick,
          tokens: session.config.initialTokens,
          parentIds: [agent.id],
          generation: agent.generation + 1,
        });
        agent.childrenIds.push(child.id);
        agent.reputation = calculateReputation(agent);
        child.reputation = calculateReputation(child);
        agent.score = calculateScore(agent);
        child.score = calculateScore(child);
        runtime.births.push({ x: child.x, y: child.y });
        runtime.claimed.add(cellKey(birthCell));
        session.allAgents.push(child);
        runtime.queuedEvents.push(
          createBirthEvent({
            tick: runtime.tick,
            parent: agent,
            child,
          }),
        );
      }
    }
  };

  const completeTickIfReady = (session, runtime) => {
    if (
      runtime.queuedEvents.length > 0 ||
      runtime.agentCursor < runtime.livingAtTickStart.length
    ) {
      return { tickComplete: false, frame: undefined };
    }

    const frame = summarizeTimeline({
      tick: runtime.tick,
      allAgents: session.allAgents,
      resources: session.resources,
      caps: session.caps,
      receipts: session.receipts,
      compressedTxs: createCompressedTxs(session.receipts, session.config),
      births: runtime.births,
      deaths: runtime.deaths,
      commonsBalance: session.commonsBalance,
      gridSize: session.config.gridSize,
      biosphere: session.biosphere,
      season: runtime.currentSeason,
    });
    session.timeline.push(frame);
    session.currentTick = runtime.tick;
    session.tickRuntime = undefined;
    return { tickComplete: true, frame };
  };

  const cloneLiveSocietySession = (session) =>
    typeof structuredClone === "function"
      ? structuredClone(session)
      : JSON.parse(JSON.stringify(session));

  const createLiveSocietySession = (input) => {
    const config = normalizeConfig(input || DEFAULT_SOCIETY_CONFIG);
    const rng = makeRng(config.seed);
    const caps = createResourceCaps(config, rng);
    const resources = createResources(config, caps);
    const biosphere = supportsBiosphereTimeline(config)
      ? createInitialBiosphere(config)
      : undefined;
    const initialCells = chooseInitialCells(config, caps, rng);
    const allAgents = initialCells.map((cell, index) =>
      createCellAgent({
        config,
        cell,
        bornTick: 0,
        tokens: config.initialTokens,
        forcedArchetype: index === 0 ? config.heroArchetype : undefined,
        isHero: index === 0 && Boolean(config.heroArchetype),
      }),
    );
    const session = {
      config,
      caps,
      resources,
      biosphere,
      allAgents,
      events: [],
      receipts: [],
      timeline: [],
      previousReceiptId: undefined,
      sequence: 0,
      totalTokenVolume: 0,
      commonsBalance: 0,
      currentTick: 0,
      tickRuntime: undefined,
    };

    createGenesisEvents(allAgents, config).forEach((event) => {
      const agent = allAgents.find(
        (candidate) => candidate.id === event.agentId,
      );
      if (agent) {
        agent.score = calculateScore(agent);
      }
      appendEventToSession(session, event);
    });

    session.timeline.push(
      summarizeTimeline({
        tick: 0,
        allAgents: session.allAgents,
        resources: session.resources,
        caps,
        receipts: session.receipts,
        compressedTxs: createCompressedTxs(session.receipts, config),
        births: initialCells,
        deaths: [],
        commonsBalance: session.commonsBalance,
        gridSize: config.gridSize,
        biosphere: session.biosphere,
        season: supportsBiosphereTimeline(config)
          ? seasonForTick(0, config)
          : undefined,
      }),
    );
    return session;
  };

  const advanceLiveSocietySession = (session) => {
    let runtime = ensureLiveTickRuntime(session);
    if (!runtime) return undefined;

    while (runtime.queuedEvents.length === 0) {
      if (runtime.agentCursor >= runtime.livingAtTickStart.length) {
        const completed = completeTickIfReady(session, runtime);
        runtime = ensureLiveTickRuntime(session);
        if (!runtime) {
          return completed.tickComplete
            ? {
                event: undefined,
                receipt: undefined,
                frame: completed.frame,
                tickComplete: true,
                completed: true,
              }
            : undefined;
        }
        continue;
      }
      queueLiveAgentEvents(session);
    }

    const event = runtime.queuedEvents.shift();
    const receipt = appendEventToSession(session, event);
    const completed = completeTickIfReady(session, runtime);
    const frame = completed.tickComplete
      ? completed.frame
      : summarizeCurrentLiveFrame(session);

    return {
      event,
      receipt,
      frame,
      tickComplete: completed.tickComplete,
      completed:
        !session.tickRuntime && session.currentTick >= session.config.ticks,
    };
  };

  const peekNextSocietyAction = (session) => {
    const previewSession = cloneLiveSocietySession(session);
    const nextAction = advanceLiveSocietySession(previewSession);
    if (!nextAction || !nextAction.event) return undefined;
    return {
      ...nextAction,
      session: previewSession,
    };
  };

  const finalizeLiveSocietySession = (session) => {
    const compressedTxs = createCompressedTxs(session.receipts, session.config);
    const tokenizedAgents = createTokenizedAgents(
      session.events,
      session.receipts,
    );
    const occupancyGrid = createOccupancyGrid(
      session.allAgents,
      session.config.gridSize,
    );
    const graph = createReceiptGraph({
      agents: session.allAgents,
      events: session.events,
      receipts: session.receipts,
      compressedTxs,
      tokenizedAgents,
      commonsBalance: session.commonsBalance,
    });

    return {
      version: 2,
      runId: `run_${hashHex({
        config: session.config,
        receipts: session.receipts.length,
        events: session.events.length,
      }).slice(0, 16)}`,
      config: session.config,
      agents: session.allAgents,
      grid: {
        size: session.config.gridSize,
        cells: occupancyGrid,
        resources: session.resources.slice(),
        resourceCaps: session.caps.slice(),
        ...(Array.isArray(session.biosphere)
          ? { biosphere: session.biosphere.slice() }
          : {}),
      },
      timeline: session.timeline.slice(),
      events: session.events.slice(),
      receipts: session.receipts.slice(),
      compressedTxs,
      tokenizedAgents,
      graph,
      metrics: {
        liveAgents: liveAgents(session.allAgents).length,
        liveCells: occupancyGrid.filter(Boolean).length,
        totalTokens: session.allAgents.reduce(
          (total, agent) => total + agent.tokens,
          0,
        ),
        totalTokenVolume: session.totalTokenVolume,
        receipts: session.receipts.length,
        compressedTxs: compressedTxs.length,
        commonsBalance: session.commonsBalance,
        resourceTotal: session.resources.reduce(
          (total, value) => total + value,
          0,
        ),
        heartbeats: session.events.filter(
          (event) => event.action === "heartbeat",
        ).length,
        births: session.events.filter((event) => event.action === "birth")
          .length,
        deaths: session.events.filter((event) => event.action === "death")
          .length,
      },
      leaderboard: createLeaderboard(session.allAgents),
    };
  };

  const runSocietySimulation = (input) => {
    const session = createLiveSocietySession(input);
    while (advanceLiveSocietySession(session)) {
      continue;
    }
    return finalizeLiveSocietySession(session);
  };

  return {
    DEFAULT_SOCIETY_CONFIG,
    createDistinctAgentPalette,
    createLiveSocietySession,
    deserializeLiveSocietySession,
    peekNextSocietyAction,
    packOnchainSocietyWorldState,
    packLiveSocietyWorldState,
    readLiveSocietyFrame: summarizeCurrentLiveFrame,
    restorePackedLiveSocietySession,
    serializeLiveSocietySession,
    advanceLiveSocietySession,
    finalizeLiveSocietySession,
    evolveLifeGrid,
    gridFromCoordinates,
    coordinatesFromGrid,
    runSocietySimulation,
    hashHex,
  };
});
