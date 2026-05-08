export type Cell = {
  x: number
  y: number
}

export type SocietyEventLike = {
  id: string
  tick: number
  agentId: string
  action: string
  cell: Cell
}

export type SimulationFormDraft = {
  agents: string
  ticks: string
  initialTokens: string
  universalIncome: string
  livingCost: string
  gridSize: string
  receiptsPerCompressedTx: string
  seed: string
  pattern: string
}

export type AgentArchetypeChoice = {
  id: string
  name: string
  description: string
}

export type OnboardingTemplate = {
  id: string
  name: string
  cue: string
  description: string
  pattern: string
  form: SimulationFormDraft
}

export type OnboardingLiveFrameLike = {
  tick: number
  liveAgents: number
  liveCells: number
  totalTokens: number
  receipts: number
  compressedTxs: number
  births: Cell[]
  deaths: Cell[]
}

export type OnboardingLiveAgentLike = Cell & {
  id: string
  name: string
  tokens: number
  alive: boolean
  reputation?: number
  inheritedReputation?: number
}

export type OnboardingLiveEventLike = {
  id: string
  tick: number
  action: string
  agentId?: string
  agentName?: string
  cell: Cell
  note?: string
}

export type OnboardingLiveWindowModel = {
  statusLine: string
  worldMetrics: Array<{ label: string; value: number }>
  traceItems: Array<{ id: string; label: string; detail: string }>
  lineSummary?: {
    headline: string
    stats: Array<{ label: string; value: number | string }>
  }
}

export type OnboardingMissionStage = "world" | "agent" | "board"

export type OnboardingMissionModel = {
  stage: OnboardingMissionStage
  headline: string
  body: string
  primaryActionLabel: string
  primaryActionDisabled: boolean
  observationPending: boolean
  worldLabel: string
  lineLabel: string
  progressItems: Array<{
    id: OnboardingMissionStage
    label: string
    complete: boolean
    current: boolean
  }>
  focusMoment?: {
    title: string
    detail: string
    whyItMatters: string
  }
}

type PatternOverride = {
  scenario: string
  resourceCap: number
  resourceRegrowth: number
  birthThreshold: number
  aidThreshold: number
  vision: number
  maxAge: number
  lifeDensity: number
  seasonLength: number
  stipendSwing: number
  regrowthSwing: number
  biosphereBoost: number
  spawnSpacing: number
  initialCells?: Cell[]
}

const EXTRA_TEMPLATE_PREFIXES = [
  "Citadel",
  "Cinder",
  "Glass",
  "Signal",
  "Vault",
  "Ash",
]

const EXTRA_TEMPLATE_SUFFIXES = [
  "Bloom",
  "Wake",
  "March",
  "Spill",
  "Thaw",
  "Exodus",
]

const EXTRA_TEMPLATE_CUES = [
  "Watch power gather in the center before parent-child lines split.",
  "A public system runs too hot, then spills damage across the grid in waves.",
  "A moving frontier stays alive only if handoffs keep pace with distance.",
]

const EXTRA_TEMPLATE_PATTERNS = ["empire", "reactor", "frontier"] as const

const ONBOARDING_MISSION_ORDER: OnboardingMissionStage[] = [
  "world",
  "agent",
  "board",
]

const ONBOARDING_MISSION_LABELS: Record<OnboardingMissionStage, string> = {
  world: "Choose a world",
  agent: "Follow an agent",
  board: "Open records",
}

const ONBOARDING_MISSION_PRIORITY: Record<string, number> = {
  inherit: 0,
  death: 1,
  aid: 2,
  birth: 3,
  harvest: 4,
}

const hashIndex = (seed: string, modulo: number, salt = "") => {
  let value = 2166136261
  const text = `${seed}:${salt}`
  for (let index = 0; index < text.length; index += 1) {
    value ^= text.charCodeAt(index)
    value = Math.imul(value, 16777619)
  }
  return Math.abs(value >>> 0) % modulo
}

const formForPattern = (
  pattern: string,
  seed: string,
  overrides?: Partial<SimulationFormDraft>
): SimulationFormDraft => ({
  agents: "6",
  ticks: "14",
  initialTokens: "38",
  universalIncome: "6",
  livingCost: "5",
  gridSize: "22",
  receiptsPerCompressedTx: "6",
  seed,
  pattern,
  ...overrides,
})

export const AGENT_ARCHETYPE_CHOICES: AgentArchetypeChoice[] = [
  {
    id: "Forager",
    name: "Forager",
    description: "Looks for resources and tries to stay alive.",
  },
  {
    id: "Steward",
    name: "Steward",
    description: "Helps nearby agents survive pressure.",
  },
  {
    id: "Scout",
    name: "Scout",
    description: "Moves outward to find safer squares.",
  },
  {
    id: "Builder",
    name: "Builder",
    description: "Uses extra tokens to start child agents.",
  },
  {
    id: "Mutualist",
    name: "Mutualist",
    description: "Shares value when another agent is weak.",
  },
]

export const CURATED_ONBOARDING_TEMPLATES: OnboardingTemplate[] = [
  {
    id: "empire-ascent",
    name: "Empire Ascent",
    cue: "A dense center forms, then child agents split out from it.",
    description:
      "Best for seeing parent links, inherited value, and growing history.",
    pattern: "empire",
    form: formForPattern("empire", "empire-ascent", {
      agents: "5",
      ticks: "14",
      initialTokens: "40",
      universalIncome: "6",
      livingCost: "5",
      gridSize: "22",
    }),
  },
  {
    id: "reactor-breach",
    name: "Reactor Breach",
    cue: "A hot center runs out of room and weak agents start failing.",
    description:
      "Best for seeing why receipts matter when things go wrong.",
    pattern: "reactor",
    form: formForPattern("reactor", "reactor-breach", {
      agents: "5",
      ticks: "16",
      initialTokens: "34",
      universalIncome: "4",
      livingCost: "8",
      gridSize: "22",
    }),
  },
  {
    id: "frontier-convoy",
    name: "Frontier Convoy",
    cue: "A small group moves across the board and survives by helping.",
    description:
      "Best for seeing movement, help, and one agent's path over time.",
    pattern: "frontier",
    form: formForPattern("frontier", "frontier-convoy", {
      agents: "6",
      ticks: "14",
      initialTokens: "36",
      universalIncome: "6",
      livingCost: "5",
      gridSize: "22",
    }),
  },
]

export const getPatternConfigOverrides = (
  pattern: string,
  size: number
): PatternOverride => {
  const center = Math.floor(size / 2)
  if (pattern === "empire") {
    return {
      scenario: "dynasty",
      resourceCap: 9,
      resourceRegrowth: 3,
      birthThreshold: 150,
      aidThreshold: 30,
      vision: 3,
      maxAge: 22,
      lifeDensity: 0.42,
      seasonLength: 4,
      stipendSwing: 2,
      regrowthSwing: 1,
      biosphereBoost: 2,
      spawnSpacing: 2,
      initialCells: [
        { x: center - 1, y: center - 1 },
        { x: center, y: center - 1 },
        { x: center + 1, y: center - 1 },
        { x: center - 2, y: center },
        { x: center - 1, y: center },
        { x: center, y: center },
      ],
    }
  }
  if (pattern === "reactor") {
    return {
      scenario: "worldseed",
      resourceCap: 8,
      resourceRegrowth: 1,
      birthThreshold: 140,
      aidThreshold: 18,
      vision: 3,
      maxAge: 13,
      lifeDensity: 0.18,
      seasonLength: 2,
      stipendSwing: -1,
      regrowthSwing: -1,
      biosphereBoost: 0,
      spawnSpacing: 1,
      initialCells: [
        { x: center, y: center - 2 },
        { x: center + 1, y: center - 2 },
        { x: center - 1, y: center - 1 },
        { x: center, y: center - 1 },
        { x: center, y: center },
      ],
    }
  }
  if (pattern === "frontier") {
    return {
      scenario: "frontier",
      resourceCap: 9,
      resourceRegrowth: 2,
      birthThreshold: 126,
      aidThreshold: 20,
      vision: 4,
      maxAge: 17,
      lifeDensity: 0.24,
      seasonLength: 2,
      stipendSwing: 1,
      regrowthSwing: 1,
      biosphereBoost: 0,
      spawnSpacing: 1,
      initialCells: [
        { x: 1, y: center - 1 },
        { x: 2, y: center },
        { x: 0, y: center + 1 },
        { x: 1, y: center + 1 },
        { x: 2, y: center + 1 },
      ],
    }
  }

  return {
    scenario: pattern,
    resourceCap: 7,
    resourceRegrowth: 2,
    birthThreshold: 96,
    aidThreshold: 32,
    vision: 2,
    maxAge: 18,
    lifeDensity: 0.34,
    seasonLength: 3,
    stipendSwing: 0,
    regrowthSwing: 0,
    biosphereBoost: 0,
    spawnSpacing: 2,
  }
}

export const createMoreOnboardingTemplates = (
  seed: string
): OnboardingTemplate[] =>
  EXTRA_TEMPLATE_PATTERNS.map((pattern, index) => {
    const prefix =
      EXTRA_TEMPLATE_PREFIXES[
        hashIndex(
          seed,
          EXTRA_TEMPLATE_PREFIXES.length,
          `${pattern}-prefix-${index}`
        )
      ]
    const suffix =
      EXTRA_TEMPLATE_SUFFIXES[
        hashIndex(
          seed,
          EXTRA_TEMPLATE_SUFFIXES.length,
          `${pattern}-suffix-${index}`
        )
      ]
    const name = `${prefix} ${suffix}`
    return {
      id: `${pattern}-${prefix.toLowerCase()}-${suffix.toLowerCase()}`,
      name,
      cue: EXTRA_TEMPLATE_CUES[index],
      description: `Generated from the ${pattern} pattern with the same live-first observability stack.`,
      pattern,
      form: formForPattern(pattern, `${seed}-${pattern}-${index}`, {
        agents: String(6 + index),
        ticks: String(14 + index * 2),
      }),
    }
  })

export const pickRandomAgentChoice = (seed: string): AgentArchetypeChoice =>
  AGENT_ARCHETYPE_CHOICES[
    hashIndex(seed, AGENT_ARCHETYPE_CHOICES.length, "agent-choice")
  ]

export const buildAgentPath = (
  events: SocietyEventLike[],
  agentId: string,
  currentCell?: Cell
) => {
  const points = events
    .filter((event) => event.agentId === agentId)
    .sort(
      (left, right) => left.tick - right.tick || left.id.localeCompare(right.id)
    )
    .map((event) => event.cell)

  if (currentCell) {
    const lastPoint = points.at(-1)
    if (
      !lastPoint ||
      lastPoint.x !== currentCell.x ||
      lastPoint.y !== currentCell.y
    ) {
      points.push(currentCell)
    }
  }

  return points
}

export const buildOnboardingLiveWindowModel = ({
  frame,
  templateName,
  selectedAgent,
  visibleEvents,
}: {
  frame: OnboardingLiveFrameLike
  templateName?: string
  selectedAgent?: OnboardingLiveAgentLike
  visibleEvents: OnboardingLiveEventLike[]
}): OnboardingLiveWindowModel => ({
  statusLine: `${templateName || "Custom world"} running at tick ${frame.tick}`,
  worldMetrics: [
    { label: "Agents", value: frame.liveAgents },
    { label: "Squares", value: frame.liveCells },
    { label: "Births", value: frame.births.length },
    { label: "Deaths", value: frame.deaths.length },
    { label: "Receipts", value: frame.receipts },
    { label: "Tokens", value: frame.totalTokens },
  ],
  traceItems: visibleEvents.slice(0, 4).map((event) => ({
    id: event.id,
    label: `${event.action} · ${event.agentName || "unknown agent"}`,
    detail: `tick ${event.tick} @ ${event.cell.x},${event.cell.y}`,
  })),
  lineSummary: selectedAgent
    ? {
        headline: `${selectedAgent.name} at ${selectedAgent.x},${selectedAgent.y}`,
        stats: [
          { label: "Tokens", value: selectedAgent.tokens },
          { label: "Trust", value: selectedAgent.reputation ?? 0 },
          {
            label: "Inherited",
            value: selectedAgent.inheritedReputation ?? 0,
          },
          {
            label: "State",
            value: selectedAgent.alive ? "live" : "ended",
          },
        ],
      }
    : undefined,
})

const stageFromStep = (step: number): OnboardingMissionStage =>
  ONBOARDING_MISSION_ORDER[
    Math.max(0, Math.min(step, ONBOARDING_MISSION_ORDER.length - 1))
  ]

const buildMissionProgressItems = (stage: OnboardingMissionStage) => {
  const currentIndex = ONBOARDING_MISSION_ORDER.indexOf(stage)
  return ONBOARDING_MISSION_ORDER.map((item, index) => ({
    id: item,
    label: ONBOARDING_MISSION_LABELS[item],
    complete: index < currentIndex,
    current: index === currentIndex,
  }))
}

const pickMissionMoment = (
  selectedAgentEvents: OnboardingLiveEventLike[],
  selectedAgent?: OnboardingLiveAgentLike
) => {
  const meaningfulEvents = selectedAgentEvents
    .filter((event) => Object.hasOwn(ONBOARDING_MISSION_PRIORITY, event.action))
    .slice()
    .sort((left, right) => {
      const priorityDelta =
        ONBOARDING_MISSION_PRIORITY[left.action] -
        ONBOARDING_MISSION_PRIORITY[right.action]
      if (priorityDelta !== 0) return priorityDelta
      return right.tick - left.tick
    })

  const event = meaningfulEvents[0]
  if (!event) return undefined

  const actorName = event.agentName || selectedAgent?.name || "This agent"

  if (event.action === "inherit") {
    return {
      title: `${actorName} just carried value forward`,
      detail: `tick ${event.tick} @ ${event.cell.x},${event.cell.y}`,
      whyItMatters:
        "Death does not erase history. Value and trust can continue through a child agent.",
    }
  }

  if (event.action === "death") {
    return {
      title: `${actorName} just ended`,
      detail: `tick ${event.tick} @ ${event.cell.x},${event.cell.y}`,
      whyItMatters:
        "Failure is visible. The world keeps the record instead of hiding it in a chat log.",
    }
  }

  if (event.action === "aid") {
    return {
      title: `${actorName} just kept another agent alive`,
      detail: `tick ${event.tick} @ ${event.cell.x},${event.cell.y}`,
      whyItMatters:
        "Help is recorded. Later, reputation can come from this history.",
    }
  }

  if (event.action === "birth") {
    return {
      title: `${actorName} just created a child agent`,
      detail: `tick ${event.tick} @ ${event.cell.x},${event.cell.y}`,
      whyItMatters:
        "A birth creates a child agent with its own identity. The parent link shows where it came from.",
    }
  }

  return {
    title: `${actorName} just turned position into reserves`,
    detail: `tick ${event.tick} @ ${event.cell.x},${event.cell.y}`,
    whyItMatters:
      "A small action becomes part of the record. Later actions can point back to it.",
  }
}

export const buildOnboardingMissionModel = ({
  step,
  template,
  selectedArchetypeId,
  selectedAgent,
  selectedAgentEvents,
  visibleEvents,
}: {
  step: number
  template?: OnboardingTemplate
  selectedArchetypeId: string
  selectedAgent?: OnboardingLiveAgentLike
  selectedAgentEvents: OnboardingLiveEventLike[]
  visibleEvents?: OnboardingLiveEventLike[]
}): OnboardingMissionModel => {
  const stage = stageFromStep(step)
  const progressItems = buildMissionProgressItems(stage)
  const worldLabel = template?.name || "Custom world"
  const lineLabel = `${selectedArchetypeId} agent`
  const selectedFocusMoment = pickMissionMoment(
    selectedAgentEvents,
    selectedAgent
  )
  const focusMoment =
    selectedFocusMoment ??
    pickMissionMoment(
      (visibleEvents ?? []).filter(
        (event) => event.agentId !== selectedAgent?.id
      )
    )
  if (stage === "world") {
    return {
      stage,
      headline: "Agents need durable memory",
      body: "Pick a small world. Agents move, spend tokens, help, fail, and start child agents. Every meaningful action leaves a receipt.",
      primaryActionLabel: "Next: follow an agent",
      primaryActionDisabled: false,
      observationPending: false,
      worldLabel,
      lineLabel,
      progressItems,
    }
  }

  if (stage === "agent") {
    return {
      stage,
      headline: "Follow one agent first",
      body: "A society is hard to read from far away. Pick one agent and watch its path, lineage, tokens, and receipts.",
      primaryActionLabel: "Next: see records",
      primaryActionDisabled: false,
      observationPending: false,
      worldLabel,
      lineLabel,
      progressItems,
    }
  }

  return {
    stage,
    headline: "Open the records",
    body: "Now launch the Surfpool-backed world from this setup. You can see what is alive, what changed, who created whom, and where Surfpool records the accounts and transactions.",
    primaryActionLabel: "Start live world",
    primaryActionDisabled: false,
    observationPending: false,
    worldLabel,
    lineLabel,
    progressItems,
    focusMoment,
  }
}
