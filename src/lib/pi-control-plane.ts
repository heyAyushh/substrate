import {
  createEmptyChatState,
  loadIdentityWorkspace,
  type PiIdentityProfile,
  type StoredChatState,
} from "./pi-identities.ts";

const CONTROL_PLANE_WORKSPACE_STORAGE_KEY =
  "trust-substrate-pi-console-control-plane-v1";
const CUSTOM_ROLE_ID = "custom";
const DEFAULT_OPERATOR_ROLE_ID = "operator";
const EXECUTOR_ROLE_ID = "executor";
const IDENTITY_SESSION_ROLE_ID = "identity";
const LEGACY_IDENTITY_WORKSPACE_STORAGE_KEY =
  "trust-substrate-pi-console-identities-v2";
const PLANNER_ROLE_ID = "planner";
const VERIFIER_ROLE_ID = "verifier";

export interface ControlPlaneAgentPreset {
  id:
    | typeof DEFAULT_OPERATOR_ROLE_ID
    | typeof PLANNER_ROLE_ID
    | typeof EXECUTOR_ROLE_ID
    | typeof VERIFIER_ROLE_ID;
  label: string;
  roleSummary: string;
  launchPrompt: string;
  defaultIdentityBinding: "none" | "preferred" | "first";
}

export interface ControlPlaneAgentRecord {
  id: string;
  label: string;
  roleId: string;
  roleLabel: string;
  roleSummary: string;
  identityId: string | null;
  launchPrompt: string | null;
  launchPromptSent: boolean;
  createdAt: number;
  launchedAtReceiptCount: number;
  chat: StoredChatState;
}

export interface ControlPlaneWorkspace {
  activeAgentId: string;
  order: string[];
  agents: Record<string, ControlPlaneAgentRecord>;
}

export interface LoadControlPlaneWorkspaceOptions {
  launchedAtReceiptCount?: number;
}

export interface LaunchPresetControlPlaneAgentOptions {
  launchedAtReceiptCount: number;
  preferredIdentityId?: string | null;
  now?: number;
}

export interface CreateCustomControlPlaneAgentInput {
  label: string;
  roleSummary: string;
  launchPrompt: string;
  identityId?: string | null;
  launchedAtReceiptCount: number;
  now?: number;
}

export const CONTROL_PLANE_PRESETS: ControlPlaneAgentPreset[] = [
  {
    id: DEFAULT_OPERATOR_ROLE_ID,
    label: "Operator",
    roleSummary:
      "Owns the overall run, synthesizes the live state, and decides which worker should act next.",
    launchPrompt:
      "Review the live task, receipts, and delegation chain. Summarize the current state and identify the highest-value next action.",
    defaultIdentityBinding: "none",
  },
  {
    id: PLANNER_ROLE_ID,
    label: "Planner",
    roleSummary:
      "Plans the next move from the live chain state and proposes the cleanest execution path.",
    launchPrompt:
      "Build a short action plan from the live task, receipts, and delegation chain. Call out blockers and the best next execution step.",
    defaultIdentityBinding: "none",
  },
  {
    id: EXECUTOR_ROLE_ID,
    label: "Executor",
    roleSummary:
      "Drives the next onchain move and watches for receipt changes after execution begins.",
    launchPrompt:
      "Take the current live state and identify the next transaction-ready action. Explain what should happen onchain and what receipt movement to watch for.",
    defaultIdentityBinding: "preferred",
  },
  {
    id: VERIFIER_ROLE_ID,
    label: "Verifier",
    roleSummary:
      "Monitors new receipts, delegation changes, and disputes for inconsistencies or risk.",
    launchPrompt:
      "Watch the live receipts and delegation chain. Flag anything inconsistent, risky, or worth escalating before the next transaction lands.",
    defaultIdentityBinding: "none",
  },
];

export function createControlPlaneWorkspace(
  _identities: PiIdentityProfile[],
  launchedAtReceiptCount = 0,
): ControlPlaneWorkspace {
  const operatorSession = createAgentRecord({
    roleId: DEFAULT_OPERATOR_ROLE_ID,
    roleLabel: "Operator",
    roleSummary: getPreset(DEFAULT_OPERATOR_ROLE_ID).roleSummary,
    label: "Operator",
    identityId: null,
    launchPrompt: getPreset(DEFAULT_OPERATOR_ROLE_ID).launchPrompt,
    launchPromptSent: false,
    launchedAtReceiptCount,
    now: Date.now(),
    chat: createEmptyChatState(),
  });

  return {
    activeAgentId: operatorSession.id,
    order: [operatorSession.id],
    agents: {
      [operatorSession.id]: operatorSession,
    },
  };
}

export function resetControlPlaneWorkspace(
  identities: PiIdentityProfile[],
  launchedAtReceiptCount = 0,
): ControlPlaneWorkspace {
  return createControlPlaneWorkspace(identities, launchedAtReceiptCount);
}

export function loadControlPlaneWorkspace(
  identities: PiIdentityProfile[],
  options: LoadControlPlaneWorkspaceOptions = {},
): ControlPlaneWorkspace {
  const launchedAtReceiptCount = options.launchedAtReceiptCount ?? 0;
  const fallbackWorkspace = createControlPlaneWorkspace(
    identities,
    launchedAtReceiptCount,
  );
  const storage = getBrowserStorage();
  if (!storage) {
    return fallbackWorkspace;
  }

  const storedWorkspace = parseStorage(
    storage,
    CONTROL_PLANE_WORKSPACE_STORAGE_KEY,
  );
  if (isControlPlaneWorkspace(storedWorkspace)) {
    return syncControlPlaneWorkspace(storedWorkspace, identities);
  }

  const legacyWorkspaceValue = parseStorage(
    storage,
    LEGACY_IDENTITY_WORKSPACE_STORAGE_KEY,
  );
  if (legacyWorkspaceValue) {
    return migrateLegacyIdentityWorkspace(
      identities,
      launchedAtReceiptCount,
      legacyWorkspaceValue,
    );
  }

  return fallbackWorkspace;
}

export function persistControlPlaneWorkspace(workspace: ControlPlaneWorkspace) {
  const storage = getBrowserStorage();
  if (!storage) {
    return;
  }

  try {
    storage.setItem(
      CONTROL_PLANE_WORKSPACE_STORAGE_KEY,
      JSON.stringify(workspace),
    );
  } catch {
    clearStorageKey(storage, CONTROL_PLANE_WORKSPACE_STORAGE_KEY);
  }
}

export function syncControlPlaneWorkspace(
  workspace: ControlPlaneWorkspace,
  identities: PiIdentityProfile[],
): ControlPlaneWorkspace {
  const knownIdentityIds = new Set(identities.map((identity) => identity.id));
  const nextAgents: Record<string, ControlPlaneAgentRecord> = {};
  const nextOrder = workspace.order.filter((agentId) => {
    const existingAgent = workspace.agents[agentId];
    if (!existingAgent) {
      return false;
    }

    nextAgents[agentId] = {
      ...existingAgent,
      launchPromptSent: readLaunchPromptSent(existingAgent),
      identityId:
        existingAgent.identityId &&
        knownIdentityIds.has(existingAgent.identityId)
          ? existingAgent.identityId
          : null,
      chat: sanitizeChatState(existingAgent.chat),
    };

    return true;
  });

  if (nextOrder.length === 0) {
    return createControlPlaneWorkspace(identities);
  }

  const activeAgentId = nextOrder.includes(workspace.activeAgentId)
    ? workspace.activeAgentId
    : nextOrder[0];

  return {
    activeAgentId,
    order: nextOrder,
    agents: nextAgents,
  };
}

export function launchPresetControlPlaneAgent(
  workspace: ControlPlaneWorkspace,
  presetId: ControlPlaneAgentPreset["id"],
  identities: PiIdentityProfile[],
  options: LaunchPresetControlPlaneAgentOptions,
): ControlPlaneWorkspace {
  const preset = getPreset(presetId);
  const identityId = resolveIdentityBinding(
    preset.defaultIdentityBinding,
    identities,
    options.preferredIdentityId,
  );
  const label = buildPresetLabel(preset.label, identityId, identities);
  const session = createAgentRecord({
    roleId: preset.id,
    roleLabel: preset.label,
    roleSummary: preset.roleSummary,
    label,
    identityId,
    launchPrompt: preset.launchPrompt,
    launchPromptSent: false,
    launchedAtReceiptCount: options.launchedAtReceiptCount,
    now: options.now ?? Date.now(),
    chat: createEmptyChatState(),
  });

  return {
    activeAgentId: session.id,
    order: [...workspace.order, session.id],
    agents: {
      ...workspace.agents,
      [session.id]: session,
    },
  };
}

export function launchCustomControlPlaneAgent(
  workspace: ControlPlaneWorkspace,
  input: CreateCustomControlPlaneAgentInput,
): ControlPlaneWorkspace {
  const session = createAgentRecord({
    roleId: CUSTOM_ROLE_ID,
    roleLabel: "Custom",
    roleSummary: input.roleSummary.trim(),
    label: input.label.trim(),
    identityId: input.identityId?.trim() ? input.identityId : null,
    launchPrompt: input.launchPrompt.trim(),
    launchPromptSent: false,
    launchedAtReceiptCount: input.launchedAtReceiptCount,
    now: input.now ?? Date.now(),
    chat: createEmptyChatState(),
  });

  return {
    activeAgentId: session.id,
    order: [...workspace.order, session.id],
    agents: {
      ...workspace.agents,
      [session.id]: session,
    },
  };
}

export function setActiveControlPlaneAgent(
  workspace: ControlPlaneWorkspace,
  agentId: string,
): ControlPlaneWorkspace {
  if (!workspace.agents[agentId]) {
    return workspace;
  }

  return {
    ...workspace,
    activeAgentId: agentId,
  };
}

export function removeControlPlaneAgent(
  workspace: ControlPlaneWorkspace,
  agentId: string,
  identities: PiIdentityProfile[],
): ControlPlaneWorkspace {
  if (!workspace.agents[agentId]) {
    return workspace;
  }

  const nextOrder = workspace.order.filter(
    (currentId) => currentId !== agentId,
  );
  if (nextOrder.length === 0) {
    return createControlPlaneWorkspace(identities);
  }

  const nextAgents = { ...workspace.agents };
  delete nextAgents[agentId];

  return {
    activeAgentId:
      workspace.activeAgentId === agentId
        ? nextOrder[0]
        : workspace.activeAgentId,
    order: nextOrder,
    agents: nextAgents,
  };
}

export function updateControlPlaneAgentChatState(
  workspace: ControlPlaneWorkspace,
  agentId: string,
  chat: StoredChatState,
): ControlPlaneWorkspace {
  const agent = workspace.agents[agentId];
  if (!agent) {
    return workspace;
  }

  return {
    ...workspace,
    agents: {
      ...workspace.agents,
      [agentId]: {
        ...agent,
        chat: sanitizeChatState(chat),
      },
    },
  };
}

export function markControlPlaneAgentLaunchPromptSent(
  workspace: ControlPlaneWorkspace,
  agentId: string,
): ControlPlaneWorkspace {
  const agent = workspace.agents[agentId];
  if (!agent || agent.launchPromptSent) {
    return workspace;
  }

  return {
    ...workspace,
    agents: {
      ...workspace.agents,
      [agentId]: {
        ...agent,
        launchPromptSent: true,
      },
    },
  };
}

function migrateLegacyIdentityWorkspace(
  identities: PiIdentityProfile[],
  launchedAtReceiptCount: number,
  legacyWorkspaceValue: unknown,
): ControlPlaneWorkspace {
  if (!isBrowserLegacyIdentityWorkspace(legacyWorkspaceValue)) {
    const fallbackWorkspace = loadIdentityWorkspace(identities);
    return migrateLoadedIdentityWorkspace(
      fallbackWorkspace,
      identities,
      launchedAtReceiptCount,
    );
  }

  return migrateLoadedIdentityWorkspace(
    legacyWorkspaceValue,
    identities,
    launchedAtReceiptCount,
  );
}

function migrateLoadedIdentityWorkspace(
  legacyWorkspace: {
    activeIdentityId: string;
    chats: Record<string, StoredChatState>;
  },
  identities: PiIdentityProfile[],
  launchedAtReceiptCount: number,
): ControlPlaneWorkspace {
  const populatedEntries = Object.entries(legacyWorkspace.chats).filter(
    ([, chat]) => Array.isArray(chat.messages) && chat.messages.length > 0,
  );

  const identityId =
    legacyWorkspace.activeIdentityId ||
    populatedEntries[0]?.[0] ||
    identities[0]?.id ||
    null;

  if (!identityId) {
    return createControlPlaneWorkspace(identities, launchedAtReceiptCount);
  }

  const activeIdentity = identities.find(
    (candidate) => candidate.id === identityId,
  );
  const activeChat =
    legacyWorkspace.chats[identityId] ??
    populatedEntries[0]?.[1] ??
    createEmptyChatState();
  const session = createAgentRecord({
    roleId: IDENTITY_SESSION_ROLE_ID,
    roleLabel: "Identity",
    roleSummary:
      activeIdentity?.roleSummary ??
      "Migrated from the previous Pi identity workspace.",
    label: activeIdentity?.label ?? "Migrated agent",
    identityId,
    launchPrompt: null,
    launchPromptSent: true,
    launchedAtReceiptCount,
    now: Date.now(),
    chat: sanitizeChatState(activeChat),
  });

  return {
    activeAgentId: session.id,
    order: [session.id],
    agents: {
      [session.id]: session,
    },
  };
}

function resolveIdentityBinding(
  binding: ControlPlaneAgentPreset["defaultIdentityBinding"],
  identities: PiIdentityProfile[],
  preferredIdentityId?: string | null,
) {
  if (binding === "none") {
    return null;
  }

  if (binding === "preferred" && preferredIdentityId) {
    return identities.some((identity) => identity.id === preferredIdentityId)
      ? preferredIdentityId
      : (identities[0]?.id ?? null);
  }

  return identities[0]?.id ?? null;
}

function buildPresetLabel(
  baseLabel: string,
  identityId: string | null,
  identities: PiIdentityProfile[],
) {
  if (!identityId) {
    return baseLabel;
  }

  const identity = identities.find((candidate) => candidate.id === identityId);
  return identity ? `${identity.label} ${baseLabel}` : baseLabel;
}

function createAgentRecord(input: {
  roleId: string;
  roleLabel: string;
  roleSummary: string;
  label: string;
  identityId: string | null;
  launchPrompt: string | null;
  launchPromptSent: boolean;
  launchedAtReceiptCount: number;
  now: number;
  chat: StoredChatState;
}): ControlPlaneAgentRecord {
  const normalizedLabel = input.label.trim();

  return {
    id: createSessionId(input.roleId, input.now),
    label: normalizedLabel.length > 0 ? normalizedLabel : input.roleLabel,
    roleId: input.roleId,
    roleLabel: input.roleLabel,
    roleSummary: input.roleSummary.trim(),
    identityId: input.identityId,
    launchPrompt: input.launchPrompt?.trim() ? input.launchPrompt.trim() : null,
    launchPromptSent: input.launchPromptSent,
    createdAt: input.now,
    launchedAtReceiptCount: input.launchedAtReceiptCount,
    chat: sanitizeChatState(input.chat),
  };
}

function createSessionId(roleId: string, now: number) {
  return `${roleId}-${now}-${Math.random().toString(36).slice(2, 8)}`;
}

function getPreset(presetId: ControlPlaneAgentPreset["id"]) {
  const preset = CONTROL_PLANE_PRESETS.find(
    (candidate) => candidate.id === presetId,
  );
  if (!preset) {
    throw new Error(`Unknown control plane preset: ${presetId}`);
  }

  return preset;
}

function sanitizeChatState(chat: StoredChatState): StoredChatState {
  return {
    messages: Array.isArray(chat.messages) ? [...chat.messages] : [],
    preferredModel: chat.preferredModel ?? null,
    thinkingLevel: chat.thinkingLevel ?? "off",
  };
}

function readLaunchPromptSent(agent: ControlPlaneAgentRecord) {
  const legacyAgent = agent as ControlPlaneAgentRecord & {
    hasAutoStarted?: unknown;
  };
  return (
    agent.launchPromptSent === true ||
    legacyAgent.hasAutoStarted === true ||
    agent.chat.messages.length > 0
  );
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

function parseStorage(storage: Storage, key: string): unknown {
  try {
    const rawValue = storage.getItem(key);
    return rawValue ? (JSON.parse(rawValue) as unknown) : null;
  } catch {
    return null;
  }
}

function clearStorageKey(storage: Storage, key: string) {
  try {
    storage.removeItem(key);
  } catch {
    // Ignore storage cleanup failures.
  }
}

function isControlPlaneWorkspace(
  value: unknown,
): value is ControlPlaneWorkspace {
  if (!value || typeof value !== "object") {
    return false;
  }

  const workspace = value as Partial<ControlPlaneWorkspace>;
  return (
    typeof workspace.activeAgentId === "string" &&
    Array.isArray(workspace.order) &&
    workspace.agents !== null &&
    typeof workspace.agents === "object"
  );
}

function isBrowserLegacyIdentityWorkspace(value: unknown): value is {
  activeIdentityId: string;
  chats: Record<string, StoredChatState>;
} {
  if (!value || typeof value !== "object") {
    return false;
  }

  const workspace = value as {
    activeIdentityId?: unknown;
    chats?: unknown;
  };

  return (
    typeof workspace.activeIdentityId === "string" &&
    workspace.chats !== null &&
    typeof workspace.chats === "object"
  );
}
