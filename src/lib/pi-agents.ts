import type { AgentMessage, ThinkingLevel } from "@mariozechner/pi-agent-core";

import type { PiModelPreference } from "@/lib/pi-chat";

const LEGACY_CHAT_STORAGE_KEY = "trust-substrate-pi-console-chat-v2";
const AGENT_WORKSPACE_STORAGE_KEY = "trust-substrate-pi-console-agents-v1";
const DEFAULT_AGENT_NAME = "Pi";
const DEFAULT_THINKING_LEVEL: ThinkingLevel = "off";

export interface StoredChatState {
  messages: AgentMessage[];
  preferredModel: PiModelPreference | null;
  thinkingLevel: ThinkingLevel;
}

export interface StoredAgentRecord {
  id: string;
  name: string;
  instructions: string;
  createdAt: number;
  state: StoredChatState;
}

export interface StoredAgentWorkspace {
  activeAgentId: string;
  agents: StoredAgentRecord[];
}

export function createEmptyChatState(): StoredChatState {
  return {
    messages: [],
    preferredModel: null,
    thinkingLevel: DEFAULT_THINKING_LEVEL,
  };
}

export function createAgentRecord(input: {
  name?: string;
  instructions?: string;
} = {}): StoredAgentRecord {
  return {
    id: createAgentId(),
    name: normalizeAgentName(input.name),
    instructions: normalizeInstructions(input.instructions),
    createdAt: Date.now(),
    state: createEmptyChatState(),
  };
}

export function createDefaultAgentWorkspace(): StoredAgentWorkspace {
  const agent = createAgentRecord({
    name: DEFAULT_AGENT_NAME,
  });
  return {
    activeAgentId: agent.id,
    agents: [agent],
  };
}

export function getActiveAgentRecord(
  workspace: StoredAgentWorkspace,
): StoredAgentRecord {
  return (
    workspace.agents.find((agent) => agent.id === workspace.activeAgentId) ??
    workspace.agents[0]
  );
}

export function loadAgentWorkspace(): StoredAgentWorkspace {
  if (typeof window === "undefined") {
    return createDefaultAgentWorkspace();
  }

  try {
    const rawValue = window.localStorage.getItem(AGENT_WORKSPACE_STORAGE_KEY);
    if (rawValue) {
      const parsedValue = JSON.parse(rawValue) as unknown;
      if (isStoredAgentWorkspace(parsedValue)) {
        return normalizeAgentWorkspace(parsedValue);
      }
    }
  } catch {
    window.localStorage.removeItem(AGENT_WORKSPACE_STORAGE_KEY);
  }

  const legacyState = loadLegacyChatState();
  if (legacyState) {
    const migratedAgent = createAgentRecord({
      name: DEFAULT_AGENT_NAME,
    });
    migratedAgent.state = legacyState;
    return {
      activeAgentId: migratedAgent.id,
      agents: [migratedAgent],
    };
  }

  return createDefaultAgentWorkspace();
}

export function persistAgentWorkspace(workspace: StoredAgentWorkspace) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(
      AGENT_WORKSPACE_STORAGE_KEY,
      JSON.stringify(workspace),
    );
  } catch {
    window.localStorage.removeItem(AGENT_WORKSPACE_STORAGE_KEY);
  }
}

export function setActiveAgent(
  workspace: StoredAgentWorkspace,
  agentId: string,
): StoredAgentWorkspace {
  if (!workspace.agents.some((agent) => agent.id === agentId)) {
    return workspace;
  }

  return {
    ...workspace,
    activeAgentId: agentId,
  };
}

export function appendAgent(
  workspace: StoredAgentWorkspace,
  agent: StoredAgentRecord,
): StoredAgentWorkspace {
  return {
    activeAgentId: agent.id,
    agents: [...workspace.agents, agent],
  };
}

export function updateAgentChatState(
  workspace: StoredAgentWorkspace,
  agentId: string,
  state: StoredChatState,
): StoredAgentWorkspace {
  return {
    ...workspace,
    agents: workspace.agents.map((agent) =>
      agent.id === agentId ? { ...agent, state } : agent,
    ),
  };
}

function normalizeAgentWorkspace(
  workspace: StoredAgentWorkspace,
): StoredAgentWorkspace {
  const agents = workspace.agents.filter(isStoredAgentRecord);
  if (agents.length === 0) {
    return createDefaultAgentWorkspace();
  }

  const activeAgentId = agents.some((agent) => agent.id === workspace.activeAgentId)
    ? workspace.activeAgentId
    : agents[0].id;

  return {
    activeAgentId,
    agents,
  };
}

function loadLegacyChatState(): StoredChatState | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const rawValue = window.localStorage.getItem(LEGACY_CHAT_STORAGE_KEY);
    if (!rawValue) {
      return null;
    }

    const parsedValue = JSON.parse(rawValue) as Partial<StoredChatState>;
    return {
      messages: Array.isArray(parsedValue.messages)
        ? (parsedValue.messages as AgentMessage[])
        : [],
      preferredModel: isModelPreference(parsedValue.preferredModel)
        ? parsedValue.preferredModel
        : null,
      thinkingLevel: isThinkingLevel(parsedValue.thinkingLevel)
        ? parsedValue.thinkingLevel
        : DEFAULT_THINKING_LEVEL,
    };
  } catch {
    window.localStorage.removeItem(LEGACY_CHAT_STORAGE_KEY);
    return null;
  }
}

function isStoredAgentWorkspace(
  value: unknown,
): value is StoredAgentWorkspace {
  if (!value || typeof value !== "object") {
    return false;
  }

  const workspace = value as Partial<StoredAgentWorkspace>;
  return (
    typeof workspace.activeAgentId === "string" &&
    Array.isArray(workspace.agents)
  );
}

function isStoredAgentRecord(value: unknown): value is StoredAgentRecord {
  if (!value || typeof value !== "object") {
    return false;
  }

  const agent = value as Partial<StoredAgentRecord>;
  return (
    typeof agent.id === "string" &&
    typeof agent.name === "string" &&
    typeof agent.instructions === "string" &&
    typeof agent.createdAt === "number" &&
    isStoredChatState(agent.state)
  );
}

function isStoredChatState(value: unknown): value is StoredChatState {
  if (!value || typeof value !== "object") {
    return false;
  }

  const state = value as Partial<StoredChatState>;
  return (
    Array.isArray(state.messages) &&
    (state.preferredModel === null ||
      state.preferredModel === undefined ||
      isModelPreference(state.preferredModel)) &&
    isThinkingLevel(state.thinkingLevel)
  );
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

function normalizeAgentName(value: string | undefined): string {
  const trimmedValue = value?.trim();
  return trimmedValue && trimmedValue.length > 0
    ? trimmedValue.slice(0, 48)
    : DEFAULT_AGENT_NAME;
}

function normalizeInstructions(value: string | undefined): string {
  return value?.trim().slice(0, 600) ?? "";
}

function createAgentId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `agent-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}
