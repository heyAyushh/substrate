export type ReceiptKind =
  | "assignment"
  | "handoff"
  | "completion"
  | "dispute"
  | "dispute_resolved"
  | string;

export interface LocalReceiptRecord {
  receiptId: string;
  slot: number;
  taskId: string;
  actorId: string;
  kind: ReceiptKind;
  domain: string;
  payload: Record<string, unknown>;
  sequence?: number;
}

export interface IndexedReceipt extends LocalReceiptRecord {
  sequence: number;
  dedupeKey: string;
}

export interface HandoffStep {
  receiptId: string;
  slot: number;
  taskId: string;
  fromAgentId: string;
  toAgentId: string;
}

export interface TaskHistoryView {
  taskId: string;
  receipts: IndexedReceipt[];
  agents: string[];
  agentIds: string[];
  domains: string[];
}

export interface AgentHistoryView {
  agentId: string;
  receipts: IndexedReceipt[];
  taskIds: string[];
  domains: string[];
}

export interface DomainSummary {
  domain: string;
  receiptCount: number;
  taskIds: string[];
  agentIds: string[];
  handoffCount: number;
  latestSlot: number;
}

export interface ExecutionGraph {
  receipts: IndexedReceipt[];
  tasks: Record<string, TaskHistoryView>;
  agents: Record<string, AgentHistoryView>;
  handoffChainByTask: Record<string, HandoffStep[]>;
  domains: Record<string, DomainSummary>;
}

export interface TaskInheritanceView {
  taskId: string;
  rootAgentIds: string[];
  lineageByAgent: Record<string, string[]>;
  depthByAgent: Record<string, number>;
  completionLineageByReceipt: Record<string, string[]>;
}

export interface IngestResult {
  accepted: number;
  duplicates: number;
}

export interface AgentProfile {
  agentId: string;
  receiptCount: number;
  domains: Record<string, number>;
  kinds: Record<string, number>;
  modelUsage: Record<string, number>;
  toolUsage: Record<string, number>;
  handoffPartners: string[];
  firstSlot: number;
  latestSlot: number;
}

export interface LeaderboardEntry {
  agentId: string;
  score: number;
  receiptCount: number;
  domain?: string;
  attestations: number;
  tier: "bonded" | "tier0";
}

export interface IdentityStateView {
  identityId: string;
  tier: "bonded" | "tier0";
  openTaskCount: number;
  openChallengeCount: number;
  activeStake: boolean;
}

export interface AttesterRecordView {
  identityId: string;
  category: string;
  selfDeclaredTier: number;
  effectiveTier: number;
}

export interface LeaderboardQuery {
  domain?: string;
  since?: number;
  until?: number;
  attestedOnly?: boolean;
  currentSlot?: number;
  tier0?: boolean;
}

export interface TeamDefinition {
  teamId: string;
  memberIds: string[];
}

export interface TeamReputationView {
  teamId: string;
  memberIds: string[];
  overall: number;
  receiptCount: number;
  domains: Record<string, number>;
  byKind: Record<string, number>;
  attestations: number;
  internalHandoffs: number;
  inboundHandoffs: number;
  outboundHandoffs: number;
  inheritedTaskIds: string[];
  contributedTaskIds: string[];
}

export interface AgentAttestation {
  receiptId: string;
  slot: number;
  taskId: string;
  targetId: string;
  attesterId: string;
  attestationKind?: string;
  evidenceUri?: string;
  evidenceHash?: string;
}

export interface AuthorityRotationEvent {
  eventId: string;
  slot: number;
  agentId: string;
  previousAuthority: string;
  newAuthority: string;
  mode?: string;
  sequence?: number;
}

export interface AuthorityRotation {
  eventId: string;
  slot: number;
  agentId: string;
  previousAuthority: string;
  newAuthority: string;
  mode?: string;
  sequence?: number;
}

export interface ToolQualityStat {
  tool: string;
  attempts: number;
  completions: number;
  disputes: number;
  successRate: number;
}

export interface AgentTraceExportEdit {
  receiptId: string;
  seq: number;
  path: string;
  slot: number;
  actorId: string;
  beforeHash?: string;
  afterHash?: string;
  diff?: string;
}

export interface AgentTraceExportBundle {
  version: "0.1.0";
  traceId: string;
  taskId: string;
  agentIds: string[];
  edits: AgentTraceExportEdit[];
}

export interface ChallengeStatus {
  challengeReceiptId: string;
  actorId: string;
  taskId: string;
  domain: string;
  targetReceiptId: string;
  round: number;
  deadlineSlot?: number;
  answered: boolean;
  responseReceiptId?: string;
  expired: boolean;
}

export interface ChallengeRoundView {
  challengeReceiptId: string;
  actorId: string;
  taskId: string;
  domain: string;
  targetReceiptId: string;
  round: number;
  slot: number;
  deadlineSlot?: number;
  answered: boolean;
  responseReceiptId?: string;
  expired: boolean;
}

export interface CommitmentStatus {
  commitReceiptId: string;
  actorId: string;
  taskId: string;
  domain: string;
  commitHash: string;
  deadlineSlot?: number;
  revealed: boolean;
  revealReceiptId?: string;
  expired: boolean;
}

export interface StakeStateView {
  identityId: string;
  ownerId?: string;
  slashAuthorityId?: string;
  activeLamports: string;
  pendingUnstakeLamports: string;
  unstakeUnlocksAtSlot?: number;
  slashedLamports: string;
  slashReceiptIds: string[];
}
