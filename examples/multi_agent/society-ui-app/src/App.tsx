import * as React from "react"
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Coins,
  Compass,
  FlaskConical,
  Globe,
  Hammer,
  Heart,
  Landmark,
  Maximize2,
  Minimize2,
  Radiation,
  Shield,
  Shuffle,
  Truck,
  UserRound,
} from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Empty, EmptyDescription } from "@/components/ui/empty"
import { Field, FieldLabel } from "@/components/ui/field"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { cn } from "@/lib/utils"
import {
  AGENT_ARCHETYPE_CHOICES,
  CURATED_ONBOARDING_TEMPLATES,
  buildAgentPath,
  buildOnboardingLiveWindowModel,
  buildOnboardingMissionModel,
  getPatternConfigOverrides,
  pickRandomAgentChoice,
} from "./society-experience"
import type {
  OnboardingMissionModel,
  OnboardingLiveWindowModel,
  OnboardingTemplate,
} from "./society-experience"

type Cell = {
  x: number
  y: number
}

type CellAgent = Cell & {
  id: string
  identityId: string
  name: string
  prompt: string
  image: string
  imageAlt: string
  archetype?: string
  isHero?: boolean
  tokens: number
  startingTokens?: number
  alive: boolean
  score: number
  receipts: number
  bornTick: number
  lastTick: number
  age?: number
  livenessProofs?: number
  descendants: number
  generation: number
  parentIds: string[]
  harvestTotal?: number
  aidGiven?: number
  aidReceived?: number
  inheritedTokens?: number
  earnedReputation?: number
  inheritedReputation?: number
  reputation?: number
  rank?: number
}

type SocietyEvent = {
  id: string
  tick: number
  agentId: string
  agentName: string
  actorIdentityId?: string
  actorPrompt?: string
  actorImage?: string
  action: string
  receiptKind: string
  tokenDelta: number
  cell: Cell
  counterpartyId?: string
  parentIds: string[]
  parentCoordinates: Cell[]
  note: string
  payloadExtras?: Record<string, unknown>
}

type ReceiptNode = {
  id: string
  type: "receipt"
  kind: string
  action: string
  actorId: string
  actorName: string
  actorIdentityId?: string
  actorPrompt?: string
  actorImage?: string
  tick: number
  batchId: string
  previousReceiptId?: string
  payloadHash: string
  slot: number
  cell: Cell
  parentIds: string[]
  parentCoordinates: Cell[]
}

type BatchNode = {
  id: string
  type: "batch"
  eventRoot: string
  receiptCount: number
  slotStart: number
  slotEnd: number
  compression: string
}

type ProgramNode = {
  name: string
  role: string
}

type ProgramWiringStep = {
  name: string
  action: string
  demoRole: "board-primary" | "supporting-trust-program"
  status: "wired"
  expectedRecords: number
  demoSurface: string
  evidence: string
  boundary: string
}

type ProgramWiringPlan = {
  programs: ProgramWiringStep[]
  summary: {
    totalPrograms: number
    compressedBatches: number
    tokenizedAgents: number
    emittedReceipts: number
  }
}

type ProtocolEvidenceRecord = {
  label: string
  source: "account" | "operation" | "receipt" | "action-envelope"
  address?: string
  signature?: string
  slot?: number
  agentId?: string
  receiptId?: string
  txSignature?: string
  hash?: string
  note?: string
}

type ProtocolProgramEvidence = {
  name: string
  demoRole: "board-primary" | "supporting-trust-program"
  demoSurface: string
  boundary: string
  status: "present" | "missing"
  expectedRecords: number
  records: ProtocolEvidenceRecord[]
  missing: string[]
}

type ProtocolEvidenceGraph = {
  schemaVersion: number
  graphHash: string
  generatedAt: string
  programs: ProtocolProgramEvidence[]
  summary: {
    totalPrograms: number
    presentPrograms: number
    missingPrograms: number
    records: number
    receipts: number
    actionEnvelopes: number
    transactions: number
  }
}

type TokenizedAgent = {
  agentId: string
  agentName: string
  sourceEventId: string
  sourceReceiptId?: string
  tick: number
  cell: Cell
  startingTokens: number
  tokenProgram: string
  agentIdentityId?: string
  agentPrompt?: string
  agentImage?: string
}

type SocietyGraph = {
  programs: ProgramNode[]
  nodes: Array<ReceiptNode | BatchNode | Record<string, unknown>>
  edges: Array<{ from: string; to: string; type: string }>
  summary: {
    agents: number
    receipts: number
    batches: number
    edges: number
  }
}

type CompressedTx = {
  batchId: string
  slotStart: number
  slotEnd: number
  eventRoot: string
  receipts: Array<{
    receiptId: string
    kind: string
    actorId: string
    payloadHash: string
  }>
}

type TimelineFrame = {
  tick: number
  cells: boolean[]
  resources?: number[]
  resourceCaps?: number[]
  agents: CellAgent[]
  leaderboard: CellAgent[]
  liveCells: number
  liveAgents: number
  totalTokens: number
  receipts: number
  compressedTxs: number
  resourceTotal?: number
  commonsBalance?: number
  births: Cell[]
  deaths: Cell[]
  survivors: Cell[]
}

type SocietyResult = {
  version: number
  runId: string
  config: {
    agents: number
    ticks: number
    initialTokens: number
    universalIncome?: number
    livingCost?: number
    gridSize: number
    resourceCap?: number
    resourceRegrowth?: number
    birthThreshold?: number
    aidThreshold?: number
    vision?: number
    maxAge?: number
    scenario?: string
    lifeDensity?: number
    initialMode?: string
    seasonLength?: number
    stipendSwing?: number
    regrowthSwing?: number
    biosphereBoost?: number
    spawnSpacing?: number
    heroArchetype?: string
    receiptsPerCompressedTx: number
    seed: string
    initialCells?: Cell[]
    actionSource?: {
      kind: "simulation" | "pi-agent" | "pi-llm" | "external"
      driver: string
      note?: string
    }
  }
  agents: CellAgent[]
  grid: {
    size: number
    cells: boolean[]
    resources?: number[]
    resourceCaps?: number[]
  }
  timeline: TimelineFrame[]
  events: SocietyEvent[]
  receipts: Array<{
    receiptId: string
    kind: string
    payloadHash: string
  }>
  compressedTxs: CompressedTx[]
  tokenizedAgents: TokenizedAgent[]
  graph: SocietyGraph
  metrics: {
    liveAgents: number
    liveCells: number
    totalTokens: number
    totalTokenVolume: number
    receipts: number
    compressedTxs: number
    commonsBalance?: number
    resourceTotal?: number
    heartbeats?: number
    births?: number
    deaths?: number
  }
  leaderboard: CellAgent[]
}

type SocietyCore = {
  coordinatesFromGrid: (grid: boolean[], size: number) => Cell[]
  createDistinctAgentPalette: (input: {
    agentIds: string[]
    configuredAgentCount: number
    seed: string
  }) => Record<string, string>
  runSocietySimulation: (
    config: Partial<SocietyResult["config"]>
  ) => SocietyResult
}

type StackGraphRow = {
  name: string
  action: string
  expectedRecords: number
  operationCount: number
  address?: string
  latestOperation?: string
}

type CommitProofReference = {
  id: string
  file: string
  url: string
  hash: string
  status: "prepared" | "committed" | "failed"
}

type AgentActionEnvelope = {
  agentId: string
  identityAddress: string
  taskAddress: string
  tick: number | null
  action: string
  receiptAddress: string
  receiptPayloadHash: string
  txSignature: string
  slot: number
  agentSignature: string
  transcriptRoot: string
  leafHash: string
}

type LiveCommittedAction = {
  address: string
  signature: string
  slot: number
  eventId: string
  action: string
  tick: number
  agentId: string
  actionProof?: {
    actionEnvelope?: AgentActionEnvelope
    transcriptRoot: string
    leafHash: string
    signer: string
    signature: string
    scheme: string
    beforeStateHash?: string
    beforeStateSignature?: string
    beforeStateScheme?: string
    afterStateHash?: string
    afterStateSignature?: string
    afterStateScheme?: string
    runtimeEvidence?: {
      kind: "pi-action"
      provider: string
      modelId: string
      promptHash: string
      responseHash: string
      decisionHash: string
    }
    submitter?: string
    delegation?: string
  }
}

type LiveSessionSnapshot = {
  sessionId: string
  status: "paused" | "running" | "complete"
  config: SocietyResult["config"]
  confirmedFrame: TimelineFrame
  pendingFrame?: TimelineFrame
  pendingAction?: SocietyEvent
  confirmedEvents: SocietyEvent[]
  confirmedReceipts: Array<{ receiptId: string }>
  committedActions: LiveCommittedAction[]
  proof?: CommitProofReference
  lastError?: string
}

type LiveStreamMessage = {
  type: "snapshot" | "pending" | "confirmed" | "error" | "complete"
  snapshot: LiveSessionSnapshot
}

type LiveStartResponse = {
  sessionId: string
  snapshot: LiveSessionSnapshot
}

type LiveAgentAccount = {
  agentId: string
  agentName?: string
  authority: {
    address: string
    identityDirectory: string
    keypairPath: string
    created: boolean
  }
  startingTokens: string
  tokenProgram: string
  identity: {
    id: string
    address: string
    signature?: string
  }
  delegation: {
    address: string
    delegate: string
    signature?: string
  }
  stake: {
    address: string
    signature?: string
    slot?: number
  }
  funding?: {
    lamports: string
    signature?: string
  }
}

type LiveIdentityAccount = {
  id: string
  address: string
}

type LiveTaskAccount = {
  id: string
  address: string
}

type LiveReputationAccount = {
  address: string
  domain?: string
}

type LiveCheckpointAccount = {
  address: string
  latestCheckpoint?: string
  epoch?: string
}

type LiveAdjudicatorAccount = {
  address: string
  adjudicator?: string
  treasuryVault?: string
}

type AgentAccountLike = LiveAgentAccount

type LiveSetupStatus = {
  stakeAsset: string
  requestedAgentCount: number
  readyAgentCount: number
  fundedAgentCount: number
  identityAccountCount: number
  delegationAccountCount: number
  solStakeAccountCount: number
  protocolOperationCount: number
  worldReady: boolean
}

type LiveSessionAccountSnapshot = {
  sessionId: string
  rpcUrl: string
  studioUrl: string
  identity: LiveIdentityAccount
  task: LiveTaskAccount
  reputation: LiveReputationAccount
  checkpoint: LiveCheckpointAccount
  adjudicator: LiveAdjudicatorAccount
  world: {
    address: string
    status: number
  }
  setup: LiveSetupStatus
  agentAccounts: LiveAgentAccount[]
  programPlan: ProgramWiringPlan
  protocolEvidence: ProtocolEvidenceGraph
}

type PublicLinkConfig = {
  rpcUrl: string
  studioUrl: string
}

type FixedBoardCommentary = {
  label: string
  detail: string
}

type SimulationForm = {
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

declare global {
  interface Window {
    TrustSubstrateSociety?: SocietyCore
  }
}

const OPTIMAL_FORM: SimulationForm = { ...CURATED_ONBOARDING_TEMPLATES[0].form }

const LIVE_WORLD_STATUS_ACTIVE = 0
const LIVE_WORLD_STATUS_COMPLETE = 1
const LIVE_PROGRAMS: ProgramNode[] = [
  { name: "identity_registry", role: "who owns the main identity" },
  { name: "attester_registry", role: "who can attest to identity evidence" },
  { name: "task_registry", role: "the live world account" },
  { name: "receipt_emitter", role: "action receipts" },
  { name: "delegation_engine", role: "who may act for whom" },
  { name: "proof_verifier", role: "checkpoint links and history" },
  { name: "reputation_accumulator", role: "trust updates" },
  { name: "dispute_resolver", role: "dispute results" },
  { name: "agent_stake", role: "agent stake" },
]
const SURFPOOL_RPC_URL = "http://127.0.0.1:8898"
const SURFPOOL_STUDIO_URL = "http://127.0.0.1:18488"
const SOLANA_EXPLORER_BASE_URL = "https://explorer.solana.com"
const MINIMUM_GRID_PIXEL_SIZE = 1
const GRAPH_NODE_LIMIT = 6
const GRAPH_VIEWBOX_WIDTH = 760
const GRAPH_VIEWBOX_HEIGHT = 250
const GRAPH_TOP = 32
const GRAPH_ROW_GAP = 34
const GRAPH_AGENT_X = 44
const GRAPH_RECEIPT_X = 330
const GRAPH_BATCH_X = 640
const GRAPH_NODE_SIZE = 24
const GRAPH_RECEIPT_WIDTH = 130
const GRAPH_RECEIPT_HEIGHT = 20
const GRAPH_BATCH_WIDTH = 72
const GRAPH_BATCH_HEIGHT = 24
const GRAPH_LABEL_Y = 18
const GRAPH_TEXT_OFFSET_X = 8
const GRAPH_AGENT_NAME_OFFSET_Y = 10
const GRAPH_AGENT_ID_OFFSET_Y = 23
const GRAPH_RECEIPT_TEXT_OFFSET_Y = 13
const GRAPH_BATCH_TEXT_OFFSET_Y = 15
const GRAPH_NODE_RADIUS = 4
const GRAPH_EDGE_WIDTH = 1
const STACK_VIEWBOX_HEIGHT = 360
const STACK_TOP = 32
const STACK_ROW_GAP = 35
const STACK_PROGRAM_X = 36
const STACK_ACCOUNT_X = 350
const STACK_OPERATION_X = 635
const STACK_PROGRAM_WIDTH = 190
const STACK_ACCOUNT_WIDTH = 160
const STACK_OPERATION_WIDTH = 86
const STACK_NODE_HEIGHT = 22
const STACK_TEXT_OFFSET_Y = 14
const FAMILY_GRAPH_AGENT_LIMIT = 12
const FAMILY_GRAPH_VIEWBOX_WIDTH = 760
const FAMILY_GRAPH_VIEWBOX_HEIGHT = 300
const FAMILY_GRAPH_LEFT = 52
const FAMILY_GRAPH_TOP = 50
const FAMILY_GRAPH_COLUMN_GAP = 170
const FAMILY_GRAPH_ROW_GAP = 52
const FAMILY_GRAPH_NODE_WIDTH = 126
const FAMILY_GRAPH_NODE_HEIGHT = 34
const FAMILY_GRAPH_NODE_RADIUS = 5
const FAMILY_GRAPH_LABEL_OFFSET_X = 10
const FAMILY_GRAPH_NAME_OFFSET_Y = 15
const FAMILY_GRAPH_META_OFFSET_Y = 28
const FAMILY_GRAPH_EDGE_INSET = 4
const SECTION_CARD_CLASS =
  "rounded-lg border border-border/80 bg-card py-0 shadow-none ring-1 ring-foreground/8 backdrop-blur-[3px]"
const SECTION_HEADER_CLASS = "border-b border-border/80 py-3"
const PANEL_SURFACE_CLASS =
  "rounded-lg border border-border/80 bg-background/35 p-3 shadow-none backdrop-blur-[3px]"
const PLAYGROUND_DETAIL_PANEL_CLASS =
  "rounded-lg border border-border/80 bg-background/35 p-3 shadow-none backdrop-blur-[3px]"
const INTERACTIVE_PANEL_CLASS =
  "rounded-lg border border-border/80 bg-background/35 p-3 text-left shadow-none backdrop-blur-[3px] transition-[border-color,background-color,box-shadow,transform] duration-150 hover:border-foreground/35 hover:bg-background/50 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/70 focus-visible:ring-offset-2 focus-visible:ring-offset-background active:translate-y-px"
const SELECTED_PANEL_CLASS =
  "border-primary/75 bg-background/45 ring-2 ring-primary/50"
const METRIC_SURFACE_CLASS =
  "rounded-lg border border-border/75 bg-background/30 p-3 shadow-none backdrop-blur-[2px]"
const GRAPH_SURFACE_CLASS =
  "relative overflow-hidden rounded-md border border-border bg-background/30 backdrop-blur-[3px] fullscreen:bg-background"
const GRAPH_FULLSCREEN_BUTTON_CLASS =
  "absolute right-2 top-2 size-10 border-border bg-background/40 text-foreground backdrop-blur-[3px] hover:bg-background/60"
const GRAPH_SVG_CLASS = "block h-64 w-full"
const GRAPH_FULLSCREEN_SVG_CLASS = "block h-svh w-full"
const PLAYGROUND_FULLSCREEN_BUTTON_CLASS =
  "size-10 border-border bg-background/40 text-foreground backdrop-blur-[3px] hover:bg-background/60"
const PLAYGROUND_FULLSCREEN_CLASS =
  "society-playground-fullscreen grid h-svh max-h-svh grid-rows-[auto_minmax(0,1fr)_auto_auto_auto] content-stretch overflow-hidden bg-background p-2 fullscreen:bg-background md:p-3"
const PLAYGROUND_STACK_CLASS =
  "relative grid min-h-0 min-w-0 content-start gap-1.5"
const PLAYGROUND_BOARD_SURFACE_CLASS = "relative"
const PLAYGROUND_FULLSCREEN_BOARD_CLASS = "min-h-0 overflow-hidden"
const PLAYGROUND_CANVAS_CLASS =
  "block h-[520px] w-full rounded-md bg-transparent max-md:h-[420px] focus-visible:ring-2 focus-visible:ring-ring/70 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
const PLAYGROUND_FULLSCREEN_CANVAS_CLASS = "h-full min-h-0"
const PREPARATION_STEP_DETAIL_CLASS =
  "mt-1 whitespace-normal break-words font-mono text-xs leading-5 text-muted-foreground"
const AGENT_IMAGE_CLASS =
  "size-8 shrink-0 rounded-md border border-border bg-background/40"
const EVENT_IMAGE_CLASS =
  "size-6 shrink-0 rounded-md border border-border bg-background/40"
const EMPTY_STATE_CLASS =
  "min-h-32 rounded-lg border border-dashed border-border bg-background/20 backdrop-blur-[3px]"
const PLAYGROUND_EMPTY_STATE_CLASS =
  "min-h-20 rounded-lg border border-dashed border-border bg-background/20 backdrop-blur-[3px]"
const numberFormat = new Intl.NumberFormat("en-US")
const BOARD_FIELD_FILL = "rgba(0,0,0,0)"
const BOARD_FIELD_BORDER = "rgba(255,255,255,0.96)"
const NEWBORN_AGENT_FILL = "rgba(255,255,255,0.96)"
const LIVE_AGENT_FILL = "rgba(255,255,255,0.54)"
const DEATH_AGENT_FILL = "rgba(255,255,255,0.08)"
const DEATH_MARK_BORDER = "rgba(255,255,255,0.82)"
const DEATH_MARK_STRIPE = "rgba(255,255,255,0.42)"
const BOARD_PREVIOUS_CELL_BORDER = "rgba(255,255,255,0.58)"
const BOARD_SELECTED_CELL_BORDER = "rgba(255,255,255,0.98)"
const BOARD_HOVER_CELL_BORDER = "rgba(255,255,255,0.74)"
const BOARD_SELECTION_GLOW = "rgba(255,255,255,0.26)"
const BOARD_MARK_LINE_WIDTH = 3
const BOARD_SELECTION_LINE_WIDTH = 2
const BOARD_SELECTION_GLOW_BLUR = 8
const BOARD_STRIPE_SPACING = 4
const BOARD_STRIPE_WIDTH = 1
const BOARD_DASH_LENGTH = 3
const DEATH_MARK_DURATION_MS = 3600
const MAX_ONBOARDING_STEP = 2
const ONBOARDING_VISIBLE_METRIC_COUNT = 4
const ONBOARDING_VISIBLE_TRACE_COUNT = 3
const ONBOARDING_CURATED_TEMPLATE_COUNT = 3
const ONBOARDING_INSET_CARD_CLASS =
  "border-border/65 bg-background/45 shadow-none backdrop-blur-[2px]"
const ONBOARDING_SELECT_ITEM_CLASS =
  "relative h-full w-full items-stretch justify-start whitespace-normal rounded-lg border border-border/70 bg-background/35 px-0 py-0 text-left text-base shadow-none transition-[border-color,background-color,transform] duration-150 motion-safe:hover:-translate-y-0.5 hover:border-foreground/25 hover:bg-background/50 data-[state=on]:border-primary/80 data-[state=on]:bg-primary/10"
const ONBOARDING_STORY_POINTS = [
  {
    title: "Memory disappears",
    detail:
      "Most demos end as a chat log. This world keeps a receipt after every meaningful action.",
  },
  {
    title: "Lineage gets blurry",
    detail:
      "When one agent starts or helps another, the parent link stays visible.",
  },
  {
    title: "Trust needs evidence",
    detail:
      "Reputation is derived from receipts instead of direct score edits.",
  },
]
const ONBOARDING_PROOF_POINTS = [
  ["Identity", "Every agent has an addressable record."],
  ["Receipt", "Every meaningful action leaves evidence."],
  ["Parent link", "Birth creates a child agent with its own identity."],
  ["Surfpool", "Accounts and actions are inspectable in Studio and Explorer."],
]
const SOCIETY_TOKEN_SYMBOL = "$SUBSOL"

type IconComponent = React.ComponentType<React.SVGProps<SVGSVGElement>>

const TEMPLATE_ICONS: Record<string, IconComponent> = {
  "empire-ascent": Landmark,
  "reactor-breach": Radiation,
  "frontier-convoy": Truck,
}

const ARCHETYPE_ICONS: Record<string, IconComponent> = {
  Forager: Compass,
  Steward: Shield,
  Scout: Globe,
  Builder: Hammer,
  Mutualist: Heart,
}

type SocietyPageView = "world" | "agents"

const format = (value: number | string | undefined) =>
  typeof value === "number" ? numberFormat.format(value) : String(value ?? "")

const formatTokenDelta = (value: number | undefined) => {
  if (typeof value !== "number") return "0"
  return value > 0 ? `+${format(value)}` : format(value)
}

const formatSocietyTokenAmount = (value: number | string | undefined) =>
  `${format(value)} ${SOCIETY_TOKEN_SYMBOL}`

const formatSocietyTokenDelta = (value: number | undefined) =>
  `${formatTokenDelta(value)} ${SOCIETY_TOKEN_SYMBOL}`

const formatAgentName = (agentId: string, frame: TimelineFrame) =>
  frame.leaderboard.find((agent) => agent.id === agentId)?.name ||
  short(agentId, 4)

const agentRole = (agent: Pick<CellAgent, "archetype">) =>
  agent.archetype || "Agent"

const buildFixedBoardCommentary = ({
  liveSnapshot,
  frame,
}: {
  liveSnapshot?: LiveSessionSnapshot
  frame: TimelineFrame
}): FixedBoardCommentary => {
  const latestEvent = liveSnapshot?.confirmedEvents.at(-1)
  if (!liveSnapshot || !latestEvent) {
    return {
      label: "No world is open in this browser.",
      detail: `Launch from onboarding to prepare paused Surfpool records. Board preview: tick ${format(
        frame.tick
      )}, ${format(frame.liveAgents)} agents, ${format(
        frame.liveCells
      )} occupied cells.`,
    }
  }

  if (latestEvent.action === "birth") {
    const parentNames = latestEvent.parentIds
      .map((parentId) => formatAgentName(parentId, frame))
      .join(", ")
    return {
      label: `Tick ${format(latestEvent.tick)}: ${
        latestEvent.agentName
      } was born at square ${format(latestEvent.cell.x)},${format(
        latestEvent.cell.y
      )}.`,
      detail: parentNames
        ? `Parent: ${parentNames}. Birth created a child agent with its own identity.`
        : "Parent: none. This is a first-generation agent.",
    }
  }

  return {
    label: `Tick ${format(latestEvent.tick)}: ${
      latestEvent.agentName || latestEvent.agentId
    } ${latestEvent.action} at square ${format(latestEvent.cell.x)},${format(
      latestEvent.cell.y
    )}.`,
    detail: `Receipt ${latestEvent.receiptKind}; ${SOCIETY_TOKEN_SYMBOL} change ${formatTokenDelta(
      latestEvent.tokenDelta
    )}; committed actions ${format(liveSnapshot.committedActions.length)}.`,
  }
}

const short = (value: string | undefined, size = 6) =>
  value && value.length > size * 2 + 3
    ? `${value.slice(0, size)}...${value.slice(-size)}`
    : value || ""

const readExperienceView = (): SocietyPageView => {
  if (typeof window === "undefined") return "world"
  const view = new URLSearchParams(window.location.search).get("view")
  return view === "agents" ? "agents" : "world"
}

const readSelectedAgentFromLocation = () => {
  if (typeof window === "undefined") return undefined
  return new URLSearchParams(window.location.search).get("agent") || undefined
}

const writeExperienceLocation = (
  view: SocietyPageView,
  agentId?: string,
  entered?: boolean
) => {
  if (typeof window === "undefined") return
  const url = new URL(window.location.href)
  url.searchParams.set("view", view)
  if (agentId) {
    url.searchParams.set("agent", agentId)
  } else {
    url.searchParams.delete("agent")
  }
  if (entered) {
    url.searchParams.set("entered", "1")
  } else {
    url.searchParams.delete("entered")
  }
  window.history.replaceState({}, "", url)
}

const hasEnteredSociety = () => {
  if (typeof window === "undefined") return false
  return new URLSearchParams(window.location.search).get("entered") === "1"
}

const keyForCell = (cell: Cell) => `${cell.x},${cell.y}`
const sameCell = (left: Cell, right: Cell) =>
  left.x === right.x && left.y === right.y

function getCore() {
  const core = window.TrustSubstrateSociety
  if (!core) {
    throw new Error("Society core did not load.")
  }
  return core
}

function parseIntegerInput(value: string, fallback: number) {
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : fallback
}

function patternCells(pattern: string, size: number): Cell[] | undefined {
  const center = Math.floor(size / 2)
  if (pattern === "clear") return []
  if (pattern === "custom") return undefined
  if (pattern === "genesis") {
    return [
      { x: center, y: center - 1 },
      { x: center + 1, y: center },
      { x: center - 1, y: center + 1 },
      { x: center, y: center + 1 },
      { x: center + 1, y: center + 1 },
    ]
  }
  if (pattern === "convoy") {
    return [
      { x: center, y: center },
      { x: center + 1, y: center },
      { x: center - 1, y: center },
    ]
  }
  if (pattern === "frontier") {
    return [
      { x: 1, y: center - 1 },
      { x: 2, y: center },
      { x: 0, y: center + 1 },
      { x: 1, y: center + 1 },
      { x: 2, y: center + 1 },
    ]
  }
  return undefined
}

function cellsFromSet(cells: Set<string>) {
  return Array.from(cells)
    .map((key) => {
      const [x, y] = key.split(",").map(Number)
      return { x, y }
    })
    .filter((cell) => Number.isFinite(cell.x) && Number.isFinite(cell.y))
}

function buildSimulationConfig(
  form: SimulationForm,
  customCells?: Set<string>,
  heroArchetype?: string
) {
  const gridSize = parseIntegerInput(form.gridSize, 12)
  const patternOverrides = getPatternConfigOverrides(form.pattern, gridSize)
  const nextConfig: Partial<SocietyResult["config"]> = {
    agents: parseIntegerInput(form.agents, 6),
    ticks: parseIntegerInput(form.ticks, 24),
    initialTokens: parseIntegerInput(form.initialTokens, 48),
    universalIncome: parseIntegerInput(form.universalIncome, 6),
    livingCost: parseIntegerInput(form.livingCost, 4),
    gridSize,
    receiptsPerCompressedTx: parseIntegerInput(form.receiptsPerCompressedTx, 4),
    seed: form.seed || OPTIMAL_FORM.seed,
    actionSource: {
      kind: "pi-agent",
      driver: "pi-agent-delegated-submitter",
      note: "Agents hold local keypairs and submit delegated receipts; model prompts are still explicit.",
    },
    scenario:
      form.pattern === "custom"
        ? "genesis"
        : patternOverrides.scenario || form.pattern,
    resourceCap: patternOverrides.resourceCap,
    resourceRegrowth: patternOverrides.resourceRegrowth,
    birthThreshold: patternOverrides.birthThreshold,
    aidThreshold: patternOverrides.aidThreshold,
    vision: patternOverrides.vision,
    maxAge: patternOverrides.maxAge,
    lifeDensity: patternOverrides.lifeDensity,
    seasonLength: patternOverrides.seasonLength,
    stipendSwing: patternOverrides.stipendSwing,
    regrowthSwing: patternOverrides.regrowthSwing,
    biosphereBoost: patternOverrides.biosphereBoost,
    spawnSpacing: patternOverrides.spawnSpacing,
    heroArchetype,
  }

  if (form.pattern === "custom" && customCells) {
    nextConfig.initialCells = cellsFromSet(customCells)
  } else if (patternOverrides.initialCells) {
    nextConfig.initialCells = patternOverrides.initialCells
  } else {
    const cells = patternCells(form.pattern, gridSize)
    if (cells) nextConfig.initialCells = cells
  }

  return nextConfig
}

function createEmptyTimelineFrame(gridSize: number): TimelineFrame {
  const totalCells = Math.max(gridSize * gridSize, 1)
  return {
    tick: 0,
    cells: Array.from({ length: totalCells }, () => false),
    resources: Array.from({ length: totalCells }, () => 0),
    resourceCaps: Array.from({ length: totalCells }, () => 0),
    agents: [],
    leaderboard: [],
    liveCells: 0,
    liveAgents: 0,
    totalTokens: 0,
    receipts: 0,
    compressedTxs: 0,
    resourceTotal: 0,
    commonsBalance: 0,
    births: [],
    deaths: [],
    survivors: [],
  }
}

function liveWorldStatusLabel(status?: number) {
  if (status === LIVE_WORLD_STATUS_COMPLETE) return "complete"
  if (status === LIVE_WORLD_STATUS_ACTIVE) return "active"
  return "pending"
}

function canvasCellFromPointer(
  event: React.MouseEvent<HTMLCanvasElement>,
  size: number
): Cell | undefined {
  const canvas = event.currentTarget
  const rect = canvas.getBoundingClientRect()
  const scaleX = canvas.width / rect.width
  const scaleY = canvas.height / rect.height
  const cellSize = Math.min(canvas.width / size, canvas.height / size)
  const offsetX = (canvas.width - cellSize * size) / 2
  const offsetY = (canvas.height - cellSize * size) / 2
  const x = Math.floor(
    ((event.clientX - rect.left) * scaleX - offsetX) / cellSize
  )
  const y = Math.floor(
    ((event.clientY - rect.top) * scaleY - offsetY) / cellSize
  )

  if (x < 0 || y < 0 || x >= size || y >= size) return undefined
  return { x, y }
}

function syncPageGridToBoard({
  canvas,
  cellSize,
  offsetX,
  offsetY,
}: {
  canvas: HTMLCanvasElement
  cellSize: number
  offsetX: number
  offsetY: number
}) {
  const rect = canvas.getBoundingClientRect()
  const scale = window.devicePixelRatio || 1
  const cssCellSize = Math.max(cellSize / scale, MINIMUM_GRID_PIXEL_SIZE)
  const boardOriginX = rect.left + offsetX / scale
  const boardOriginY = rect.top + offsetY / scale
  const rootStyle = document.documentElement.style

  rootStyle.setProperty("--society-page-grid-size", `${cssCellSize}px`)
  rootStyle.setProperty("--society-page-grid-x", `${boardOriginX}px`)
  rootStyle.setProperty("--society-page-grid-y", `${boardOriginY}px`)
}

function accountHref(address: string) {
  return `/api/society/account/${encodeURIComponent(address)}`
}

function transactionHref(signature: string) {
  return `/api/society/transaction/${encodeURIComponent(signature)}`
}

function solanaExplorerHref({
  kind,
  value,
  rpcUrl = SURFPOOL_RPC_URL,
}: {
  kind: "address" | "tx"
  value: string
  rpcUrl?: string
}) {
  const explorerUrl = new URL(
    `/${kind}/${encodeURIComponent(value)}`,
    SOLANA_EXPLORER_BASE_URL
  )
  explorerUrl.searchParams.set("cluster", "custom")
  explorerUrl.searchParams.set("customUrl", rpcUrl)
  return explorerUrl.toString()
}

function solanaExplorerClusterHref(rpcUrl = SURFPOOL_RPC_URL) {
  const explorerUrl = new URL("/", SOLANA_EXPLORER_BASE_URL)
  explorerUrl.searchParams.set("cluster", "custom")
  explorerUrl.searchParams.set("customUrl", rpcUrl)
  return explorerUrl.toString()
}

function solanaExplorerSetupText(rpcUrl: string) {
  return `Explorer custom cluster: save ${rpcUrl}. Transaction pages show readable memos; custom account pages show raw data.`
}

function useElementFullscreen<TElement extends HTMLElement>(
  ref: React.RefObject<TElement | null>
) {
  const [isFullscreen, setIsFullscreen] = React.useState(false)
  const [canFullscreen, setCanFullscreen] = React.useState(false)

  React.useEffect(() => {
    const updateFullscreenState = () => {
      setIsFullscreen(document.fullscreenElement === ref.current)
      setCanFullscreen(document.fullscreenEnabled)
    }

    document.addEventListener("fullscreenchange", updateFullscreenState)
    updateFullscreenState()

    return () => {
      document.removeEventListener("fullscreenchange", updateFullscreenState)
    }
  }, [ref])

  const toggleFullscreen = async () => {
    if (!ref.current || !document.fullscreenEnabled) return

    try {
      if (document.fullscreenElement === ref.current) {
        await document.exitFullscreen()
      } else {
        await ref.current.requestFullscreen()
      }
    } catch {
      setIsFullscreen(document.fullscreenElement === ref.current)
    }
  }

  return { isFullscreen, canFullscreen, toggleFullscreen }
}

function App() {
  const [form, setForm] = React.useState<SimulationForm>(OPTIMAL_FORM)
  const [customCells, setCustomCells] = React.useState<
    Set<string> | undefined
  >()
  const [selectedArchetype, setSelectedArchetype] = React.useState(
    AGENT_ARCHETYPE_CHOICES[0].id
  )
  const availableTemplates = CURATED_ONBOARDING_TEMPLATES
  const [selectedTemplateId, setSelectedTemplateId] = React.useState(
    CURATED_ONBOARDING_TEMPLATES[0].id
  )
  const [onboardingStep, setOnboardingStep] = React.useState(0)
  const [onboardingComplete, setOnboardingComplete] =
    React.useState(hasEnteredSociety())
  const [activeView, setActiveView] = React.useState<SocietyPageView>(() =>
    readExperienceView()
  )
  const [selectedAgentId, setSelectedAgentId] = React.useState<
    string | undefined
  >(() => readSelectedAgentFromLocation())
  const [activeTab, setActiveTab] = React.useState("events")
  const [currentTickOnly, setCurrentTickOnly] = React.useState(false)
  const [liveSnapshot, setLiveSnapshot] = React.useState<LiveSessionSnapshot>()
  const [liveDisplayMode, setLiveDisplayMode] = React.useState<
    "pending" | "strict"
  >("pending")
  const [isStartingLive, setIsStartingLive] = React.useState(false)
  const [isResumingLive, setIsResumingLive] = React.useState(false)
  const [isSendingLiveCommand, setIsSendingLiveCommand] = React.useState(false)
  const [liveStatus, setLiveStatus] = React.useState(
    "Idle: launch from onboarding"
  )
  const [liveColorAgentIds, setLiveColorAgentIds] = React.useState<string[]>([])
  const [liveAccounts, setLiveAccounts] =
    React.useState<LiveSessionAccountSnapshot>()
  const [publicLinks, setPublicLinks] = React.useState<PublicLinkConfig>({
    rpcUrl: SURFPOOL_RPC_URL,
    studioUrl: SURFPOOL_STUDIO_URL,
  })
  const [liveAccountsError, setLiveAccountsError] = React.useState<string>()
  const [isLoadingLiveAccounts, setIsLoadingLiveAccounts] =
    React.useState(false)
  const [hoveredAgentId, setHoveredAgentId] = React.useState<string>()
  const [boardLayout, setBoardLayout] = React.useState<{
    cellSize: number
    offsetX: number
    offsetY: number
    boardSize: number
  }>()
  const [deathBursts, setDeathBursts] = React.useState<
    Array<{ id: string; cell: Cell }>
  >([])
  const playgroundRef = React.useRef<HTMLElement | null>(null)
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null)
  const liveEventSourceRef = React.useRef<EventSource | null>(null)
  const playgroundFullscreen = useElementFullscreen(playgroundRef)

  const liveConfig = React.useMemo(
    () =>
      buildSimulationConfig(
        form,
        customCells,
        selectedArchetype
      ) as SocietyResult["config"],
    [customCells, form, selectedArchetype]
  )
  const activeConfig = liveSnapshot?.config ?? liveConfig
  const emptyFrame = React.useMemo(
    () => createEmptyTimelineFrame(activeConfig.gridSize),
    [activeConfig.gridSize]
  )
  const liveFrame = liveSnapshot
    ? liveDisplayMode === "pending" && liveSnapshot.pendingFrame
      ? liveSnapshot.pendingFrame
      : liveSnapshot.confirmedFrame
    : undefined
  const frame = liveFrame ?? emptyFrame
  const activeTemplate =
    availableTemplates.find((template) => template.id === selectedTemplateId) ??
    availableTemplates[0]

  const visibleEvents = React.useMemo(() => {
    if (liveSnapshot) {
      const currentLiveTick =
        liveDisplayMode === "pending" && liveSnapshot.pendingFrame
          ? liveSnapshot.pendingFrame.tick
          : liveSnapshot.confirmedFrame.tick
      const baseEvents = currentTickOnly
        ? liveSnapshot.confirmedEvents.filter(
            (event) => event.tick === currentLiveTick
          )
        : liveSnapshot.confirmedEvents
      const events = baseEvents.slice(-18)
      const pendingAction = liveSnapshot.pendingAction
      const shouldShowPending =
        liveDisplayMode === "pending" &&
        pendingAction &&
        (!currentTickOnly || pendingAction.tick === currentLiveTick)
      if (shouldShowPending) {
        return [
          {
            ...pendingAction,
            id: `${pendingAction.id}-pending`,
            note: `${pendingAction.note || "pending action"} (pending)`,
          },
          ...events,
        ]
          .slice(0, 18)
          .reverse()
      }
      return events.slice().reverse()
    }
    return []
  }, [currentTickOnly, liveDisplayMode, liveSnapshot])

  const liveAgentColors = React.useMemo(
    () =>
      liveSnapshot
        ? getCore().createDistinctAgentPalette({
            agentIds: liveColorAgentIds,
            configuredAgentCount: liveSnapshot.config.agents,
            seed: liveSnapshot.config.seed,
          })
        : {},
    [liveColorAgentIds, liveSnapshot]
  )
  const agentColors = liveAgentColors
  const hoveredAgent = frame.agents.find((agent) => agent.id === hoveredAgentId)
  const heroAgent =
    frame.agents.find((agent) => agent.isHero) ??
    frame.leaderboard.find((agent) => agent.isHero)
  const selectedAgent =
    frame.agents.find((agent) => agent.id === selectedAgentId) ??
    frame.leaderboard.find((agent) => agent.id === selectedAgentId) ??
    heroAgent ??
    frame.leaderboard[0]
  const inspectedAgent = hoveredAgent ?? selectedAgent
  const headerStatus = liveStatus
  const surfpoolStateLabel = liveSnapshot
    ? liveSnapshot.status === "running"
      ? "Surfpool running"
      : liveSnapshot.status === "complete"
        ? "Surfpool complete"
        : "Surfpool paused"
    : "Surfpool ready"
  const worldStateLabel = liveSnapshot ? "World live" : "World idle"
  const playgroundStatusLabel = liveSnapshot
    ? `live ${liveSnapshot.status} - ${short(liveSnapshot.sessionId, 4)}`
    : `awaiting live world - ${short(activeConfig.seed, 4)}`
  const hasLiveSession = Boolean(liveSnapshot)
  const liveSessionId = liveSnapshot?.sessionId
  const worldMetricItems: Array<[string, number | string]> = [
    ["Agents", frame.liveAgents],
    ["Identities", frame.leaderboard.length],
    ["Resources", frame.resourceTotal ?? 0],
    ["Commons", frame.commonsBalance ?? 0],
    ["Births", frame.births.length],
    ["Deaths", frame.deaths.length],
    [
      "Committed",
      liveSnapshot?.committedActions.length ??
        liveSnapshot?.confirmedReceipts.length ??
      0,
    ],
  ]
  const fixedBoardCommentary = React.useMemo(
    () => buildFixedBoardCommentary({ liveSnapshot, frame }),
    [frame, liveSnapshot]
  )
  const selectedAgentEvents = React.useMemo(() => {
    if (!selectedAgent || !liveSnapshot) return []
    const sourceEvents = [
      ...liveSnapshot.confirmedEvents,
      ...(liveDisplayMode === "pending" && liveSnapshot.pendingAction
        ? [liveSnapshot.pendingAction]
        : []),
    ]
    return sourceEvents.filter((event) => event.agentId === selectedAgent.id)
  }, [liveSnapshot, liveDisplayMode, selectedAgent])
  const selectedAgentPath = React.useMemo(
    () =>
      selectedAgent
        ? buildAgentPath(selectedAgentEvents, selectedAgent.id, selectedAgent)
        : [],
    [selectedAgent, selectedAgentEvents]
  )
  const onboardingLiveWindow = React.useMemo(
    () =>
      buildOnboardingLiveWindowModel({
        frame,
        templateName: activeTemplate?.name,
        selectedAgent,
        visibleEvents,
      }),
    [activeTemplate?.name, frame, selectedAgent, visibleEvents]
  )
  const onboardingMission = React.useMemo(
    () =>
      buildOnboardingMissionModel({
        step: onboardingStep,
        template: activeTemplate,
        selectedArchetypeId: selectedArchetype,
        selectedAgent,
        selectedAgentEvents,
        visibleEvents,
      }),
    [
      activeTemplate,
      onboardingStep,
      selectedAgent,
      selectedAgentEvents,
      selectedArchetype,
      visibleEvents,
    ]
  )

  const accountItems = React.useMemo(() => {
    if (!liveAccounts) return []
    const seen = new Set<string>()
    const items: Array<{ label: string; address: string; signature?: string }> =
      []
    const push = (label: string, address: string, signature?: string) => {
      if (!address || seen.has(address)) return
      seen.add(address)
      items.push({ label, address, signature })
    }
    push("World", liveAccounts.world.address)
    push("Identity", liveAccounts.identity.address)
    push("Task", liveAccounts.task.address)
    push("Reputation", liveAccounts.reputation.address)
    push("Checkpoint", liveAccounts.checkpoint.address)
    if (liveAccounts.checkpoint.latestCheckpoint) {
      push("Latest checkpoint", liveAccounts.checkpoint.latestCheckpoint)
    }
    push("Adjudicator config", liveAccounts.adjudicator.address)
    if (liveAccounts.adjudicator.treasuryVault) {
      push("Treasury vault", liveAccounts.adjudicator.treasuryVault)
    }
    for (const agentAccount of liveAccounts.agentAccounts) {
      if (agentAccount.authority?.address) {
        push(
          `${agentAccount.agentName} signer`,
          agentAccount.authority.address,
          agentAccount.funding?.signature
        )
      }
      push(
        `${agentAccount.agentName} identity`,
        agentAccount.identity.address,
        agentAccount.identity.signature
      )
      if (agentAccount.delegation) {
        push(
          `${agentAccount.agentName} delegation`,
          agentAccount.delegation.address,
          agentAccount.delegation.signature
        )
      }
      push(
        `${agentAccount.agentName} SOL stake`,
        agentAccount.stake.address,
        agentAccount.stake.signature
      )
    }
    return items
  }, [liveAccounts])
  const selectedAgentAccount =
    (selectedAgent &&
      liveAccounts?.agentAccounts.find(
        (account) => account.agentId === selectedAgent.id
      )) ||
    undefined
  const currentRpcUrl = liveAccounts?.rpcUrl ?? publicLinks.rpcUrl
  const currentStudioUrl = liveAccounts?.studioUrl ?? publicLinks.studioUrl
  const requestedAgentCount = parseIntegerInput(form.agents, 6)

  React.useEffect(() => {
    let cancelled = false
    fetch("/api/society/public-links")
      .then((response) => {
        if (!response.ok) throw new Error("Public links unavailable")
        return response.json() as Promise<PublicLinkConfig>
      })
      .then((links) => {
        if (!cancelled) setPublicLinks(links)
      })
      .catch(() => {
        if (!cancelled) {
          setPublicLinks({
            rpcUrl: SURFPOOL_RPC_URL,
            studioUrl: SURFPOOL_STUDIO_URL,
          })
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  const closeLiveStream = React.useCallback(() => {
    if (!liveEventSourceRef.current) return
    liveEventSourceRef.current.close()
    liveEventSourceRef.current = null
  }, [])

  const connectLiveStream = React.useCallback(
    (sessionId: string) => {
      closeLiveStream()
      const stream = new EventSource(`/api/society/live/${sessionId}/events`)
      stream.onmessage = (event) => {
        const message = JSON.parse(event.data) as LiveStreamMessage
        setLiveSnapshot(message.snapshot)
        if (message.type === "pending" && message.snapshot.pendingAction) {
          setLiveStatus(
            `Pending ${message.snapshot.pendingAction.action} by ${
              message.snapshot.pendingAction.agentName || "agent"
            }`
          )
        } else if (message.type === "confirmed") {
          setLiveStatus(
            `Confirmed ${message.snapshot.confirmedEvents.at(-1)?.action || "action"}`
          )
        } else if (message.type === "complete") {
          setLiveStatus("Live run complete")
        } else if (message.type === "error") {
          setLiveStatus(message.snapshot.lastError || "Live action failed")
        }
      }
      stream.onerror = () => {
        setLiveStatus("Live stream disconnected")
      }
      liveEventSourceRef.current = stream
    },
    [closeLiveStream]
  )

  const sendLiveCommand = React.useCallback(async (path: string) => {
    setIsSendingLiveCommand(true)
    try {
      const response = await fetch(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
      })
      const payload = (await response.json()) as
        | LiveSessionSnapshot
        | { snapshot?: LiveSessionSnapshot; error?: string }
      if (!response.ok || ("error" in payload && payload.error)) {
        throw new Error(
          ("error" in payload && payload.error) ||
            `request failed with ${response.status}`
        )
      }
      if ("snapshot" in payload && payload.snapshot) {
        setLiveSnapshot(payload.snapshot)
      } else {
        setLiveSnapshot(payload as LiveSessionSnapshot)
      }
    } finally {
      setIsSendingLiveCommand(false)
    }
  }, [])

  const startLiveSession = React.useCallback(
    async ({
      nextForm = form,
      nextCustomCells = customCells,
      nextHeroArchetype = selectedArchetype,
    }: {
      nextForm?: SimulationForm
      nextCustomCells?: Set<string>
      nextHeroArchetype?: string
    } = {}) => {
      setIsStartingLive(true)
      setLiveStatus(
        `Preparing ${parseIntegerInput(nextForm.agents, 6)} agents on Surfpool`
      )
      setLiveColorAgentIds([])
      setLiveAccounts(undefined)
      setLiveAccountsError(undefined)
      try {
        const response = await fetch("/api/society/live/start", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(
            buildSimulationConfig(nextForm, nextCustomCells, nextHeroArchetype)
          ),
        })
        const payload = (await response.json()) as
          | LiveStartResponse
          | { error?: string }
        if (!response.ok || ("error" in payload && payload.error)) {
          throw new Error(
            ("error" in payload && payload.error) ||
              `request failed with ${response.status}`
          )
        }
        if (!("snapshot" in payload) || !("sessionId" in payload)) {
          throw new Error("live start response was incomplete")
        }
        setLiveSnapshot(payload.snapshot)
        connectLiveStream(payload.sessionId)
        setLiveStatus(
          payload.snapshot.status === "running"
            ? "Live session running"
            : "Live session ready"
        )
        setHoveredAgentId(undefined)
        setActiveTab("events")
        return true
      } catch (error) {
        setLiveSnapshot(undefined)
        setLiveStatus(`Live start failed: ${(error as Error).message}`)
        return false
      } finally {
        setIsStartingLive(false)
      }
    },
    [connectLiveStream, customCells, form, selectedArchetype]
  )

  const resumeLatestLiveSession = React.useCallback(async () => {
    setIsResumingLive(true)
    setLiveStatus("Opening latest Surfpool world")
    setLiveAccounts(undefined)
    setLiveAccountsError(undefined)
    try {
      const response = await fetch("/api/society/live/latest")
      const payload = (await response.json()) as
        | LiveSessionSnapshot
        | { error?: string }
      if (!response.ok || ("error" in payload && payload.error)) {
        throw new Error(
          ("error" in payload && payload.error) ||
            `request failed with ${response.status}`
        )
      }
      const snapshot = payload as LiveSessionSnapshot
      setLiveSnapshot(snapshot)
      connectLiveStream(snapshot.sessionId)
      setLiveStatus(
        snapshot.status === "complete"
          ? "Latest world complete"
          : "Latest world open"
      )
      setHoveredAgentId(undefined)
      setActiveTab("events")
    } catch {
      setLiveSnapshot(undefined)
      setLiveStatus("No latest world found. Launch from onboarding.")
    } finally {
      setIsResumingLive(false)
    }
  }, [connectLiveStream])

  const playLiveSession = React.useCallback(async () => {
    if (!liveSnapshot) return
    setLiveStatus("Running live session")
    await sendLiveCommand(`/api/society/live/${liveSnapshot.sessionId}/play`)
  }, [liveSnapshot, sendLiveCommand])

  const pauseLiveSession = React.useCallback(async () => {
    if (!liveSnapshot) return
    setLiveStatus("Live session paused")
    await sendLiveCommand(`/api/society/live/${liveSnapshot.sessionId}/pause`)
  }, [liveSnapshot, sendLiveCommand])

  const stepLiveSession = React.useCallback(async () => {
    if (!liveSnapshot) return
    setLiveStatus("Stepping live action")
    await sendLiveCommand(`/api/society/live/${liveSnapshot.sessionId}/step`)
  }, [liveSnapshot, sendLiveCommand])

  const reconnectLiveSession = React.useCallback(() => {
    if (!liveSnapshot) return
    connectLiveStream(liveSnapshot.sessionId)
    setLiveStatus("Live stream reconnected")
  }, [connectLiveStream, liveSnapshot])

  const clearLiveSessionView = React.useCallback(
    (nextStatus: string) => {
      closeLiveStream()
      setLiveSnapshot(undefined)
      setLiveColorAgentIds([])
      setLiveAccounts(undefined)
      setLiveAccountsError(undefined)
      setHoveredAgentId(undefined)
      setActiveTab("events")
      setLiveStatus(nextStatus)
    },
    [closeLiveStream]
  )

  const applyTemplate = React.useCallback(
    (templateId: string) => {
      const nextTemplate =
        availableTemplates.find((template) => template.id === templateId) ??
        availableTemplates[0]
      if (!nextTemplate) return
      setSelectedTemplateId(nextTemplate.id)
      setForm(nextTemplate.form)
      setCustomCells(undefined)
      clearLiveSessionView("World selected. Launch from onboarding when ready.")
    },
    [availableTemplates, clearLiveSessionView]
  )

  const randomizeArchetype = React.useCallback(() => {
    const nextChoice = pickRandomAgentChoice(
      `${form.seed}-${selectedTemplateId}`
    )
    setSelectedArchetype(nextChoice.id)
    clearLiveSessionView("Agent selected. Launch from onboarding when ready.")
  }, [clearLiveSessionView, form.seed, selectedTemplateId])

  const selectAgentView = React.useCallback(
    (agentId: string, nextView: SocietyPageView = "agents") => {
      setSelectedAgentId(agentId)
      setHoveredAgentId(undefined)
      setActiveView(nextView)
      writeExperienceLocation(nextView, agentId, onboardingComplete)
    },
    [onboardingComplete]
  )

  const enterSociety = React.useCallback(() => {
    setOnboardingComplete(true)
    setOnboardingStep(MAX_ONBOARDING_STEP)
    setActiveView("world")
    if (heroAgent) {
      setSelectedAgentId(heroAgent.id)
      writeExperienceLocation("world", heroAgent.id, true)
    } else {
      writeExperienceLocation("world", selectedAgentId, true)
    }
  }, [heroAgent, selectedAgentId])

  const startOnboardingLiveWorld = React.useCallback(async () => {
    if (liveSnapshot) {
      enterSociety()
      return
    }
    const didStart = await startLiveSession()
    if (didStart) enterSociety()
  }, [enterSociety, liveSnapshot, startLiveSession])

  React.useEffect(() => {
    return () => {
      closeLiveStream()
    }
  }, [closeLiveStream])

  React.useEffect(() => {
    if (!liveSnapshot) return
    const colorTimer = window.setTimeout(() => {
      setLiveColorAgentIds((current) => {
        const next = current.slice()
        const seen = new Set(next)
        const frames = [
          liveSnapshot.confirmedFrame,
          ...(liveSnapshot.pendingFrame ? [liveSnapshot.pendingFrame] : []),
        ]
        frames.forEach((liveFrame) => {
          liveFrame.agents.forEach((agent) => {
            if (seen.has(agent.id)) return
            seen.add(agent.id)
            next.push(agent.id)
          })
        })
        return next
      })
    }, 0)
    return () => window.clearTimeout(colorTimer)
  }, [liveSnapshot])

  React.useEffect(() => {
    if (!liveSessionId) return
    let cancelled = false
    const accountsTimer = window.setTimeout(() => {
      setIsLoadingLiveAccounts(true)
      fetch(`/api/society/live/${liveSessionId}/accounts`)
        .then(async (response) => {
          const payload = (await response.json()) as
            | LiveSessionAccountSnapshot
            | { error?: string }
          if (!response.ok || ("error" in payload && payload.error)) {
            throw new Error(
              ("error" in payload && payload.error) ||
                `request failed with ${response.status}`
            )
          }
          if (cancelled) return
          setLiveAccounts(payload as LiveSessionAccountSnapshot)
          setLiveAccountsError(undefined)
        })
        .catch((error: Error) => {
          if (cancelled) return
          setLiveAccounts(undefined)
          setLiveAccountsError(error.message)
        })
        .finally(() => {
          if (!cancelled) setIsLoadingLiveAccounts(false)
        })
    }, 0)
    return () => {
      cancelled = true
      window.clearTimeout(accountsTimer)
    }
  }, [liveSessionId])

  React.useEffect(() => {
    if (selectedAgent || !heroAgent) return
    const selectionTimer = window.setTimeout(() => {
      setSelectedAgentId(heroAgent.id)
    }, 0)
    return () => window.clearTimeout(selectionTimer)
  }, [heroAgent, selectedAgent])

  React.useEffect(() => {
    writeExperienceLocation(activeView, selectedAgentId, onboardingComplete)
  }, [activeView, onboardingComplete, selectedAgentId])

  React.useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const context = canvas.getContext("2d")
    if (!context) return

    const draw = () => {
      const rect = canvas.getBoundingClientRect()
      const scale = window.devicePixelRatio || 1
      const width = Math.max(Math.floor(rect.width * scale), 1)
      const height = Math.max(Math.floor(rect.height * scale), 1)
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width
        canvas.height = height
      }

      const size = activeConfig.gridSize
      const cellSize = Math.min(width / size, height / size)
      const offsetX = (width - cellSize * size) / 2
      const offsetY = (height - cellSize * size) / 2
      const boardSize = cellSize * size
      setBoardLayout({
        cellSize: cellSize / scale,
        offsetX: offsetX / scale,
        offsetY: offsetY / scale,
        boardSize: boardSize / scale,
      })
      syncPageGridToBoard({ canvas, cellSize, offsetX, offsetY })
      const births = new Set(frame.births.map(keyForCell))
      const customFounderCells =
        !liveSnapshot && form.pattern === "custom" && customCells
          ? cellsFromSet(customCells)
          : []
      const pendingAction =
        liveDisplayMode === "pending" ? liveSnapshot?.pendingAction : undefined
      const pendingTargetKey = pendingAction && keyForCell(pendingAction.cell)
      const pendingSourceKey =
        pendingAction &&
        pendingAction.payloadExtras &&
        typeof pendingAction.payloadExtras.movedFrom === "object" &&
        pendingAction.payloadExtras.movedFrom &&
        "x" in pendingAction.payloadExtras.movedFrom &&
        "y" in pendingAction.payloadExtras.movedFrom
          ? keyForCell(pendingAction.payloadExtras.movedFrom as Cell)
          : undefined
      const selectedBoardAgent = selectedAgentId
        ? frame.agents.find((agent) => agent.id === selectedAgentId)
        : undefined
      const hoveredBoardAgent = hoveredAgentId
        ? frame.agents.find((agent) => agent.id === hoveredAgentId)
        : undefined

      context.clearRect(0, 0, width, height)
      if (BOARD_FIELD_FILL !== "rgba(0,0,0,0)") {
        context.fillStyle = BOARD_FIELD_FILL
        context.fillRect(offsetX, offsetY, boardSize, boardSize)
      }

      const drawCellRect = (
        cell: Cell,
        fillStyle: string,
        shouldOutline = false
      ) => {
        const x = offsetX + cell.x * cellSize
        const y = offsetY + cell.y * cellSize
        const sizePx = Math.max(cellSize - 1, 1)
        context.fillStyle = fillStyle
        context.fillRect(x, y, sizePx, sizePx)
        if (shouldOutline) {
          context.lineWidth = Math.max(scale * BOARD_MARK_LINE_WIDTH, 1)
          context.strokeStyle = BOARD_FIELD_BORDER
          context.strokeRect(
            x + context.lineWidth / 2,
            y + context.lineWidth / 2,
            Math.max(sizePx - context.lineWidth, 0),
            Math.max(sizePx - context.lineWidth, 0)
          )
        }
      }

      const drawDeathCell = (cell: Cell, shouldOutline = false) => {
        const x = offsetX + cell.x * cellSize
        const y = offsetY + cell.y * cellSize
        const sizePx = Math.max(cellSize - 1, 1)
        const stripeSpacing = Math.max(scale * BOARD_STRIPE_SPACING, 1)
        const stripeWidth = Math.max(scale * BOARD_STRIPE_WIDTH, 1)

        context.fillStyle = DEATH_AGENT_FILL
        context.fillRect(x, y, sizePx, sizePx)
        context.save()
        context.beginPath()
        context.rect(x, y, sizePx, sizePx)
        context.clip()
        context.strokeStyle = DEATH_MARK_STRIPE
        context.lineWidth = stripeWidth
        for (
          let stripeOffset = -sizePx;
          stripeOffset <= sizePx * BOARD_MARK_LINE_WIDTH;
          stripeOffset += stripeSpacing
        ) {
          context.beginPath()
          context.moveTo(x + stripeOffset, y + sizePx)
          context.lineTo(x + stripeOffset + sizePx, y)
          context.stroke()
        }
        context.restore()

        context.lineWidth = Math.max(scale * BOARD_MARK_LINE_WIDTH, 1)
        context.strokeStyle = shouldOutline
          ? BOARD_FIELD_BORDER
          : DEATH_MARK_BORDER
        context.strokeRect(
          x + context.lineWidth / 2,
          y + context.lineWidth / 2,
          Math.max(sizePx - context.lineWidth, 0),
          Math.max(sizePx - context.lineWidth, 0)
        )
      }

      const drawAgentSelectionRing = (
        cell: Cell,
        strokeStyle: string,
        shouldGlow: boolean
      ) => {
        const x = offsetX + cell.x * cellSize
        const y = offsetY + cell.y * cellSize
        const sizePx = Math.max(cellSize - 1, 1)
        const lineWidth = Math.max(scale * BOARD_SELECTION_LINE_WIDTH, 1)
        context.save()
        context.lineWidth = lineWidth
        context.strokeStyle = strokeStyle
        if (shouldGlow) {
          context.shadowColor = BOARD_SELECTION_GLOW
          context.shadowBlur = Math.max(
            scale * BOARD_SELECTION_GLOW_BLUR,
            BOARD_SELECTION_GLOW_BLUR
          )
        }
        context.strokeRect(
          x + lineWidth / 2,
          y + lineWidth / 2,
          Math.max(sizePx - lineWidth, 0),
          Math.max(sizePx - lineWidth, 0)
        )
        context.restore()
      }

      for (const founder of customFounderCells) {
        drawCellRect(founder, NEWBORN_AGENT_FILL)
      }

      for (const agent of frame.agents) {
        const agentKey = keyForCell(agent)
        const fillStyle =
          agentColors[agent.id] ||
          (births.has(agentKey) ? NEWBORN_AGENT_FILL : LIVE_AGENT_FILL)
        drawCellRect(agent, fillStyle, pendingTargetKey === agentKey)
      }

      for (const cell of frame.deaths) {
        drawDeathCell(cell, pendingTargetKey === keyForCell(cell))
      }

      if (selectedBoardAgent) {
        drawAgentSelectionRing(
          selectedBoardAgent,
          BOARD_SELECTED_CELL_BORDER,
          true
        )
      }
      if (hoveredBoardAgent && hoveredBoardAgent.id !== selectedBoardAgent?.id) {
        drawAgentSelectionRing(hoveredBoardAgent, BOARD_HOVER_CELL_BORDER, false)
      }

      if (pendingSourceKey && pendingSourceKey !== pendingTargetKey) {
        const [x, y] = pendingSourceKey.split(",").map(Number)
        context.lineWidth = Math.max(scale * BOARD_MARK_LINE_WIDTH, 1)
        context.strokeStyle = BOARD_PREVIOUS_CELL_BORDER
        context.setLineDash([
          Math.max(scale * BOARD_DASH_LENGTH, 1),
          Math.max(scale * BOARD_DASH_LENGTH, 1),
        ])
        context.strokeRect(
          offsetX + x * cellSize + context.lineWidth / 2,
          offsetY + y * cellSize + context.lineWidth / 2,
          Math.max(cellSize - 1 - context.lineWidth, 0),
          Math.max(cellSize - 1 - context.lineWidth, 0)
        )
        context.setLineDash([])
      }

      const boardBorderWidth = Math.max(scale, 1)
      context.lineWidth = boardBorderWidth
      context.strokeStyle = BOARD_FIELD_BORDER
      context.strokeRect(
        offsetX + boardBorderWidth / 2,
        offsetY + boardBorderWidth / 2,
        Math.max(boardSize - boardBorderWidth, 0),
        Math.max(boardSize - boardBorderWidth, 0)
      )
    }

    draw()
    window.addEventListener("resize", draw)
    window.addEventListener("scroll", draw, { passive: true })
    document.addEventListener("fullscreenchange", draw)
    return () => {
      window.removeEventListener("resize", draw)
      window.removeEventListener("scroll", draw)
      document.removeEventListener("fullscreenchange", draw)
    }
  }, [
    activeConfig.gridSize,
    agentColors,
    customCells,
    frame,
    form.pattern,
    liveDisplayMode,
    liveSnapshot,
    playgroundFullscreen.isFullscreen,
    selectedAgentId,
    hoveredAgentId,
  ])

  React.useEffect(() => {
    if (frame.deaths.length === 0) return
    const nextBursts = frame.deaths.map((cell, index) => ({
      id: `death-${frame.tick}-${index}-${keyForCell(cell)}`,
      cell,
    }))
    const addTimer = window.setTimeout(() => {
      setDeathBursts((current) => {
        const known = new Set(current.map((burst) => burst.id))
        return [
          ...current,
          ...nextBursts.filter((burst) => !known.has(burst.id)),
        ]
      })
    }, 0)
    const removeTimer = window.setTimeout(() => {
      setDeathBursts((current) =>
        current.filter(
          (burst) => !nextBursts.some((candidate) => candidate.id === burst.id)
        )
      )
    }, DEATH_MARK_DURATION_MS)
    return () => {
      window.clearTimeout(addTimer)
      window.clearTimeout(removeTimer)
    }
  }, [frame.deaths, frame.tick])

  const updateSimulationForm = (
    nextForm: SimulationForm,
    nextCustomCells = customCells
  ) => {
    setForm(nextForm)
    setCustomCells(nextCustomCells)
    setHoveredAgentId(undefined)
    clearLiveSessionView(
      "Configuration changed. Launch from onboarding when ready."
    )
  }

  const toggleCell = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const size = activeConfig.gridSize
    const cell = canvasCellFromPointer(event, size)
    if (!cell) return
    const agent =
      cell && frame.agents.find((candidate) => sameCell(candidate, cell))

    if (agent) {
      selectAgentView(agent.id, "world")
      return
    }

    if (liveSnapshot) return

    const nextCustomCells = customCells
      ? new Set(customCells)
      : new Set<string>()
    const key = keyForCell(cell)
    if (nextCustomCells.has(key)) {
      nextCustomCells.delete(key)
    } else {
      nextCustomCells.add(key)
    }

    const nextForm = { ...form, pattern: "custom" }
    updateSimulationForm(nextForm, nextCustomCells)
  }

  const inspectAgentAtPointer = (
    event: React.MouseEvent<HTMLCanvasElement>
  ) => {
    const cell = canvasCellFromPointer(event, activeConfig.gridSize)
    const agent =
      cell && frame.agents.find((candidate) => sameCell(candidate, cell))
    setHoveredAgentId(agent ? agent.id : undefined)
  }

  const handleBoardKeyDown = (
    event: React.KeyboardEvent<HTMLCanvasElement>
  ) => {
    if (!selectedAgent) return
    if (event.key !== "Enter" && event.key !== " ") return
    event.preventDefault()
    selectAgentView(selectedAgent.id, "agents")
  }

  return (
    <main className="min-h-svh bg-transparent text-foreground">
      <div className="mx-auto grid max-w-7xl gap-3 p-3 md:p-4">
        <header className="grid gap-3 border-b border-border/80 pb-3 md:flex md:flex-wrap md:items-center md:justify-between">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">Trust Substrate</p>
            <h1 className="text-base font-normal tracking-tight">
              Agent Society
            </h1>
          </div>
          <div className="grid w-full gap-2 md:w-auto">
            <div className="flex flex-wrap items-center gap-2 md:justify-end">
              <Badge variant={liveSnapshot ? "secondary" : "outline"}>
                {surfpoolStateLabel}
              </Badge>
              <Badge variant="outline">{worldStateLabel}</Badge>
              <Badge variant="outline">tick {frame.tick}</Badge>
              <Badge variant="outline" className="max-w-full truncate">
                {headerStatus}
              </Badge>
            </div>
            {onboardingComplete && (
              <div className="flex flex-wrap items-center gap-2 md:justify-end">
                <Button
                  variant={activeView === "world" ? "secondary" : "outline"}
                  className="min-w-28"
                  onClick={() => setActiveView("world")}
                >
                  World
                </Button>
                <Button
                  variant={activeView === "agents" ? "secondary" : "outline"}
                  className="min-w-28"
                  onClick={() => setActiveView("agents")}
                >
                  Agents
                </Button>
              </div>
            )}
          </div>
        </header>

        {activeView === "world" ? (
          <section className="grid min-w-0 gap-3 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] xl:grid-cols-[minmax(280px,320px)_minmax(420px,1fr)_minmax(280px,320px)]">
            <Card className={cn(SECTION_CARD_CLASS, "min-w-0")}>
              <CardHeader className={SECTION_HEADER_CLASS}>
                <CardTitle>World Story</CardTitle>
                <CardAction>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="secondary">{form.pattern}</Badge>
                    <Badge variant="outline">Surfpool-backed</Badge>
                  </div>
                </CardAction>
              </CardHeader>
              <CardContent className="grid gap-3 p-2.5">
                <div className="grid gap-2 text-xs text-muted-foreground">
                  <AgentFocusPanel
                    agent={selectedAgent}
                    account={selectedAgentAccount}
                    rpcUrl={currentRpcUrl}
                    liveAccountsError={liveAccountsError}
                    isLoadingLiveAccounts={isLoadingLiveAccounts}
                    onOpenAgents={() =>
                      selectedAgent &&
                      selectAgentView(selectedAgent.id, "agents")
                    }
                  />
                  <div className={PANEL_SURFACE_CLASS}>
                    <p className="text-[11px] tracking-[0.18em] text-muted-foreground uppercase">
                      Guided world
                    </p>
                    <p className="mt-2 text-xs text-foreground">
                      {activeTemplate?.cue ||
                        "Pick a world in onboarding, then launch the Surfpool session from that flow."}
                    </p>
                    <div className="mt-3 grid gap-1 text-xs text-muted-foreground">
                      <p>Template: {activeTemplate?.name || "Custom world"}</p>
                      <p>Agents: {format(requestedAgentCount)}</p>
                      <p>Follow: {selectedArchetype}</p>
                      <p>
                        Record: signed actions, transcript roots, lineage, and trust stay linked.
                      </p>
                    </div>
                  </div>
                </div>

                {onboardingComplete && (
                  <div className="grid gap-3 rounded-lg border border-border/80 bg-background/45 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="grid gap-1">
                        <p className="text-sm text-foreground">
                          World status
                        </p>
                        <p className="font-mono text-xs text-muted-foreground">
                          {liveStatus}
                        </p>
                        <p className="text-xs leading-5 text-muted-foreground">
                          The board reads the signed Surfpool world state.
                        </p>
                      </div>
                      <Badge variant={hasLiveSession ? "secondary" : "outline"}>
                        {hasLiveSession ? "live" : "idle"}
                      </Badge>
                    </div>
                    <div className="grid gap-2">
                      <LivePreparationPanel
                        requestedAgentCount={requestedAgentCount}
                        liveAccounts={liveAccounts}
                        isStartingLive={isStartingLive}
                        isResumingLive={isResumingLive}
                        isLoadingLiveAccounts={isLoadingLiveAccounts}
                        liveAccountsError={liveAccountsError}
                        hasLiveSession={hasLiveSession}
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <Button
                          variant={
                            liveDisplayMode === "pending"
                              ? "secondary"
                              : "outline"
                          }
                          onClick={() => setLiveDisplayMode("pending")}
                        >
                          Pending
                        </Button>
                        <Button
                          variant={
                            liveDisplayMode === "strict"
                              ? "secondary"
                              : "outline"
                          }
                          onClick={() => setLiveDisplayMode("strict")}
                        >
                          Strict
                        </Button>
                      </div>
                      <Button
                        variant="outline"
                        size="lg"
                        onClick={reconnectLiveSession}
                        disabled={!liveSnapshot}
                      >
                        Reconnect stream
                      </Button>
                      {!hasLiveSession && (
                        <Button
                          variant="outline"
                          size="lg"
                          onClick={() => void resumeLatestLiveSession()}
                          disabled={isStartingLive || isResumingLive}
                        >
                          {isResumingLive ? "Opening latest" : "Resume last"}
                        </Button>
                      )}
                      <Button variant="outline" size="lg" asChild>
                        <a
                          href={`${currentStudioUrl.replace(/\/$/, "")}/accounts`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Open Studio
                        </a>
                      </Button>
                      <Button variant="outline" size="lg" asChild>
                        <a
                          href={solanaExplorerClusterHref(currentRpcUrl)}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Solana Explorer
                        </a>
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <section
              ref={playgroundRef}
              className={cn(
                PLAYGROUND_STACK_CLASS,
                playgroundFullscreen.isFullscreen && PLAYGROUND_FULLSCREEN_CLASS
              )}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-xs text-muted-foreground">World</p>
                  <h2 className="text-sm font-normal">Agent grid</h2>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{playgroundStatusLabel}</Badge>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className={PLAYGROUND_FULLSCREEN_BUTTON_CLASS}
                    onClick={playgroundFullscreen.toggleFullscreen}
                    disabled={!playgroundFullscreen.canFullscreen}
                    aria-label={
                      playgroundFullscreen.isFullscreen
                        ? "Exit playground fullscreen"
                        : "Open playground fullscreen"
                    }
                    title={
                      playgroundFullscreen.isFullscreen
                        ? "Exit fullscreen"
                        : "Fullscreen"
                    }
                  >
                    {playgroundFullscreen.isFullscreen ? (
                      <Minimize2 data-icon="inline-start" aria-hidden="true" />
                    ) : (
                      <Maximize2 data-icon="inline-start" aria-hidden="true" />
                    )}
                  </Button>
                </div>
              </div>
              <div
                className={cn(
                  PLAYGROUND_BOARD_SURFACE_CLASS,
                  playgroundFullscreen.isFullscreen &&
                    PLAYGROUND_FULLSCREEN_BOARD_CLASS
                )}
              >
                <canvas
                  ref={canvasRef}
                  className={cn(
                    PLAYGROUND_CANVAS_CLASS,
                    hoveredAgent
                      ? "cursor-pointer"
                      : liveSnapshot
                        ? "cursor-default"
                        : "cursor-crosshair",
                    playgroundFullscreen.isFullscreen &&
                      PLAYGROUND_FULLSCREEN_CANVAS_CLASS
                  )}
                  tabIndex={0}
                  role="button"
                  onClick={toggleCell}
                  onKeyDown={handleBoardKeyDown}
                  onMouseMove={inspectAgentAtPointer}
                  onMouseLeave={() => setHoveredAgentId(undefined)}
                  title={
                    hoveredAgent
                      ? `${hoveredAgent.name} - id ${hoveredAgent.identityId} - board ${hoveredAgent.x},${hoveredAgent.y}`
                      : selectedAgent
                        ? `Selected ${selectedAgent.name}. Press Enter or Space to open its agent card.`
                        : "Hover an agent after launch to see details"
                  }
                  aria-label={
                    selectedAgent
                      ? `Agent society board. Selected ${selectedAgent.name}. Press Enter or Space to open its agent card.`
                      : "Agent society board"
                  }
                />
                {boardLayout && deathBursts.length > 0 && (
                  <div
                    className="pointer-events-none absolute inset-0"
                    aria-hidden="true"
                  >
                    {deathBursts.map((burst) => (
                      <div
                        key={burst.id}
                        className="absolute border-2 border-white/80 bg-[repeating-linear-gradient(135deg,rgba(255,255,255,0.48)_0,rgba(255,255,255,0.48)_1px,rgba(255,255,255,0.08)_1px,rgba(255,255,255,0.08)_4px)]"
                        style={{
                          left:
                            boardLayout.offsetX +
                            burst.cell.x * boardLayout.cellSize,
                          top:
                            boardLayout.offsetY +
                            burst.cell.y * boardLayout.cellSize,
                          width: Math.max(boardLayout.cellSize - 1, 4),
                          height: Math.max(boardLayout.cellSize - 1, 4),
                          animation: `society-death-mark ${DEATH_MARK_DURATION_MS}ms linear forwards`,
                        }}
                      />
                    ))}
                  </div>
                )}
              </div>
              <IdentityInspector
                agent={inspectedAgent}
                isHovering={Boolean(hoveredAgent)}
                isSelected={Boolean(
                  selectedAgent && inspectedAgent?.id === selectedAgent.id
                )}
              />
              {liveSnapshot ? (
                <div className="grid gap-2">
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Button
                      variant="secondary"
                      size="lg"
                      onClick={
                        liveSnapshot?.status === "running"
                          ? () => void pauseLiveSession()
                          : () => void playLiveSession()
                      }
                      disabled={
                        !liveSnapshot ||
                        liveSnapshot.status === "complete" ||
                        isSendingLiveCommand
                      }
                    >
                      {liveSnapshot?.status === "running" ? "Pause" : "Play"}
                    </Button>
                    <Button
                      variant="secondary"
                      size="lg"
                      onClick={() => void stepLiveSession()}
                      disabled={
                        !liveSnapshot ||
                        liveSnapshot.status === "complete" ||
                        isSendingLiveCommand
                      }
                    >
                      Step
                    </Button>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{liveDisplayMode}</Badge>
                    <Badge variant="outline">
                      {liveSnapshot?.committedActions.length ?? 0} actions
                    </Badge>
                    {liveSnapshot?.pendingAction &&
                      liveDisplayMode === "pending" && (
                        <Badge variant="outline">
                          pending {liveSnapshot.pendingAction.action}
                        </Badge>
                      )}
                    {liveSnapshot?.proof && (
                      <Badge variant="outline">
                        file {short(liveSnapshot.proof.hash, 4)}
                      </Badge>
                    )}
                  </div>
                  <FixedCommentaryLine commentary={fixedBoardCommentary} />
                </div>
              ) : (
                <Alert className="border-border/70 bg-background/35">
                  <AlertTitle>
                    {isStartingLive
                      ? "Creating live world"
                      : "No world open in this browser"}
                  </AlertTitle>
                  <AlertDescription>
                    <span>
                      {isStartingLive
                        ? "Preparing Surfpool records, agent identities, delegation, and SOL stake. Public tunnel starts can take about 30 seconds."
                        : "Nothing is being written from this browser. Launch from onboarding or resume the last Surfpool session."}
                    </span>
                  </AlertDescription>
                  <FixedCommentaryLine commentary={fixedBoardCommentary} />
                </Alert>
              )}
              <MetricGrid items={worldMetricItems} />
            </section>

            <Card
              className={cn(
                SECTION_CARD_CLASS,
                "min-w-0 lg:col-span-2 xl:col-span-1"
              )}
            >
              <CardHeader className={SECTION_HEADER_CLASS}>
                <CardTitle>Agents</CardTitle>
                <CardAction>
                  <Badge variant="outline">{frame.agents.length} live</Badge>
                </CardAction>
              </CardHeader>
              <CardContent className="grid gap-3 p-2.5">
                <RuleList />
                <Separator />
                <ScrollArea className="h-[390px] pr-2">
                  <div className="grid gap-2">
                    {frame.leaderboard.slice(0, 12).map((agent) => (
                      <AgentRow key={agent.id} agent={agent} />
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </section>
        ) : (
          <AgentsPage
            agents={frame.leaderboard}
            selectedAgent={selectedAgent}
            selectedAgentPath={selectedAgentPath}
            selectedAgentEvents={selectedAgentEvents}
            selectedAgentAccount={selectedAgentAccount}
            rpcUrl={currentRpcUrl}
            liveAccountsError={liveAccountsError}
            isLoadingLiveAccounts={isLoadingLiveAccounts}
            onSelectAgent={(agentId) => selectAgentView(agentId, "agents")}
          />
        )}

        {activeView === "world" && (
          <Card className={SECTION_CARD_CLASS}>
            <CardHeader className={SECTION_HEADER_CLASS}>
              <CardTitle>Receipts</CardTitle>
              <CardAction>
                <Tabs value={activeTab} onValueChange={setActiveTab}>
                  <TabsList>
                    <TabsTrigger value="events">Events</TabsTrigger>
                    <TabsTrigger value="graph">Graph</TabsTrigger>
                    <TabsTrigger value="surfpool">Surfpool</TabsTrigger>
                  </TabsList>
                </Tabs>
              </CardAction>
            </CardHeader>
            <CardContent className="grid gap-2.5 p-2.5">
              <div className="flex flex-wrap items-end gap-2">
                <Field
                  orientation="horizontal"
                  className="min-h-8 w-fit items-center"
                >
                  <Checkbox
                    id="currentTick"
                    checked={currentTickOnly}
                    onCheckedChange={(value) =>
                      setCurrentTickOnly(value === true)
                    }
                  />
                  <FieldLabel htmlFor="currentTick">
                    Current tick only
                  </FieldLabel>
                </Field>
              </div>

              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsContent value="events">
                  <EventList
                    events={visibleEvents}
                    onSelectAgent={(agentId) =>
                      selectAgentView(
                        agentId,
                        onboardingComplete ? "agents" : "world"
                      )
                    }
                  />
                </TabsContent>
                <TabsContent value="graph">
                  <GraphList
                    agents={frame.leaderboard}
                    programs={LIVE_PROGRAMS}
                    receipts={[]}
                    batchNodes={new Map()}
                    liveSnapshot={liveSnapshot}
                  />
                </TabsContent>
                <TabsContent value="surfpool">
                  <SurfpoolPanel
                    proof={liveSnapshot?.proof}
                    liveAccounts={liveAccounts}
                    accountItems={accountItems}
                    liveSnapshot={liveSnapshot}
                    fallbackRpcUrl={currentRpcUrl}
                    fallbackStudioUrl={currentStudioUrl}
                  />
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        )}
      </div>
      {!onboardingComplete && (
        <OnboardingOverlay
          step={onboardingStep}
          missionModel={onboardingMission}
          template={activeTemplate}
          templates={availableTemplates}
          liveWindow={onboardingLiveWindow}
          liveStatus={liveStatus}
          fixedBoardCommentary={fixedBoardCommentary}
          requestedAgentCount={requestedAgentCount}
          isStartingLive={isStartingLive}
          hasLiveSession={hasLiveSession}
          selectedArchetype={selectedArchetype}
          selectedAgent={selectedAgent}
          selectedAgentEvents={selectedAgentEvents}
          onChooseTemplate={(templateId) => applyTemplate(templateId)}
          onChooseArchetype={(archetypeId) => {
            setSelectedArchetype(archetypeId)
            clearLiveSessionView(
              "Agent selected. Launch from onboarding when ready."
            )
          }}
          onRandomizeArchetype={randomizeArchetype}
          onNextStep={() =>
            setOnboardingStep((current) =>
              Math.min(current + 1, MAX_ONBOARDING_STEP)
            )
          }
          onPreviousStep={() =>
            setOnboardingStep((current) => Math.max(current - 1, 0))
          }
          onStartLiveWorld={() => void startOnboardingLiveWorld()}
        />
      )}
      <style>{`
        @keyframes society-death-mark {
          0% { opacity: 0; }
          12% { opacity: 0.96; }
          78% { opacity: 0.96; }
          100% { opacity: 0; }
        }
      `}</style>
    </main>
  )
}

function AgentFocusPanel({
  agent,
  account,
  rpcUrl,
  liveAccountsError,
  isLoadingLiveAccounts,
  onOpenAgents,
}: {
  agent?: CellAgent
  account?: AgentAccountLike
  rpcUrl: string
  liveAccountsError?: string
  isLoadingLiveAccounts: boolean
  onOpenAgents: () => void
}) {
  if (!agent) {
    return (
      <EmptyState>
        Start a world, then select an agent to see its path, accounts, and
        lineage.
      </EmptyState>
    )
  }

  return (
    <div className={PLAYGROUND_DETAIL_PANEL_CLASS}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 gap-2">
          <AgentImage agent={agent} />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="truncate text-xs font-normal">{agent.name}</p>
              {agent.isHero && <Badge variant="secondary">selected agent</Badge>}
            </div>
            <p className="font-mono text-xs text-muted-foreground">
              id {agent.identityId}
            </p>
          </div>
        </div>
        <Badge variant={agent.alive ? "outline" : "destructive"}>
          {agent.alive ? "live" : "ended"}
        </Badge>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        {agentRole(agent)}
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2 font-mono text-xs tabular-nums">
        <p>score {format(agent.score)}</p>
        <p>{formatSocietyTokenAmount(agent.tokens)}</p>
        <p>trust {format(agent.reputation ?? 0)}</p>
        <p>inherited {format(agent.inheritedReputation ?? 0)}</p>
        <p>heartbeats {format(agent.livenessProofs ?? 0)}</p>
        <p>children {format(agent.descendants)}</p>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button variant="secondary" onClick={onOpenAgents}>
          Open agent card
        </Button>
        {account?.identity?.address && (
          <Button variant="outline" asChild>
            <a
              href={solanaExplorerHref({
                kind: "address",
                value: account.identity.address,
                rpcUrl,
              })}
              target="_blank"
              rel="noreferrer"
            >
              Explorer
            </a>
          </Button>
        )}
        {isLoadingLiveAccounts && (
          <Badge variant="outline">loading accounts</Badge>
        )}
        {!isLoadingLiveAccounts && liveAccountsError && (
          <Badge variant="destructive">{liveAccountsError}</Badge>
        )}
      </div>
    </div>
  )
}

type PreparationStepStatus = "waiting" | "active" | "done" | "error"

function LivePreparationPanel({
  requestedAgentCount,
  liveAccounts,
  isStartingLive,
  isResumingLive,
  isLoadingLiveAccounts,
  liveAccountsError,
  hasLiveSession,
}: {
  requestedAgentCount: number
  liveAccounts?: LiveSessionAccountSnapshot
  isStartingLive: boolean
  isResumingLive: boolean
  isLoadingLiveAccounts: boolean
  liveAccountsError?: string
  hasLiveSession: boolean
}) {
  const setup = liveAccounts?.setup
  const agentTarget = setup?.requestedAgentCount ?? requestedAgentCount
  const isWorking = isStartingLive || isResumingLive || isLoadingLiveAccounts
  const countStatus = (readyCount: number | undefined): PreparationStepStatus => {
    if (liveAccountsError && !liveAccounts) return "error"
    if (!setup) return isWorking ? "active" : "waiting"
    if (agentTarget === 0) return "done"
    return (readyCount ?? 0) >= agentTarget ? "done" : "active"
  }
  const surfpoolStatus: PreparationStepStatus = liveAccountsError
    ? "error"
    : liveAccounts || hasLiveSession
      ? "done"
      : isWorking
        ? "active"
        : "waiting"
  const protocolStatus: PreparationStepStatus = liveAccountsError
    ? "error"
    : setup
      ? "done"
      : isWorking || hasLiveSession
        ? "active"
        : "waiting"
  const worldStatus: PreparationStepStatus = liveAccountsError
    ? "error"
    : setup?.worldReady
      ? "done"
      : isWorking || hasLiveSession
        ? "active"
        : "waiting"
  const steps: Array<{
    label: string
    detail: string
    status: PreparationStepStatus
  }> = [
    {
      label: "Surfpool RPC",
      detail: liveAccounts?.rpcUrl ?? "waiting for local RPC confirmation",
      status: surfpoolStatus,
    },
    {
      label: "Protocol accounts",
      detail: setup
        ? `${format(setup.protocolOperationCount)} setup transactions observed`
        : "identity, task, checkpoint, adjudicator, and world setup",
      status: protocolStatus,
    },
    {
      label: "Agent identities",
      detail: setup
        ? `${format(setup.identityAccountCount)}/${format(agentTarget)} identities`
        : `${format(agentTarget)} identities will be created before play`,
      status: countStatus(setup?.identityAccountCount),
    },
    {
      label: "Delegations",
      detail: setup
        ? `${format(setup.delegationAccountCount)}/${format(agentTarget)} delegated submitters`
        : "each agent gets a scoped delegated submitter",
      status: countStatus(setup?.delegationAccountCount),
    },
    {
      label: "SOL stake",
      detail: setup
        ? `${format(setup.solStakeAccountCount)}/${format(agentTarget)} stake accounts funded`
        : "birth grants are deposited as SOL lamports for this demo",
      status: countStatus(setup?.solStakeAccountCount),
    },
    {
      label: "World account",
      detail: setup?.worldReady
        ? short(liveAccounts?.world.address, 5)
        : "board will read this account after setup",
      status: worldStatus,
    },
  ]

  return (
    <div className={PLAYGROUND_DETAIL_PANEL_CLASS}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-normal">Agent readiness</p>
          <p className="mt-1 whitespace-normal break-words text-xs leading-5 text-muted-foreground">
            Surfpool setup waits for agent keys, identities, delegation, and SOL
            stake before Play or Step.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary">
            {setup
              ? `${format(setup.readyAgentCount)}/${format(agentTarget)} ready`
              : `${format(agentTarget)} planned`}
          </Badge>
          <Badge variant="outline">{setup?.stakeAsset ?? "SOL"} stake</Badge>
        </div>
      </div>
      <div className="mt-3 grid gap-2">
        {steps.map((step) => (
          <div
            key={step.label}
            className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 rounded-md border border-border/70 bg-background/35 p-2"
          >
            <div className="min-w-0">
              <p className="text-xs text-foreground">{step.label}</p>
            </div>
            <Badge
              variant={
                step.status === "error"
                  ? "destructive"
                  : step.status === "done"
                    ? "secondary"
                    : "outline"
              }
            >
              {step.status}
            </Badge>
            <p className={cn(PREPARATION_STEP_DETAIL_CLASS, "col-span-2")}>
              {step.detail}
            </p>
          </div>
        ))}
      </div>
      {liveAccountsError && (
        <p className="mt-2 text-xs text-destructive">{liveAccountsError}</p>
      )}
    </div>
  )
}

function AgentsPage({
  agents,
  selectedAgent,
  selectedAgentPath,
  selectedAgentEvents,
  selectedAgentAccount,
  rpcUrl,
  liveAccountsError,
  isLoadingLiveAccounts,
  onSelectAgent,
}: {
  agents: CellAgent[]
  selectedAgent?: CellAgent
  selectedAgentPath: Cell[]
  selectedAgentEvents: SocietyEvent[]
  selectedAgentAccount?: AgentAccountLike
  rpcUrl: string
  liveAccountsError?: string
  isLoadingLiveAccounts: boolean
  onSelectAgent: (agentId: string) => void
}) {
  return (
    <section className="grid gap-3">
      <Card className={SECTION_CARD_CLASS}>
        <CardHeader className={SECTION_HEADER_CLASS}>
          <CardTitle>Agents</CardTitle>
          <CardAction>
            <Badge variant="outline">{agents.length} visible agents</Badge>
          </CardAction>
        </CardHeader>
        <CardContent className="grid gap-3 p-2.5">
          {selectedAgent ? (
            <AgentDetailTabs
              agent={selectedAgent}
              events={selectedAgentEvents}
              path={selectedAgentPath}
              account={selectedAgentAccount}
              rpcUrl={rpcUrl}
              liveAccountsError={liveAccountsError}
              isLoadingLiveAccounts={isLoadingLiveAccounts}
            />
          ) : (
            <EmptyState>
              Choose an agent card to see its path, lineage, and accounts.
            </EmptyState>
          )}
          <FamilyGraph agents={agents} selectedAgentId={selectedAgent?.id} />
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {agents.map((agent) => (
              <button
                key={agent.id}
                type="button"
                className={cn(
                  INTERACTIVE_PANEL_CLASS,
                  selectedAgent?.id === agent.id && SELECTED_PANEL_CLASS
                )}
                onClick={() => onSelectAgent(agent.id)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 gap-2">
                    <AgentImage agent={agent} />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-xs font-normal">
                          {agent.name}
                        </p>
                        {agent.isHero && (
                          <Badge variant="secondary">selected</Badge>
                        )}
                      </div>
                      <p className="font-mono text-xs text-muted-foreground">
                        {short(agent.identityId, 5)}
                      </p>
                    </div>
                  </div>
                  <Badge variant={agent.alive ? "outline" : "destructive"}>
                    {agent.alive ? "live" : "ended"}
                  </Badge>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {agentRole(agent)}
                </p>
                <div className="mt-3 grid grid-cols-2 gap-2 font-mono text-xs tabular-nums">
                  <p>score {format(agent.score)}</p>
                  <p>trust {format(agent.reputation ?? 0)}</p>
                  <p>{formatSocietyTokenAmount(agent.tokens)}</p>
                  <p>children {format(agent.descendants)}</p>
                </div>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>
    </section>
  )
}

function FamilyGraph({
  agents,
  selectedAgentId,
}: {
  agents: CellAgent[]
  selectedAgentId?: string
}) {
  const visibleAgents = [...agents]
    .sort(
      (left, right) =>
        left.generation - right.generation || left.bornTick - right.bornTick
    )
    .slice(0, FAMILY_GRAPH_AGENT_LIMIT)
  const visibleAgentIds = new Set(visibleAgents.map((agent) => agent.id))
  const childCountByAgentId = new Map<string, number>()

  for (const agent of agents) {
    for (const parentId of agent.parentIds) {
      childCountByAgentId.set(
        parentId,
        (childCountByAgentId.get(parentId) ?? 0) + 1
      )
    }
  }

  const generationRows = new Map<number, number>()
  const nodeByAgentId = new Map<
    string,
    CellAgent & { graphX: number; graphY: number }
  >()

  for (const agent of visibleAgents) {
    const generation = Math.max(agent.generation, 0)
    const row = generationRows.get(generation) ?? 0
    generationRows.set(generation, row + 1)
    nodeByAgentId.set(agent.id, {
      ...agent,
      graphX: FAMILY_GRAPH_LEFT + generation * FAMILY_GRAPH_COLUMN_GAP,
      graphY: FAMILY_GRAPH_TOP + row * FAMILY_GRAPH_ROW_GAP,
    })
  }

  const links = visibleAgents.flatMap((agent) =>
    agent.parentIds
      .filter((parentId) => visibleAgentIds.has(parentId))
      .map((parentId) => ({ parentId, childId: agent.id }))
  )

  if (visibleAgents.length === 0) {
    return <EmptyState>No family graph yet.</EmptyState>
  }

  return (
    <div className={GRAPH_SURFACE_CLASS}>
      <div className="grid gap-1 border-b border-border p-3">
        <p className="text-xs font-normal">Parent to child graph</p>
        <p className="text-xs text-muted-foreground">
          A birth creates a child agent. Lines show which parent started which child.
        </p>
      </div>
      <svg
        viewBox={`0 0 ${FAMILY_GRAPH_VIEWBOX_WIDTH} ${FAMILY_GRAPH_VIEWBOX_HEIGHT}`}
        role="img"
        aria-label="Parent to child agent graph"
        className="block h-[300px] w-full"
      >
        {links.map((link) => {
          const parent = nodeByAgentId.get(link.parentId)
          const child = nodeByAgentId.get(link.childId)
          if (!parent || !child) return null
          return (
            <line
              key={`${link.parentId}-${link.childId}`}
              x1={
                parent.graphX +
                FAMILY_GRAPH_NODE_WIDTH -
                FAMILY_GRAPH_EDGE_INSET
              }
              y1={parent.graphY + FAMILY_GRAPH_NODE_HEIGHT / 2}
              x2={child.graphX + FAMILY_GRAPH_EDGE_INSET}
              y2={child.graphY + FAMILY_GRAPH_NODE_HEIGHT / 2}
              className="stroke-border"
              strokeWidth={GRAPH_EDGE_WIDTH}
            />
          )
        })}
        {visibleAgents.map((agent) => {
          const node = nodeByAgentId.get(agent.id)
          if (!node) return null
          const isSelected = agent.id === selectedAgentId
          return (
            <g key={agent.id}>
              <rect
                x={node.graphX}
                y={node.graphY}
                width={FAMILY_GRAPH_NODE_WIDTH}
                height={FAMILY_GRAPH_NODE_HEIGHT}
                rx={FAMILY_GRAPH_NODE_RADIUS}
                className={cn(
                  "stroke-border",
                  isSelected ? "fill-foreground/15" : "fill-background"
                )}
              />
              <text
                x={node.graphX + FAMILY_GRAPH_LABEL_OFFSET_X}
                y={node.graphY + FAMILY_GRAPH_NAME_OFFSET_Y}
                className="fill-foreground text-[10px]"
              >
                {agent.name}
              </text>
              <text
                x={node.graphX + FAMILY_GRAPH_LABEL_OFFSET_X}
                y={node.graphY + FAMILY_GRAPH_META_OFFSET_Y}
                className="fill-muted-foreground font-mono text-[9px]"
              >
                gen {agent.generation} - children{" "}
                {childCountByAgentId.get(agent.id) ?? 0}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

function AgentDetailTabs({
  agent,
  events,
  path,
  account,
  rpcUrl,
  liveAccountsError,
  isLoadingLiveAccounts,
}: {
  agent: CellAgent
  events: SocietyEvent[]
  path: Cell[]
  account?: AgentAccountLike
  rpcUrl: string
  liveAccountsError?: string
  isLoadingLiveAccounts: boolean
}) {
  return (
    <div className="grid gap-3">
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,0.75fr)]">
        <div className={PANEL_SURFACE_CLASS}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 gap-2">
              <AgentImage agent={agent} />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate text-sm font-normal">{agent.name}</p>
                  {agent.isHero && <Badge variant="secondary">selected</Badge>}
                </div>
                <p className="font-mono text-xs text-muted-foreground">
                  id {agent.identityId}
                </p>
              </div>
            </div>
            <Badge variant={agent.alive ? "outline" : "destructive"}>
              {agent.alive ? "live" : "ended"}
            </Badge>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {agentRole(agent)}
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2 font-mono text-xs tabular-nums xl:grid-cols-4">
            <p>score {format(agent.score)}</p>
            <p>{formatSocietyTokenAmount(agent.tokens)}</p>
            <p>trust {format(agent.reputation ?? 0)}</p>
            <p>earned {format(agent.earnedReputation ?? 0)}</p>
            <p>inherited {format(agent.inheritedReputation ?? 0)}</p>
            <p>heartbeats {format(agent.livenessProofs ?? 0)}</p>
            <p>age {format(agent.age ?? 0)}</p>
            <p>gen {format(agent.generation)}</p>
          </div>
        </div>
        <div className={PANEL_SURFACE_CLASS}>
          <p className="text-[11px] tracking-[0.18em] text-muted-foreground uppercase">
            Lineage
          </p>
          <div className="mt-3 grid gap-2 text-xs text-muted-foreground">
            <p>
              A birth creates a child agent with its own identity. The parent
              link shows where the child came from.
            </p>
            <p>
              Parent:{" "}
              {agent.parentIds.length > 0
                ? agent.parentIds.map((id) => short(id, 4)).join(" ")
                : "first generation"}
            </p>
            <p>Children: {format(agent.descendants)}</p>
            <p>
              Starting {SOCIETY_TOKEN_SYMBOL}:{" "}
              {format(agent.startingTokens ?? agent.tokens)}
            </p>
            <p>
              {SOCIETY_TOKEN_SYMBOL} from parent:{" "}
              {format(agent.inheritedTokens ?? 0)}
            </p>
          </div>
        </div>
      </div>

      <Tabs defaultValue="summary">
        <TabsList>
          <TabsTrigger value="summary">Summary</TabsTrigger>
          <TabsTrigger value="path">Path</TabsTrigger>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
          <TabsTrigger value="accounts">Accounts</TabsTrigger>
        </TabsList>
        <TabsContent value="summary">
          <div className="grid gap-3 lg:grid-cols-2">
            <div className={PANEL_SURFACE_CLASS}>
              <p className="text-xs font-normal">Life summary</p>
              <div className="mt-3 grid grid-cols-2 gap-2 font-mono text-xs tabular-nums">
                <p>food found {format(agent.harvestTotal ?? 0)}</p>
                <p>help given {format(agent.aidGiven ?? 0)}</p>
                <p>help received {format(agent.aidReceived ?? 0)}</p>
                <p>receipts {format(agent.receipts)}</p>
                <p>birth tick {format(agent.bornTick)}</p>
                <p>last tick {format(agent.lastTick)}</p>
              </div>
            </div>
            <div className={PANEL_SURFACE_CLASS}>
              <p className="text-xs font-normal">Current position</p>
              <div className="mt-3 grid gap-2 text-xs text-muted-foreground">
                <p>
                  Board cell {agent.x},{agent.y}
                </p>
                <p>Path points {format(path.length)}</p>
                <p>Recorded events {format(events.length)}</p>
              </div>
            </div>
          </div>
        </TabsContent>
        <TabsContent value="path">
          <AgentPathMap agent={agent} path={path} events={events} />
        </TabsContent>
        <TabsContent value="timeline">
          {events.length === 0 ? (
            <EmptyState>No events recorded yet for this agent.</EmptyState>
          ) : (
            <ScrollArea className="h-[320px] pr-2">
              <div className="grid gap-2">
                {events
                  .slice()
                  .reverse()
                  .map((event) => (
                    <div key={event.id} className={PANEL_SURFACE_CLASS}>
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-normal">{event.action}</p>
                        <Badge variant="outline">tick {event.tick}</Badge>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {event.note}
                      </p>
                      <p className="mt-2 font-mono text-xs text-muted-foreground">
                        cell {event.cell.x},{event.cell.y} -{" "}
                        {event.tokenDelta >= 0 ? "+" : ""}
                        {formatSocietyTokenDelta(event.tokenDelta)}
                      </p>
                    </div>
                  ))}
              </div>
            </ScrollArea>
          )}
        </TabsContent>
        <TabsContent value="accounts">
          <AgentAccountPanel
            account={account}
            rpcUrl={rpcUrl}
            liveAccountsError={liveAccountsError}
            isLoadingLiveAccounts={isLoadingLiveAccounts}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function AgentPathMap({
  agent,
  path,
  events,
}: {
  agent: CellAgent
  path: Cell[]
  events: SocietyEvent[]
}) {
  if (path.length === 0) {
    return <EmptyState>No path yet for this agent.</EmptyState>
  }

  const xs = path.map((point) => point.x)
  const ys = path.map((point) => point.y)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const spanX = Math.max(maxX - minX, 1)
  const spanY = Math.max(maxY - minY, 1)
  const width = 720
  const height = 220
  const padding = 24
  const scaled = path.map((point) => ({
    x: padding + ((point.x - minX) / spanX) * (width - padding * 2),
    y: padding + ((point.y - minY) / spanY) * (height - padding * 2),
  }))
  const polyline = scaled.map((point) => `${point.x},${point.y}`).join(" ")

  return (
    <div className="grid gap-3">
      <div className={GRAPH_SURFACE_CLASS}>
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="block h-[240px] w-full"
          role="img"
          aria-label={`${agent.name} path graph`}
        >
          <rect
            x="0"
            y="0"
            width={width}
            height={height}
            className="fill-background/0"
          />
          <polyline
            fill="none"
            stroke="rgba(255,255,255,0.78)"
            strokeWidth="2"
            points={polyline}
          />
          {scaled.map((point, index) => (
            <g key={`${point.x}-${point.y}-${index}`}>
              <circle
                cx={point.x}
                cy={point.y}
                r={index === scaled.length - 1 ? 6 : 4}
                fill={index === scaled.length - 1 ? "#ffffff" : "#ff8f8f"}
              />
              <text
                x={point.x + 8}
                y={point.y - 8}
                className="fill-muted-foreground font-mono text-[10px]"
              >
                {index}
              </text>
            </g>
          ))}
        </svg>
      </div>
      <div className="grid gap-2 md:grid-cols-3">
        <div className={PANEL_SURFACE_CLASS}>
          <p className="text-xs font-normal">Travel span</p>
          <p className="mt-2 font-mono text-sm">
            {minX},{minY} {"->"} {maxX},{maxY}
          </p>
        </div>
        <div className={PANEL_SURFACE_CLASS}>
          <p className="text-xs font-normal">Path points</p>
          <p className="mt-2 font-mono text-sm">{format(path.length)}</p>
        </div>
        <div className={PANEL_SURFACE_CLASS}>
          <p className="text-xs font-normal">Recorded events</p>
          <p className="mt-2 font-mono text-sm">{format(events.length)}</p>
        </div>
      </div>
    </div>
  )
}

function AgentAccountPanel({
  account,
  rpcUrl,
  liveAccountsError,
  isLoadingLiveAccounts,
}: {
  account?: AgentAccountLike
  rpcUrl: string
  liveAccountsError?: string
  isLoadingLiveAccounts: boolean
}) {
  if (isLoadingLiveAccounts) {
    return <EmptyState>Loading live accounts for this agent.</EmptyState>
  }
  if (liveAccountsError) {
    return <EmptyState>{liveAccountsError}</EmptyState>
  }
  if (!account) {
    return (
      <EmptyState>
        No accounts loaded yet. Start or resume a world to fetch them.
      </EmptyState>
    )
  }

  const rows: Array<{ label: string; address: string; signature?: string }> = []
  if (account.authority?.address) {
    rows.push({
      label: "Agent signer",
      address: account.authority.address,
      signature: account.funding?.signature,
    })
  }
  rows.push({
    label: "Identity",
    address: account.identity.address,
    signature: account.identity.signature,
  })
  if (account.delegation?.address) {
    rows.push({
      label: "Delegation",
      address: account.delegation.address,
      signature: account.delegation.signature,
    })
  }
  rows.push({
    label: "SOL Stake",
    address: account.stake.address,
    signature: account.stake.signature,
  })

  return (
    <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
      {rows.map((row) => (
        <div key={row.label} className={PANEL_SURFACE_CLASS}>
          <p className="text-xs font-normal">{row.label}</p>
          <p className="mt-2 font-mono text-xs break-all text-muted-foreground">
            {row.address}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="secondary" asChild>
              <a
                href={accountHref(row.address)}
                target="_blank"
                rel="noreferrer"
              >
                Raw account
              </a>
            </Button>
            <Button variant="secondary" asChild>
              <a
                href={solanaExplorerHref({
                  kind: "address",
                  value: row.address,
                  rpcUrl,
                })}
                target="_blank"
                rel="noreferrer"
              >
                Explorer
              </a>
            </Button>
            <CopyButton value={row.address} />
            {row.signature && (
              <Button variant="secondary" asChild>
                <a
                href={transactionHref(row.signature)}
                target="_blank"
                rel="noreferrer"
              >
                  Raw tx
                </a>
              </Button>
            )}
            {row.signature && (
              <Button variant="outline" asChild>
                <a
                  href={solanaExplorerHref({
                    kind: "tx",
                    value: row.signature,
                    rpcUrl,
                  })}
                  target="_blank"
                  rel="noreferrer"
                >
                  Explorer tx
                </a>
              </Button>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

function OnboardingOverlay({
  step,
  missionModel,
  template,
  templates,
  liveWindow,
  liveStatus,
  fixedBoardCommentary,
  requestedAgentCount,
  isStartingLive,
  hasLiveSession,
  selectedArchetype,
  selectedAgent,
  selectedAgentEvents,
  onChooseTemplate,
  onChooseArchetype,
  onRandomizeArchetype,
  onNextStep,
  onPreviousStep,
  onStartLiveWorld,
}: {
  step: number
  missionModel: OnboardingMissionModel
  template?: OnboardingTemplate
  templates: OnboardingTemplate[]
  liveWindow: OnboardingLiveWindowModel
  liveStatus: string
  fixedBoardCommentary: FixedBoardCommentary
  requestedAgentCount: number
  isStartingLive: boolean
  hasLiveSession: boolean
  selectedArchetype: string
  selectedAgent?: CellAgent
  selectedAgentEvents: SocietyEvent[]
  onChooseTemplate: (templateId: string) => void
  onChooseArchetype: (archetypeId: string) => void
  onRandomizeArchetype: () => void
  onNextStep: () => void
  onPreviousStep: () => void
  onStartLiveWorld: () => void
}) {
  const canGoBack = step > 0
  const isFinalStep = step >= MAX_ONBOARDING_STEP
  const activeProgressIndex = missionModel.progressItems.findIndex(
    (item) => item.current
  )
  const StepIcon =
    missionModel.stage === "world"
      ? Globe
      : missionModel.stage === "agent"
        ? UserRound
        : Coins
  const topMetrics = liveWindow.worldMetrics.slice(
    0,
    ONBOARDING_VISIBLE_METRIC_COUNT
  )
  const traceItems = liveWindow.traceItems.slice(
    0,
    ONBOARDING_VISIBLE_TRACE_COUNT
  )
  const progressDetail = (
    item: OnboardingMissionModel["progressItems"][number]
  ) => {
    if (item.id === "world") {
      return item.complete || item.current
        ? missionModel.worldLabel
        : "Choose the world"
    }
    if (item.id === "agent") {
      return item.complete || item.current
        ? missionModel.lineLabel
        : "Choose one agent"
    }
    if (!item.complete && !item.current) {
      return "Open receipts and accounts"
    }
    return missionModel.focusMoment?.title || "Ready now"
  }
  const launchActionLabel = hasLiveSession
    ? "Enter live board"
    : `Prepare ${format(requestedAgentCount)} agents and start live world`
  const actionButton = isFinalStep ? (
    <Button
      variant="secondary"
      size="lg"
      onClick={onStartLiveWorld}
      disabled={isStartingLive}
      aria-busy={isStartingLive}
      className="min-w-52"
    >
      <ArrowRight data-icon="inline-start" />
      {isStartingLive
        ? `Preparing ${format(requestedAgentCount)} agents`
        : launchActionLabel}
    </Button>
  ) : (
    <Button
      variant="secondary"
      size="lg"
      onClick={onNextStep}
      className="min-w-52"
    >
      <ArrowRight data-icon="inline-start" />
      {missionModel.primaryActionLabel}
    </Button>
  )

  return (
    <div className="fixed inset-0 z-50 overflow-auto bg-background/84 backdrop-blur-[4px]">
      <div className="mx-auto grid min-h-svh w-full max-w-[112rem] gap-4 p-3 md:p-5 xl:grid-cols-[minmax(0,1fr)_30rem]">
        <main className="grid min-h-[calc(100svh-1.5rem)] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden rounded-lg border border-border bg-background/76 shadow-[0_24px_120px_rgba(0,0,0,0.38)] backdrop-blur-[6px] md:min-h-[calc(100svh-2.5rem)]">
          <header className="border-b border-border p-4 md:p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="grid max-w-3xl gap-4">
                <Badge
                  variant="outline"
                  className="h-7 w-fit px-3 text-[11px] uppercase"
                >
                  Trust Substrate demo
                </Badge>
                <div className="grid gap-3">
                  <h2 className="flex items-start gap-3 text-3xl leading-tight font-normal tracking-tight md:text-5xl">
                    <StepIcon className="mt-1 size-7 shrink-0 text-primary md:size-9" />
                    {missionModel.headline}
                  </h2>
                  <p className="max-w-[64ch] text-sm leading-6 text-muted-foreground md:text-base">
                    {missionModel.body}
                  </p>
                </div>
              </div>
              <div className="grid gap-1 text-left md:text-right">
                <p className="font-mono text-xs text-muted-foreground uppercase">
                  Step {step + 1} of {missionModel.progressItems.length}
                </p>
                <p className="text-sm text-foreground">
                  {missionModel.worldLabel}
                </p>
                <p className="text-xs text-muted-foreground">{liveStatus}</p>
              </div>
            </div>
          </header>

          <div className="overflow-auto p-4 md:p-6">
            <div className="grid gap-5 2xl:grid-cols-[18rem_minmax(0,1fr)]">
              <aside className="grid h-fit gap-2">
                {missionModel.progressItems.map((item, index) => (
                  <div
                    key={item.id}
                    className={cn(
                      "grid gap-2 rounded-lg border border-border bg-background/35 p-3",
                      item.current && "border-primary/55 bg-primary/10"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className={cn(
                          "inline-flex size-7 shrink-0 items-center justify-center rounded-full border font-mono text-xs",
                          item.complete
                            ? "border-primary/45 bg-primary/15 text-primary"
                            : item.current
                              ? "border-primary/55 text-primary"
                              : "border-border text-muted-foreground"
                        )}
                      >
                        {item.complete ? (
                          <Check className="size-3.5" />
                        ) : (
                          index + 1
                        )}
                      </span>
                      <p className="text-sm text-foreground">{item.label}</p>
                    </div>
                    <p className="pl-10 text-xs leading-5 text-muted-foreground">
                      {progressDetail(item)}
                    </p>
                  </div>
                ))}
              </aside>

              <section className="grid content-start gap-4">
                {step === 0 && (
                  <div className="grid gap-4">
                    <div className="grid gap-3 md:grid-cols-3">
                      {ONBOARDING_STORY_POINTS.map((point) => (
                        <div
                          key={point.title}
                          className="rounded-lg border border-border/70 bg-background/32 p-4"
                        >
                          <p className="text-sm text-foreground">
                            {point.title}
                          </p>
                          <p className="mt-2 text-xs leading-5 text-muted-foreground">
                            {point.detail}
                          </p>
                        </div>
                      ))}
                    </div>
                    <ToggleGroup
                      type="single"
                      value={template?.id}
                      onValueChange={(value) => {
                        if (value) onChooseTemplate(value)
                      }}
                      variant="outline"
                      spacing={2}
                      aria-label="Choose a live world"
                      className="grid w-full gap-3 lg:grid-cols-3"
                    >
                      {templates
                        .slice(0, ONBOARDING_CURATED_TEMPLATE_COUNT)
                        .map((option) => {
                          const TemplateIcon =
                            TEMPLATE_ICONS[option.id] || Landmark
                          const isSelected = template?.id === option.id
                          return (
                            <ToggleGroupItem
                              key={option.id}
                              value={option.id}
                              size="lg"
                              className={cn(
                                ONBOARDING_SELECT_ITEM_CLASS,
                                "min-h-56 justify-start"
                              )}
                            >
                              <div className="flex h-full w-full flex-col p-5 text-left">
                                <div className="flex items-start justify-between gap-3">
                                  <span className="inline-flex size-11 items-center justify-center rounded-lg border border-border bg-background/45">
                                    <TemplateIcon className="size-5 text-primary" />
                                  </span>
                                  {isSelected && (
                                    <Badge
                                      variant="secondary"
                                      className="h-7 px-3 text-[11px]"
                                    >
                                      selected
                                    </Badge>
                                  )}
                                </div>
                                <div className="mt-auto grid gap-3 pt-8">
                                  <span className="text-2xl leading-none tracking-tight text-foreground">
                                    {option.name}
                                  </span>
                                  <span className="text-sm leading-6 text-foreground">
                                    {option.cue}
                                  </span>
                                  <span className="text-xs leading-5 text-muted-foreground">
                                    {option.description}
                                  </span>
                                </div>
                              </div>
                            </ToggleGroupItem>
                          )
                        })}
                    </ToggleGroup>
                  </div>
                )}

                {step === 1 && (
                  <div className="grid gap-3">
                    <div className="rounded-lg border border-border/70 bg-background/32 p-4">
                      <p className="text-sm text-foreground">
                        This choice is your camera.
                      </p>
                      <p className="mt-2 max-w-3xl text-xs leading-5 text-muted-foreground">
                        The world still runs for everyone. Following one agent
                        makes the parent links, {SOCIETY_TOKEN_SYMBOL} changes,
                        and receipts
                        easier to read.
                      </p>
                    </div>
                    <ToggleGroup
                      type="single"
                      value={selectedArchetype}
                      onValueChange={(value) => {
                        if (value) onChooseArchetype(value)
                      }}
                      variant="outline"
                      spacing={2}
                      aria-label="Choose the agent type you want to follow"
                      className="grid w-full gap-3 sm:grid-cols-2 xl:grid-cols-3"
                    >
                      {AGENT_ARCHETYPE_CHOICES.map((choice) => {
                        const ArchetypeIcon =
                          ARCHETYPE_ICONS[choice.id] || UserRound
                        const isSelected = selectedArchetype === choice.id
                        return (
                          <ToggleGroupItem
                            key={choice.id}
                            value={choice.id}
                            size="lg"
                            className={cn(
                              ONBOARDING_SELECT_ITEM_CLASS,
                              "min-h-48 justify-start"
                            )}
                          >
                            <div className="flex h-full w-full flex-col p-5 text-left">
                              <div className="flex items-start justify-between gap-3">
                                <span className="inline-flex size-10 items-center justify-center rounded-lg border border-border bg-background/45">
                                  <ArchetypeIcon className="size-5 text-primary" />
                                </span>
                                {isSelected && (
                                  <Badge
                                    variant="secondary"
                                    className="h-7 px-3 text-[11px]"
                                  >
                                    selected
                                  </Badge>
                                )}
                              </div>
                              <div className="mt-auto grid gap-2 pt-8">
                                <span className="text-xl leading-none tracking-tight text-foreground">
                                  {choice.name}
                                </span>
                                <span className="text-xs leading-5 text-muted-foreground">
                                  {choice.description}
                                </span>
                              </div>
                            </div>
                          </ToggleGroupItem>
                        )
                      })}
                    </ToggleGroup>
                    <Button
                      variant="outline"
                      size="lg"
                      onClick={onRandomizeArchetype}
                      className="w-full sm:w-fit"
                    >
                      <Shuffle data-icon="inline-start" />
                      Pick for me
                    </Button>
                  </div>
                )}

                {step === 2 && (
                  <div className="grid gap-4">
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                      {ONBOARDING_PROOF_POINTS.map(([title, detail]) => (
                        <div
                          key={title}
                          className="rounded-lg border border-border bg-background/35 p-4"
                        >
                          <p className="text-sm text-foreground">{title}</p>
                          <p className="mt-2 text-xs leading-5 text-muted-foreground">
                            {detail}
                          </p>
                        </div>
                      ))}
                    </div>
                    <div
                      className={cn(
                        "grid gap-4 rounded-lg border p-4 md:p-5",
                        missionModel.focusMoment
                          ? "border-primary/40 bg-primary/10"
                          : "border-border bg-background/35"
                      )}
                    >
                      {missionModel.focusMoment ? (
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="grid gap-2">
                            <p className="flex items-center gap-2 text-base text-foreground md:text-lg">
                              <FlaskConical className="size-4 text-primary" />
                              {missionModel.focusMoment.title}
                            </p>
                            <p className="font-mono text-xs text-muted-foreground">
                              {missionModel.focusMoment.detail}
                            </p>
                          </div>
                          <Badge variant="secondary">latest event</Badge>
                        </div>
                      ) : (
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="grid gap-2">
                            <p className="flex items-center gap-2 text-base text-foreground md:text-lg">
                              <Coins className="size-4 text-primary" />
                              Ready to launch
                            </p>
                            <p className="font-mono text-xs text-muted-foreground">
                              no live event needed
                            </p>
                          </div>
                          <Badge variant="outline">no waiting</Badge>
                        </div>
                      )}
                      <p className="max-w-3xl text-sm leading-6 text-foreground md:text-base">
                        {missionModel.focusMoment
                          ? missionModel.focusMoment.whyItMatters
                          : `The next click prepares ${format(
                              requestedAgentCount
                            )} agents from this onboarding setup, creates their accounts, and opens the live board.`}
                      </p>
                    </div>
                    {selectedAgent && (
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div
                          className={
                            ONBOARDING_INSET_CARD_CLASS + " rounded-lg p-4"
                          }
                        >
                          <p className="text-[11px] text-muted-foreground uppercase">
                            Followed agent
                          </p>
                          <p className="mt-2 text-lg text-foreground">
                            {selectedAgent.name}
                          </p>
                        </div>
                        <div
                          className={
                            ONBOARDING_INSET_CARD_CLASS + " rounded-lg p-4"
                          }
                        >
                          <p className="text-[11px] text-muted-foreground uppercase">
                            Events so far
                          </p>
                          <p className="mt-2 font-mono text-lg text-foreground">
                            {format(selectedAgentEvents.length)}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </section>
            </div>
          </div>

          <footer className="border-t border-border bg-background/70 p-4 md:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="grid gap-1">
                <p className="text-sm text-foreground">
                  {missionModel.worldLabel} / {missionModel.lineLabel}
                </p>
                <p className="text-xs text-muted-foreground">
                  {activeProgressIndex + 1 > 0
                    ? missionModel.progressItems[activeProgressIndex]?.label
                    : missionModel.headline}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {canGoBack && (
                  <Button
                    variant="outline"
                    size="lg"
                    onClick={onPreviousStep}
                    className="min-w-32"
                  >
                    <ArrowLeft data-icon="inline-start" />
                    Back
                  </Button>
                )}
                {actionButton}
              </div>
            </div>
          </footer>
        </main>

        <aside className="grid content-start gap-3 rounded-lg border border-border bg-background/68 p-4 shadow-[0_24px_120px_rgba(0,0,0,0.28)] backdrop-blur-[6px] xl:min-h-[calc(100svh-2.5rem)]">
          <div className="flex items-start justify-between gap-3">
            <div className="grid gap-1">
              <p className="text-sm text-foreground">Live record</p>
              <p className="font-mono text-xs text-muted-foreground">
                {liveWindow.statusLine}
              </p>
            </div>
            <Badge variant="outline">running</Badge>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {topMetrics.map((metric) => (
              <div
                key={metric.label}
                className="rounded-lg border border-border bg-background/35 p-3"
              >
                <p className="text-[11px] text-muted-foreground uppercase">
                  {metric.label}
                </p>
                <p className="mt-2 font-mono text-lg text-foreground">
                  {format(metric.value)}
                </p>
              </div>
            ))}
          </div>
          <Separator />
          <div className="grid gap-2">
            <p className="text-sm text-foreground">Recent receipts</p>
            {traceItems.length > 0 ? (
              traceItems.map((item) => (
                <div
                  key={item.id}
                  className="rounded-lg border border-border bg-background/35 p-3"
                >
                  <p className="text-sm text-foreground">{item.label}</p>
                  <p className="mt-1 font-mono text-xs text-muted-foreground">
                    {item.detail}
                  </p>
                </div>
              ))
            ) : (
              <div className="rounded-lg border border-dashed border-border bg-background/25 p-3 text-sm text-muted-foreground">
                Waiting for the first confirmed action.
              </div>
            )}
          </div>
          <FixedCommentaryLine commentary={fixedBoardCommentary} />
          {liveWindow.lineSummary && (
            <>
              <Separator />
              <div className="grid gap-3">
                <p className="text-sm text-foreground">
                  {liveWindow.lineSummary.headline}
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {liveWindow.lineSummary.stats.map((stat) => (
                    <div
                      key={stat.label}
                      className="rounded-lg border border-border bg-background/35 p-3"
                    >
                      <p className="text-[11px] text-muted-foreground uppercase">
                        {stat.label}
                      </p>
                      <p className="mt-2 font-mono text-sm text-foreground">
                        {format(stat.value)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </aside>
      </div>
    </div>
  )
}

function FixedCommentaryLine({
  commentary,
}: {
  commentary: FixedBoardCommentary
}) {
  return (
    <div className="rounded-md border border-border bg-background/30 p-3">
      <p className="text-[11px] tracking-[0.18em] text-muted-foreground uppercase">
        What happened
      </p>
      <p className="mt-2 text-sm text-foreground">{commentary.label}</p>
      <p className="mt-1 font-mono text-xs text-muted-foreground">
        {commentary.detail}
      </p>
    </div>
  )
}

function MetricGrid({ items }: { items: Array<[string, number | string]> }) {
  return (
    <div className="grid grid-cols-6 gap-2 max-lg:grid-cols-3 max-md:grid-cols-2">
      {items.map(([label, value]) => (
        <div key={label} className={METRIC_SURFACE_CLASS}>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="font-mono text-sm font-normal tabular-nums">
            {format(value)}
          </p>
        </div>
      ))}
    </div>
  )
}

function RuleList() {
  const rules = [
    ["Birth", "child agent identity"],
    ["Heartbeat", "liveness receipt"],
    ["Resources", "finite squares"],
    ["Cost", `${SOCIETY_TOKEN_SYMBOL} paid each tick`],
    ["Inheritance", "value can pass down"],
    ["Commit", "receipts land on Surfpool"],
  ]
  return (
    <div className="grid gap-2">
      {rules.map(([label, detail]) => (
        <div key={label} className="flex items-baseline justify-between gap-3">
          <p className="text-xs font-normal">{label}</p>
          <p className="text-right text-xs text-muted-foreground">{detail}</p>
        </div>
      ))}
    </div>
  )
}

function IdentityInspector({
  agent,
  isHovering,
  isSelected,
}: {
  agent?: CellAgent
  isHovering: boolean
  isSelected: boolean
}) {
  if (!agent) {
    return (
      <Empty className={PLAYGROUND_EMPTY_STATE_CLASS}>
        <EmptyDescription>
          Hover an agent after launch to see details.
        </EmptyDescription>
      </Empty>
    )
  }

  return (
    <div className={PANEL_SURFACE_CLASS}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 gap-2">
          <AgentImage agent={agent} />
          <div className="min-w-0">
            <p className="truncate text-xs font-normal">{agent.name}</p>
            <p className="font-mono text-xs text-muted-foreground">
              id {agent.identityId}
            </p>
          </div>
        </div>
        <Badge variant={isSelected ? "secondary" : "outline"}>
          {isHovering ? "hover" : isSelected ? "selected on board" : "top"}
        </Badge>
      </div>
      {agent.archetype ? (
        <p className="mt-2 text-xs text-muted-foreground">
          {agentRole(agent)}
        </p>
      ) : null}
      <div className="mt-2 grid grid-cols-2 gap-2 font-mono text-xs text-muted-foreground tabular-nums">
        <p>
          board {agent.x},{agent.y}
        </p>
        <p>age {format(agent.age ?? 0)}</p>
        <p>heartbeats {format(agent.livenessProofs ?? 0)}</p>
        <p>{formatSocietyTokenAmount(agent.tokens)}</p>
      </div>
    </div>
  )
}

function AgentRow({ agent }: { agent: CellAgent }) {
  return (
    <div className={PANEL_SURFACE_CLASS} title={`board ${agent.x},${agent.y}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 gap-2">
          <AgentImage agent={agent} />
          <div className="min-w-0">
            <p className="truncate text-xs font-normal">{agent.name}</p>
            <p className="font-mono text-xs text-muted-foreground">
              {short(agent.identityId)}
            </p>
          </div>
        </div>
        <Badge variant={agent.alive ? "outline" : "destructive"}>
          {agent.alive ? "live" : "ended"}
        </Badge>
      </div>
      <div className="mt-2 max-h-10 overflow-hidden text-xs text-muted-foreground">
        {agentRole(agent)}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 font-mono text-xs tabular-nums">
        <p>{format(agent.score)} score</p>
        <p>{formatSocietyTokenAmount(agent.tokens)}</p>
        <p>{format(agent.age ?? 0)} age</p>
        <p>{format(agent.livenessProofs ?? 0)} heartbeats</p>
        <p>{format(agent.startingTokens ?? agent.tokens)} start</p>
        <p>{format(agent.descendants)} children</p>
      </div>
    </div>
  )
}

function AgentImage({
  agent,
}: {
  agent: Pick<CellAgent, "image" | "imageAlt" | "name">
}) {
  return (
    <img
      src={agent.image}
      alt={agent.imageAlt || `${agent.name} avatar`}
      width={32}
      height={32}
      decoding="async"
      className={AGENT_IMAGE_CLASS}
    />
  )
}

function EventAgentImage({ image, name }: { image?: string; name: string }) {
  if (!image) return null
  return (
    <img
      src={image}
      alt={`${name} avatar`}
      width={24}
      height={24}
      decoding="async"
      className={EVENT_IMAGE_CLASS}
    />
  )
}

function EventList({
  events,
  onSelectAgent,
}: {
  events: SocietyEvent[]
  onSelectAgent?: (agentId: string) => void
}) {
  if (events.length === 0) {
    return <EmptyState>No events yet.</EmptyState>
  }
  return (
    <ScrollArea className="h-[320px] pr-2">
      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {events.map((event) => (
          <button
            key={event.id}
            type="button"
            className={INTERACTIVE_PANEL_CLASS}
            onClick={() => onSelectAgent?.(event.agentId)}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <EventAgentImage
                  image={event.actorImage}
                  name={event.agentName}
                />
                <p className="truncate text-xs font-normal">
                  {event.agentName}
                </p>
              </div>
              <Badge variant="outline">{event.action}</Badge>
            </div>
            {event.actorIdentityId && (
              <p className="mt-1 font-mono text-xs text-muted-foreground">
                {short(event.actorIdentityId)}
              </p>
            )}
            <p className="mt-1 text-xs text-muted-foreground">{event.note}</p>
            <p className="mt-2 font-mono text-xs text-muted-foreground">
              tick {event.tick} - {event.tokenDelta >= 0 ? "+" : ""}
              {formatSocietyTokenDelta(event.tokenDelta)}
            </p>
            {event.parentIds.length > 0 && (
              <p className="mt-1 font-mono text-xs text-muted-foreground">
                parents {event.parentIds.map((id) => short(id, 4)).join(" ")}
              </p>
            )}
          </button>
        ))}
      </div>
    </ScrollArea>
  )
}

function GraphList({
  agents,
  programs,
  receipts,
  batchNodes,
  liveSnapshot,
}: {
  agents: CellAgent[]
  programs: ProgramNode[]
  receipts: ReceiptNode[]
  batchNodes: Map<string, BatchNode>
  liveSnapshot?: LiveSessionSnapshot
}) {
  const visiblePrograms = programs
  const isLiveGraph = Boolean(liveSnapshot)

  return (
    <div className="grid gap-2.5">
      {isLiveGraph ? (
        <div className="grid gap-2">
          <MetricGrid
            items={[
              ["Status", liveSnapshot?.status || "paused"],
              ["Tick", liveSnapshot?.confirmedFrame.tick ?? 0],
              ["Receipts", liveSnapshot?.confirmedReceipts.length ?? 0],
              ["Actions", liveSnapshot?.committedActions.length ?? 0],
              ["Pending", liveSnapshot?.pendingAction?.action || "none"],
              [
                "Proof",
                liveSnapshot?.proof
                  ? short(liveSnapshot.proof.hash, 4)
                  : "pending",
              ],
            ]}
          />
          <EmptyState>
            Live mode reads the current Surfpool world. Recent confirmed actions
            show below as the graph fills in.
          </EmptyState>
        </div>
      ) : (
        <GraphCanvas agents={agents} receipts={receipts} stackRows={[]} />
      )}
      <FamilyGraph agents={agents} />
      <div className="grid gap-2 md:grid-cols-4">
        {visiblePrograms.map((program) => (
          <div key={program.name} className={PANEL_SURFACE_CLASS}>
            <p className="text-xs font-normal">{program.name}</p>
            <p className="text-xs text-muted-foreground">{program.role}</p>
          </div>
        ))}
      </div>
      {isLiveGraph ? (
        <ScrollArea className="h-[320px] pr-2">
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {(liveSnapshot?.confirmedEvents ?? [])
              .slice(-18)
              .reverse()
              .map((event) => (
                <div key={event.id} className={PANEL_SURFACE_CLASS}>
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-xs font-normal">
                      {event.agentName}
                    </p>
                    <Badge variant="outline">{event.action}</Badge>
                  </div>
                  <p className="mt-1 font-mono text-xs text-muted-foreground">
                    tick {event.tick} - {short(event.agentId, 4)}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {event.note}
                  </p>
                </div>
              ))}
          </div>
        </ScrollArea>
      ) : receipts.length === 0 ? (
        <EmptyState>No receipts match this filter.</EmptyState>
      ) : (
        <ScrollArea className="h-[320px] pr-2">
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {receipts
              .slice(-30)
              .reverse()
              .map((receipt) => {
                const batch = batchNodes.get(receipt.batchId)
                return (
                  <div key={receipt.id} className={PANEL_SURFACE_CLASS}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <EventAgentImage
                          image={receipt.actorImage}
                          name={receipt.actorName}
                        />
                        <p className="truncate text-xs font-normal">
                          {receipt.actorName}
                        </p>
                      </div>
                      <Badge variant="outline">{receipt.kind}</Badge>
                    </div>
                    {receipt.actorIdentityId && (
                      <p className="mt-1 font-mono text-xs text-muted-foreground">
                        {short(receipt.actorIdentityId)}
                      </p>
                    )}
                    <p className="mt-1 font-mono text-xs text-muted-foreground">
                      {receipt.action} {short(receipt.id)}
                    </p>
                    <p className="font-mono text-xs text-muted-foreground">
                      root {short(batch?.eventRoot)}
                    </p>
                    {receipt.parentIds.length > 0 && (
                      <p className="font-mono text-xs text-muted-foreground">
                        parents{" "}
                        {receipt.parentIds.map((id) => short(id, 4)).join(" ")}
                      </p>
                    )}
                  </div>
                )
              })}
          </div>
        </ScrollArea>
      )}
    </div>
  )
}

function GraphCanvas({
  agents,
  receipts,
  stackRows,
}: {
  agents: CellAgent[]
  receipts: ReceiptNode[]
  stackRows: StackGraphRow[]
}) {
  const graphRef = React.useRef<HTMLDivElement | null>(null)
  const graphFullscreen = useElementFullscreen(graphRef)
  const hasStackRows = stackRows.length > 0
  const activeReceipts = receipts.slice(-GRAPH_NODE_LIMIT).reverse()
  const activeActorIds = new Set(
    activeReceipts.map((receipt) => receipt.actorId)
  )
  const activeAgents = [
    ...agents.filter((agent) => activeActorIds.has(agent.id)),
    ...agents.filter((agent) => !activeActorIds.has(agent.id)),
  ].slice(0, GRAPH_NODE_LIMIT)
  const agentIndexById = new Map(
    activeAgents.map((agent, index) => [agent.id, index])
  )
  const FullscreenIcon = graphFullscreen.isFullscreen ? Minimize2 : Maximize2

  if (
    !hasStackRows &&
    activeAgents.length === 0 &&
    activeReceipts.length === 0
  ) {
    return <EmptyState>No graph data yet.</EmptyState>
  }

  return (
    <div ref={graphRef} className={GRAPH_SURFACE_CLASS}>
      <svg
        viewBox={`0 0 ${GRAPH_VIEWBOX_WIDTH} ${
          hasStackRows ? STACK_VIEWBOX_HEIGHT : GRAPH_VIEWBOX_HEIGHT
        }`}
        role="img"
        aria-label={
          hasStackRows ? "Trust Substrate stack graph" : "Agent receipt graph"
        }
        className={cn(
          GRAPH_SVG_CLASS,
          graphFullscreen.isFullscreen && GRAPH_FULLSCREEN_SVG_CLASS
        )}
      >
        {hasStackRows ? (
          <StackGraphRows rows={stackRows} />
        ) : (
          <>
            <text
              x={GRAPH_AGENT_X}
              y={GRAPH_LABEL_Y}
              className="fill-muted-foreground text-[10px]"
            >
              agents
            </text>
            <text
              x={GRAPH_RECEIPT_X}
              y={GRAPH_LABEL_Y}
              className="fill-muted-foreground text-[10px]"
            >
              receipts
            </text>
            <text
              x={GRAPH_BATCH_X}
              y={GRAPH_LABEL_Y}
              className="fill-muted-foreground text-[10px]"
            >
              batches
            </text>

            {activeReceipts.map((receipt, index) => {
              const y = GRAPH_TOP + index * GRAPH_ROW_GAP
              const agentIndex = agentIndexById.get(receipt.actorId)
              const agentY =
                agentIndex === undefined
                  ? GRAPH_TOP
                  : GRAPH_TOP + agentIndex * GRAPH_ROW_GAP
              return (
                <g key={`edge-${receipt.id}`}>
                  <line
                    x1={GRAPH_AGENT_X + GRAPH_NODE_SIZE}
                    y1={agentY + GRAPH_NODE_SIZE / 2}
                    x2={GRAPH_RECEIPT_X}
                    y2={y + GRAPH_RECEIPT_HEIGHT / 2}
                    className="stroke-border"
                    strokeWidth={GRAPH_EDGE_WIDTH}
                  />
                  <line
                    x1={GRAPH_RECEIPT_X + GRAPH_RECEIPT_WIDTH}
                    y1={y + GRAPH_RECEIPT_HEIGHT / 2}
                    x2={GRAPH_BATCH_X}
                    y2={y + GRAPH_BATCH_HEIGHT / 2}
                    className="stroke-border"
                    strokeWidth={GRAPH_EDGE_WIDTH}
                  />
                </g>
              )
            })}

            {activeAgents.map((agent, index) => {
              const y = GRAPH_TOP + index * GRAPH_ROW_GAP
              return (
                <g key={agent.id}>
                  <image
                    href={agent.image}
                    x={GRAPH_AGENT_X}
                    y={y}
                    width={GRAPH_NODE_SIZE}
                    height={GRAPH_NODE_SIZE}
                    preserveAspectRatio="xMidYMid slice"
                  />
                  <text
                    x={GRAPH_AGENT_X + GRAPH_NODE_SIZE + GRAPH_TEXT_OFFSET_X}
                    y={y + GRAPH_AGENT_NAME_OFFSET_Y}
                    className="fill-foreground text-[10px]"
                  >
                    {agent.name}
                  </text>
                  <text
                    x={GRAPH_AGENT_X + GRAPH_NODE_SIZE + GRAPH_TEXT_OFFSET_X}
                    y={y + GRAPH_AGENT_ID_OFFSET_Y}
                    className="fill-muted-foreground font-mono text-[9px]"
                  >
                    {short(agent.identityId, 4)}
                  </text>
                </g>
              )
            })}

            {activeReceipts.map((receipt, index) => {
              const y = GRAPH_TOP + index * GRAPH_ROW_GAP
              return (
                <g key={receipt.id}>
                  <rect
                    x={GRAPH_RECEIPT_X}
                    y={y}
                    width={GRAPH_RECEIPT_WIDTH}
                    height={GRAPH_RECEIPT_HEIGHT}
                    rx={GRAPH_NODE_RADIUS}
                    className="fill-background stroke-border"
                  />
                  <text
                    x={GRAPH_RECEIPT_X + GRAPH_TEXT_OFFSET_X}
                    y={y + GRAPH_RECEIPT_TEXT_OFFSET_Y}
                    className="fill-foreground font-mono text-[9px]"
                  >
                    {receipt.action} {short(receipt.id, 4)}
                  </text>
                  <rect
                    x={GRAPH_BATCH_X}
                    y={y}
                    width={GRAPH_BATCH_WIDTH}
                    height={GRAPH_BATCH_HEIGHT}
                    rx={GRAPH_NODE_RADIUS}
                    className="fill-background stroke-border"
                  />
                  <text
                    x={GRAPH_BATCH_X + GRAPH_TEXT_OFFSET_X}
                    y={y + GRAPH_BATCH_TEXT_OFFSET_Y}
                    className="fill-muted-foreground font-mono text-[9px]"
                  >
                    {short(receipt.batchId, 4)}
                  </text>
                </g>
              )
            })}
          </>
        )}
      </svg>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className={GRAPH_FULLSCREEN_BUTTON_CLASS}
        onClick={graphFullscreen.toggleFullscreen}
        disabled={!graphFullscreen.canFullscreen}
        aria-label={
          graphFullscreen.isFullscreen
            ? "Exit graph fullscreen"
            : "Open graph fullscreen"
        }
        title={graphFullscreen.isFullscreen ? "Exit fullscreen" : "Fullscreen"}
      >
        <FullscreenIcon data-icon="inline-start" aria-hidden="true" />
      </Button>
    </div>
  )
}

function StackGraphRows({ rows }: { rows: StackGraphRow[] }) {
  return (
    <>
      <text
        x={STACK_PROGRAM_X}
        y={GRAPH_LABEL_Y}
        className="fill-muted-foreground text-[10px]"
      >
        programs
      </text>
      <text
        x={STACK_ACCOUNT_X}
        y={GRAPH_LABEL_Y}
        className="fill-muted-foreground text-[10px]"
      >
        accounts
      </text>
      <text
        x={STACK_OPERATION_X}
        y={GRAPH_LABEL_Y}
        className="fill-muted-foreground text-[10px]"
      >
        operations
      </text>
      {rows.map((row, index) => {
        const y = STACK_TOP + index * STACK_ROW_GAP
        return (
          <g key={row.name}>
            <line
              x1={STACK_PROGRAM_X + STACK_PROGRAM_WIDTH}
              y1={y + STACK_NODE_HEIGHT / 2}
              x2={STACK_ACCOUNT_X}
              y2={y + STACK_NODE_HEIGHT / 2}
              className="stroke-border"
              strokeWidth={GRAPH_EDGE_WIDTH}
            />
            <line
              x1={STACK_ACCOUNT_X + STACK_ACCOUNT_WIDTH}
              y1={y + STACK_NODE_HEIGHT / 2}
              x2={STACK_OPERATION_X}
              y2={y + STACK_NODE_HEIGHT / 2}
              className="stroke-border"
              strokeWidth={GRAPH_EDGE_WIDTH}
            />
            <rect
              x={STACK_PROGRAM_X}
              y={y}
              width={STACK_PROGRAM_WIDTH}
              height={STACK_NODE_HEIGHT}
              rx={GRAPH_NODE_RADIUS}
              className="fill-background stroke-border"
            />
            <text
              x={STACK_PROGRAM_X + GRAPH_TEXT_OFFSET_X}
              y={y + STACK_TEXT_OFFSET_Y}
              className="fill-foreground font-mono text-[9px]"
            >
              {row.name}
            </text>
            <rect
              x={STACK_ACCOUNT_X}
              y={y}
              width={STACK_ACCOUNT_WIDTH}
              height={STACK_NODE_HEIGHT}
              rx={GRAPH_NODE_RADIUS}
              className="fill-background stroke-border"
            />
            <text
              x={STACK_ACCOUNT_X + GRAPH_TEXT_OFFSET_X}
              y={y + STACK_TEXT_OFFSET_Y}
              className="fill-muted-foreground font-mono text-[9px]"
            >
              {short(row.address, 5) || `${row.expectedRecords} records`}
            </text>
            <rect
              x={STACK_OPERATION_X}
              y={y}
              width={STACK_OPERATION_WIDTH}
              height={STACK_NODE_HEIGHT}
              rx={GRAPH_NODE_RADIUS}
              className="fill-background stroke-border"
            />
            <text
              x={STACK_OPERATION_X + GRAPH_TEXT_OFFSET_X}
              y={y + STACK_TEXT_OFFSET_Y}
              className="fill-foreground font-mono text-[9px]"
            >
              {row.operationCount} tx
            </text>
          </g>
        )
      })}
    </>
  )
}

function SurfpoolPanel({
  proof,
  liveAccounts,
  accountItems,
  liveSnapshot,
  fallbackRpcUrl,
  fallbackStudioUrl,
}: {
  proof?: CommitProofReference
  liveAccounts?: LiveSessionAccountSnapshot
  accountItems: Array<{ label: string; address: string; signature?: string }>
  liveSnapshot?: LiveSessionSnapshot
  fallbackRpcUrl: string
  fallbackStudioUrl: string
}) {
  const rpcUrl = liveAccounts?.rpcUrl || fallbackRpcUrl
  const studioUrl = liveAccounts?.studioUrl || fallbackStudioUrl

  if (!liveSnapshot) {
    return (
      <div className="grid gap-2.5">
        <MetricGrid
          items={[
            ["RPC", rpcUrl],
            ["Studio", studioUrl],
            ["Status", "waiting"],
            ["World", "not open"],
            ["Accounts", "not loaded"],
          ]}
        />
        <SurfpoolLinks rpcUrl={rpcUrl} studioUrl={studioUrl} />
        <ProgramCoverageCard fallbackPrograms={LIVE_PROGRAMS} />
        <EmptyState>
          Launch from onboarding to prepare the Surfpool session, world account,
          and agent accounts. Press Step or Play when you want actions to run.
        </EmptyState>
      </div>
    )
  }

  return (
    <div className="grid gap-2.5">
      <MetricGrid
        items={[
          ["RPC", rpcUrl],
          ["Studio", studioUrl],
          ["Session", short(liveSnapshot.sessionId, 4)],
          ["World", short(liveAccounts?.world.address, 5)],
          ["Status", liveWorldStatusLabel(liveAccounts?.world.status)],
          ["Accounts", accountItems.length],
          [
            "Agents ready",
            liveAccounts?.setup
              ? `${format(liveAccounts.setup.readyAgentCount)}/${format(
                  liveAccounts.setup.requestedAgentCount
                )}`
              : "checking",
          ],
          [
            "SOL stake",
            liveAccounts?.setup
              ? `${format(liveAccounts.setup.solStakeAccountCount)}/${format(
                  liveAccounts.setup.requestedAgentCount
                )}`
              : "checking",
          ],
          ["Proof file", proof ? short(proof.hash, 5) : "pending"],
        ]}
      />
      <SurfpoolLinks rpcUrl={rpcUrl} studioUrl={studioUrl} />
      {liveAccounts?.protocolEvidence && (
        <ProtocolEvidenceCard
          evidence={liveAccounts.protocolEvidence}
          rpcUrl={rpcUrl}
        />
      )}
      <ProgramCoverageCard
        programPlan={liveAccounts?.programPlan}
        fallbackPrograms={LIVE_PROGRAMS}
      />
      {proof && <ProofCard proof={proof} />}
      {liveSnapshot.committedActions.length > 0 && (
        <ScrollArea className="h-[220px] pr-2">
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {liveSnapshot.committedActions
              .slice()
              .reverse()
              .map((action) => (
                <LiveActionCard
                  key={action.signature}
                  action={action}
                  rpcUrl={rpcUrl}
                />
              ))}
          </div>
        </ScrollArea>
      )}
      <ScrollArea className="h-[320px] pr-2">
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {accountItems.map((item) => (
            <AddressCard
              key={`${item.label}-${item.address}`}
              item={item}
              rpcUrl={rpcUrl}
            />
          ))}
        </div>
      </ScrollArea>
    </div>
  )
}

function ProtocolEvidenceCard({
  evidence,
  rpcUrl,
}: {
  evidence: ProtocolEvidenceGraph
  rpcUrl: string
}) {
  return (
    <div className={PANEL_SURFACE_CLASS}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-xs font-normal">Protocol evidence graph</p>
          <p className="mt-1 text-xs text-muted-foreground">
            This is what the board can read from Trust Substrate records. Missing
            program evidence stays visible instead of being treated as proof.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary">
            {evidence.summary.presentPrograms}/{evidence.summary.totalPrograms}{" "}
            present
          </Badge>
          <Badge
            variant={
              evidence.summary.missingPrograms === 0 ? "outline" : "destructive"
            }
          >
            {evidence.summary.missingPrograms} missing
          </Badge>
          <Badge variant="outline">
            {evidence.summary.actionEnvelopes} envelopes
          </Badge>
        </div>
      </div>
      <MetricGrid
        items={[
          ["Graph", short(evidence.graphHash, 5)],
          ["Records", evidence.summary.records],
          ["Receipts", evidence.summary.receipts],
          ["Tx links", evidence.summary.transactions],
          ["Generated", evidence.generatedAt.slice(11, 19)],
          ["Schema", evidence.schemaVersion],
        ]}
      />
      <ScrollArea className="mt-3 h-[340px] pr-2">
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {evidence.programs.map((program) => (
            <ProtocolProgramEvidenceCard
              key={program.name}
              program={program}
              rpcUrl={rpcUrl}
            />
          ))}
        </div>
      </ScrollArea>
    </div>
  )
}

function ProtocolProgramEvidenceCard({
  program,
  rpcUrl,
}: {
  program: ProtocolProgramEvidence
  rpcUrl: string
}) {
  const visibleRecords = program.records.slice(0, 3)

  return (
    <div className="rounded-md border border-border/70 bg-background/30 p-2">
      <div className="flex items-center justify-between gap-2">
        <p className="truncate font-mono text-xs">{program.name}</p>
        <Badge
          variant={program.status === "present" ? "secondary" : "destructive"}
        >
          {program.status}
        </Badge>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {program.demoRole === "board-primary"
          ? "Board/world anchor"
          : "Supporting evidence"}
      </p>
      <p className="mt-2 text-xs text-muted-foreground">
        {program.demoSurface}
      </p>
      <div className="mt-2 grid gap-1">
        {visibleRecords.map((record, index) => (
          <ProtocolEvidenceRecordRow
            key={`${program.name}-${record.source}-${record.label}-${index}`}
            record={record}
            rpcUrl={rpcUrl}
          />
        ))}
        {program.records.length > visibleRecords.length && (
          <p className="font-mono text-[11px] text-muted-foreground">
            +{program.records.length - visibleRecords.length} more records
          </p>
        )}
        {program.missing.map((missing) => (
          <p key={missing} className="text-xs text-destructive">
            {missing}
          </p>
        ))}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Boundary: {program.boundary}
      </p>
      {program.expectedRecords > 0 && (
        <p className="mt-2 font-mono text-[11px] text-muted-foreground">
          expected records {program.expectedRecords}
        </p>
      )}
    </div>
  )
}

function ProtocolEvidenceRecordRow({
  record,
  rpcUrl,
}: {
  record: ProtocolEvidenceRecord
  rpcUrl: string
}) {
  const address = record.address
  const tx = record.txSignature || record.signature

  return (
    <div className="rounded border border-border/60 bg-background/25 p-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="truncate text-xs">{record.label}</p>
        <Badge variant="outline">{record.source}</Badge>
      </div>
      <div className="mt-1 grid gap-1 font-mono text-[11px] text-muted-foreground">
        {record.agentId && <p>agent {short(record.agentId, 5)}</p>}
        {record.receiptId && <p>receipt {short(record.receiptId, 5)}</p>}
        {address && <p>address {short(address, 5)}</p>}
        {tx && <p>tx {short(tx, 5)}</p>}
        {record.hash && <p>hash {short(record.hash, 5)}</p>}
        {record.slot !== undefined && <p>slot {record.slot}</p>}
        {record.note && <p>{record.note}</p>}
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {address && (
          <Button variant="secondary" size="sm" asChild>
            <a href={accountHref(address)} target="_blank" rel="noreferrer">
              Account
            </a>
          </Button>
        )}
        {address && (
          <Button variant="outline" size="sm" asChild>
            <a
              href={solanaExplorerHref({
                kind: "address",
                value: address,
                rpcUrl,
              })}
              target="_blank"
              rel="noreferrer"
            >
              Explorer
            </a>
          </Button>
        )}
        {tx && (
          <Button variant="secondary" size="sm" asChild>
            <a href={transactionHref(tx)} target="_blank" rel="noreferrer">
              Tx
            </a>
          </Button>
        )}
        {tx && (
          <Button variant="outline" size="sm" asChild>
            <a
              href={solanaExplorerHref({
                kind: "tx",
                value: tx,
                rpcUrl,
              })}
              target="_blank"
              rel="noreferrer"
            >
              Explorer tx
            </a>
          </Button>
        )}
      </div>
    </div>
  )
}

function ProgramCoverageCard({
  programPlan,
  fallbackPrograms,
}: {
  programPlan?: ProgramWiringPlan
  fallbackPrograms: ProgramNode[]
}) {
  const fallbackRoles = new Map(
    fallbackPrograms.map((program) => [program.name, program.role])
  )
  const programs =
    programPlan?.programs ??
    fallbackPrograms.map((program) => ({
      name: program.name,
      action: program.role,
      demoRole:
        program.name === "task_registry"
          ? ("board-primary" as const)
          : ("supporting-trust-program" as const),
      status: "wired" as const,
      expectedRecords: 0,
      demoSurface: "Loaded when the Surfpool session starts",
      evidence: "Session proof and account links appear after onboarding launch",
      boundary: "No chain state is created before an explicit user action",
    }))

  return (
    <div className={PANEL_SURFACE_CLASS}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-normal">Program coverage</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Task program is the board anchor. Supporting trust programs add
            identity, receipts, proofs, stake, reputation, attestation,
            delegation, and dispute evidence.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">{programs.length} programs</Badge>
          {programPlan && (
            <Badge variant="secondary">
              {programPlan.summary.emittedReceipts} receipts
            </Badge>
          )}
        </div>
      </div>
      <ScrollArea className="mt-3 h-[260px] pr-2">
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {programs.map((program) => (
            <div key={program.name} className="rounded-md border border-border/70 bg-background/30 p-2">
              <div className="flex items-center justify-between gap-2">
                <p className="truncate font-mono text-xs">{program.name}</p>
                <Badge
                  variant={
                    program.demoRole === "board-primary"
                      ? "secondary"
                      : "outline"
                  }
                >
                  {program.demoRole === "board-primary"
                    ? "board anchor"
                    : program.status}
                </Badge>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {program.demoSurface}
              </p>
              <p className="mt-2 text-xs">
                {fallbackRoles.get(program.name) ?? program.action}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                Evidence: {program.evidence}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Boundary: {program.boundary}
              </p>
              {program.expectedRecords > 0 && (
                <p className="mt-2 font-mono text-[11px] text-muted-foreground">
                  expected records {program.expectedRecords}
                </p>
              )}
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  )
}

function SurfpoolLinks({
  rpcUrl,
  studioUrl,
}: {
  rpcUrl: string
  studioUrl: string
}) {
  return (
    <div className={PANEL_SURFACE_CLASS}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-normal">Surfpool links</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {solanaExplorerSetupText(rpcUrl)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" asChild>
            <a href={studioUrl} target="_blank" rel="noreferrer">
              Studio
            </a>
          </Button>
          <Button variant="secondary" asChild>
            <a href={`${studioUrl}/accounts`} target="_blank" rel="noreferrer">
              Accounts
            </a>
          </Button>
          <Button variant="secondary" asChild>
            <a
              href={solanaExplorerClusterHref(rpcUrl)}
              target="_blank"
              rel="noreferrer"
            >
              Explorer
            </a>
          </Button>
          <Button variant="outline" asChild>
            <a href={rpcUrl} target="_blank" rel="noreferrer">
              RPC
            </a>
          </Button>
        </div>
      </div>
    </div>
  )
}

function LiveActionCard({
  action,
  rpcUrl,
}: {
  action: LiveCommittedAction
  rpcUrl: string
}) {
  return (
    <div className={PANEL_SURFACE_CLASS}>
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-xs font-normal">
          {action.action} {short(action.agentId, 4)}
        </p>
        <Badge variant="outline">slot {action.slot}</Badge>
      </div>
      <p className="mt-1 font-mono text-xs text-muted-foreground">
        tick {action.tick} - {short(action.eventId, 4)}
      </p>
      <p className="mt-2 font-mono text-xs break-all text-muted-foreground">
        {action.address}
      </p>
      {action.actionProof && (
        <div className="mt-2 grid gap-1 rounded-md border border-border/70 bg-background/30 p-2 font-mono text-[11px] text-muted-foreground">
          <p>root {short(action.actionProof.transcriptRoot, 6)}</p>
          <p>leaf {short(action.actionProof.leafHash, 6)}</p>
          <p>signed {short(action.actionProof.signature, 6)}</p>
          {action.actionProof.beforeStateHash && (
            <p>before {short(action.actionProof.beforeStateHash, 6)}</p>
          )}
          {action.actionProof.afterStateHash && (
            <p>after {short(action.actionProof.afterStateHash, 6)}</p>
          )}
          {action.actionProof.runtimeEvidence && (
            <p>pi {short(action.actionProof.runtimeEvidence.responseHash, 6)}</p>
          )}
          {action.actionProof.actionEnvelope && (
            <>
              <p>
                envelope tx{" "}
                {short(action.actionProof.actionEnvelope.txSignature, 6)}
              </p>
              <p>
                envelope receipt{" "}
                {short(action.actionProof.actionEnvelope.receiptAddress, 6)}
              </p>
            </>
          )}
          {action.actionProof.submitter && (
            <p>agent {short(action.actionProof.submitter, 6)}</p>
          )}
        </div>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="secondary" asChild>
          <a
            href={transactionHref(action.signature)}
            target="_blank"
            rel="noreferrer"
          >
            Raw tx
          </a>
        </Button>
        <Button variant="secondary" asChild>
          <a
            href={solanaExplorerHref({
              kind: "tx",
              value: action.signature,
              rpcUrl,
            })}
            target="_blank"
            rel="noreferrer"
          >
            Explorer tx
          </a>
        </Button>
        <CopyButton value={action.signature} />
      </div>
    </div>
  )
}

function ProofCard({ proof }: { proof: CommitProofReference }) {
  return (
    <div className={PANEL_SURFACE_CLASS}>
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-xs font-normal">
          Session proof file with action transcript root
        </p>
        <Badge variant="outline">{proof.status}</Badge>
      </div>
      <p className="mt-2 font-mono text-xs break-all text-muted-foreground">
        {proof.hash}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="secondary" asChild>
          <a href={proof.url} target="_blank" rel="noreferrer">
            Open file
          </a>
        </Button>
        <CopyButton value={proof.url} />
      </div>
    </div>
  )
}

function AddressCard({
  item,
  rpcUrl,
}: {
  item: { label: string; address: string; signature?: string }
  rpcUrl: string
}) {
  return (
    <div className={PANEL_SURFACE_CLASS}>
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-xs font-normal">{item.label}</p>
        <Badge variant="outline">account</Badge>
      </div>
      <p className="mt-2 font-mono text-xs break-all text-muted-foreground">
        {item.address}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="secondary" asChild>
          <a href={accountHref(item.address)} target="_blank" rel="noreferrer">
            Raw account
          </a>
        </Button>
        <Button variant="secondary" asChild>
          <a
            href={solanaExplorerHref({
              kind: "address",
              value: item.address,
              rpcUrl,
            })}
            target="_blank"
            rel="noreferrer"
          >
            Explorer
          </a>
        </Button>
        <CopyButton value={item.address} />
        {item.signature && (
          <Button variant="secondary" asChild>
            <a
              href={transactionHref(item.signature)}
              target="_blank"
              rel="noreferrer"
            >
              Raw tx
            </a>
          </Button>
        )}
        {item.signature && (
          <Button variant="outline" asChild>
            <a
              href={solanaExplorerHref({
                kind: "tx",
                value: item.signature,
                rpcUrl,
              })}
              target="_blank"
              rel="noreferrer"
            >
              Explorer tx
            </a>
          </Button>
        )}
      </div>
    </div>
  )
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = React.useState(false)
  return (
    <Button
      variant="secondary"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value)
          setCopied(true)
          window.setTimeout(() => setCopied(false), 1200)
        } catch {
          setCopied(false)
        }
      }}
    >
      {copied ? "Copied" : "Copy"}
    </Button>
  )
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <Empty className={EMPTY_STATE_CLASS}>
      <EmptyDescription>{children}</EmptyDescription>
    </Empty>
  )
}

export default App
