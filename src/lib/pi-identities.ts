import type { AgentMessage, ThinkingLevel } from "@mariozechner/pi-agent-core";

import type { PiModelPreference } from "@/lib/pi-chat";

const LEGACY_CHAT_STORAGE_KEY = "trust-substrate-pi-console-chat-v2";
const LEGACY_AGENT_WORKSPACE_STORAGE_KEY =
  "trust-substrate-pi-console-agents-v1";
const IDENTITY_WORKSPACE_STORAGE_KEY =
  "trust-substrate-pi-console-identities-v2";
const DEFAULT_THINKING_LEVEL: ThinkingLevel = "off";

export interface PiIdentityProfile {
  id: string;
  slug: string;
  label: string;
  roleSummary: string;
  promptHint: string;
  receiptCount: number;
  latestReceiptKind: string | null;
  score: number | null;
  delegatedFromLabels: string[];
  delegatedToLabels: string[];
}

export interface StoredChatState {
  messages: AgentMessage[];
  preferredModel: PiModelPreference | null;
  thinkingLevel: ThinkingLevel;
}

export interface StoredIdentityWorkspace {
  activeIdentityId: string;
  chats: Record<string, StoredChatState>;
}

interface LegacyAgentWorkspace {
  activeAgentId: string;
  agents: Array<{
    id: string;
    name: string;
    state: StoredChatState;
  }>;
}

export function createEmptyChatState(): StoredChatState {
  return {
    messages: [],
    preferredModel: null,
    thinkingLevel: DEFAULT_THINKING_LEVEL,
  };
}

export function createFallbackIdentityProfile(
  taskLabel?: string | null,
): PiIdentityProfile {
  return {
    id: "pi-console",
    slug: "pi",
    label: "Pi Agent",
    roleSummary:
      "Live Surfpool identities will appear here when the snapshot is ready.",
    promptHint: taskLabel
      ? `Ask about ${taskLabel} while the live identity list loads.`
      : "Ask about the current task while the live identity list loads.",
    receiptCount: 0,
    latestReceiptKind: null,
    score: null,
    delegatedFromLabels: [],
    delegatedToLabels: [],
  };
}

export function createIdentityWorkspace(
  identities: PiIdentityProfile[],
): StoredIdentityWorkspace {
  const activeIdentityId = identities[0]?.id ?? "pi-console";
  return {
    activeIdentityId,
    chats: createChatMap(identities),
  };
}

export function loadIdentityWorkspace(
  identities: PiIdentityProfile[],
): StoredIdentityWorkspace {
  const baseWorkspace = createIdentityWorkspace(identities);
  if (typeof window === "undefined") {
    return baseWorkspace;
  }

  const storedWorkspace = parseStorage<StoredIdentityWorkspace>(
    IDENTITY_WORKSPACE_STORAGE_KEY,
  );
  if (storedWorkspace && isStoredIdentityWorkspace(storedWorkspace)) {
    return syncIdentityWorkspace(storedWorkspace, identities);
  }

  const legacyWorkspace = loadLegacyAgentWorkspace();
  if (legacyWorkspace) {
    return migrateLegacyAgentWorkspace(legacyWorkspace, identities);
  }

  const legacyChatState = loadLegacyChatState();
  if (legacyChatState) {
    baseWorkspace.chats[baseWorkspace.activeIdentityId] = legacyChatState;
  }

  return baseWorkspace;
}

export function syncIdentityWorkspace(
  workspace: StoredIdentityWorkspace,
  identities: PiIdentityProfile[],
): StoredIdentityWorkspace {
  if (identities.length === 0) {
    return workspace;
  }

  const chats = createChatMap(identities);
  for (const identity of identities) {
    const currentState = workspace.chats[identity.id];
    if (currentState) {
      chats[identity.id] = sanitizeChatState(currentState);
    }
  }

  const nextActiveIdentityId = identities.some(
    (identity) => identity.id === workspace.activeIdentityId,
  )
    ? workspace.activeIdentityId
    : identities[0].id;

  const nextWorkspace: StoredIdentityWorkspace = {
    activeIdentityId: nextActiveIdentityId,
    chats,
  };

  const orphanState = findOrphanedChatState(workspace, identities);
  if (
    orphanState &&
    nextWorkspace.activeIdentityId &&
    nextWorkspace.chats[nextWorkspace.activeIdentityId].messages.length === 0
  ) {
    nextWorkspace.chats[nextWorkspace.activeIdentityId] = orphanState;
  }

  return nextWorkspace;
}

export function persistIdentityWorkspace(workspace: StoredIdentityWorkspace) {
  const storage = getBrowserStorage();
  if (!storage) {
    return;
  }

  try {
    storage.setItem(IDENTITY_WORKSPACE_STORAGE_KEY, JSON.stringify(workspace));
  } catch {
    clearStorageKey(storage, IDENTITY_WORKSPACE_STORAGE_KEY);
  }
}

export function setActiveIdentity(
  workspace: StoredIdentityWorkspace,
  identityId: string,
): StoredIdentityWorkspace {
  if (!workspace.chats[identityId]) {
    return workspace;
  }

  return {
    ...workspace,
    activeIdentityId: identityId,
  };
}

export function updateIdentityChatState(
  workspace: StoredIdentityWorkspace,
  identityId: string,
  state: StoredChatState,
): StoredIdentityWorkspace {
  return {
    ...workspace,
    chats: {
      ...workspace.chats,
      [identityId]: sanitizeChatState(state),
    },
  };
}

function createChatMap(identities: PiIdentityProfile[]) {
  return Object.fromEntries(
    identities.map((identity) => [identity.id, createEmptyChatState()]),
  ) as Record<string, StoredChatState>;
}

function migrateLegacyAgentWorkspace(
  legacyWorkspace: LegacyAgentWorkspace,
  identities: PiIdentityProfile[],
): StoredIdentityWorkspace {
  const nextWorkspace = createIdentityWorkspace(identities);
  let migratedActiveIdentityId: string | null = null;

  for (const agent of legacyWorkspace.agents) {
    const matchedIdentity = matchLegacyAgent(agent.name, identities);
    if (!matchedIdentity) {
      continue;
    }

    nextWorkspace.chats[matchedIdentity.id] = sanitizeChatState(agent.state);
    if (agent.id === legacyWorkspace.activeAgentId) {
      migratedActiveIdentityId = matchedIdentity.id;
    }
  }

  if (migratedActiveIdentityId) {
    nextWorkspace.activeIdentityId = migratedActiveIdentityId;
    return nextWorkspace;
  }

  const fallbackAgent =
    legacyWorkspace.agents.find(
      (agent) => agent.id === legacyWorkspace.activeAgentId,
    ) ?? legacyWorkspace.agents[0];
  if (fallbackAgent) {
    nextWorkspace.chats[nextWorkspace.activeIdentityId] = sanitizeChatState(
      fallbackAgent.state,
    );
  }

  return nextWorkspace;
}

function matchLegacyAgent(
  agentName: string,
  identities: PiIdentityProfile[],
): PiIdentityProfile | null {
  const normalizedAgentName = normalizeKey(agentName);
  if (!normalizedAgentName) {
    return null;
  }

  return (
    identities.find((identity) => {
      const normalizedLabel = normalizeKey(identity.label);
      const normalizedSlug = normalizeKey(identity.slug);
      return (
        normalizedLabel === normalizedAgentName ||
        normalizedSlug === normalizedAgentName ||
        normalizedLabel.includes(normalizedAgentName) ||
        normalizedAgentName.includes(normalizedSlug)
      );
    }) ?? null
  );
}

function findOrphanedChatState(
  workspace: StoredIdentityWorkspace,
  identities: PiIdentityProfile[],
): StoredChatState | null {
  const knownIds = new Set(identities.map((identity) => identity.id));
  for (const [identityId, state] of Object.entries(workspace.chats)) {
    if (!knownIds.has(identityId) && state.messages.length > 0) {
      return sanitizeChatState(state);
    }
  }

  return null;
}

function loadLegacyAgentWorkspace(): LegacyAgentWorkspace | null {
  const storedWorkspace = parseStorage<LegacyAgentWorkspace>(
    LEGACY_AGENT_WORKSPACE_STORAGE_KEY,
  );
  if (!storedWorkspace) {
    return null;
  }

  if (
    typeof storedWorkspace.activeAgentId !== "string" ||
    !Array.isArray(storedWorkspace.agents)
  ) {
    return null;
  }

  return {
    activeAgentId: storedWorkspace.activeAgentId,
    agents: storedWorkspace.agents
      .filter(
        (agent) =>
          agent &&
          typeof agent.id === "string" &&
          typeof agent.name === "string" &&
          agent.state,
      )
      .map((agent) => ({
        id: agent.id,
        name: agent.name,
        state: sanitizeChatState(agent.state),
      })),
  };
}

function loadLegacyChatState(): StoredChatState | null {
  const storedState = parseStorage<StoredChatState>(LEGACY_CHAT_STORAGE_KEY);
  if (!storedState) {
    return null;
  }

  return sanitizeChatState(storedState);
}

function parseStorage<T>(key: string): T | null {
  const storage = getBrowserStorage();
  if (!storage) {
    return null;
  }

  try {
    const rawValue = storage.getItem(key);
    if (!rawValue) {
      return null;
    }

    return JSON.parse(rawValue) as T;
  } catch {
    clearStorageKey(storage, key);
    return null;
  }
}

function getBrowserStorage(): Storage | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function clearStorageKey(storage: Storage, key: string) {
  try {
    storage.removeItem(key);
  } catch {
    // Ignore blocked or unavailable browser storage.
  }
}

function isStoredIdentityWorkspace(
  value: unknown,
): value is StoredIdentityWorkspace {
  if (!value || typeof value !== "object") {
    return false;
  }

  const workspace = value as Partial<StoredIdentityWorkspace>;
  return (
    typeof workspace.activeIdentityId === "string" &&
    workspace.chats !== null &&
    typeof workspace.chats === "object"
  );
}

function sanitizeChatState(value: Partial<StoredChatState> | StoredChatState) {
  return {
    messages: Array.isArray(value.messages)
      ? (value.messages as AgentMessage[])
      : [],
    preferredModel: isModelPreference(value.preferredModel)
      ? value.preferredModel
      : null,
    thinkingLevel: isThinkingLevel(value.thinkingLevel)
      ? value.thinkingLevel
      : DEFAULT_THINKING_LEVEL,
  } satisfies StoredChatState;
}

function isModelPreference(value: unknown): value is PiModelPreference {
  if (!value || typeof value !== "object") {
    return false;
  }

  const model = value as Partial<PiModelPreference>;
  return (
    typeof model.provider === "string" && typeof model.modelId === "string"
  );
}

function isThinkingLevel(value: unknown): value is ThinkingLevel {
  return (
    value === "off" ||
    value === "minimal" ||
    value === "low" ||
    value === "medium" ||
    value === "high" ||
    value === "xhigh"
  );
}

function normalizeKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+agent$/, "");
}
