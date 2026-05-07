export type LocalProviderId = "openai-codex" | "anthropic";
export type LocalRuntimeActivitySource = "shell" | "mcp" | "runtime";

export interface RuntimeCapability {
  available: boolean;
  label: string;
  defaultModelId: string;
  command?: string;
}

export interface LocalMcpServer {
  name: string;
  transport: "command" | "url";
  target: string;
  status: string;
  auth: string;
}

export interface LocalRuntimeConfig {
  codex: RuntimeCapability;
  claude: RuntimeCapability;
  defaultProvider: LocalProviderId | null;
  mcpServers: LocalMcpServer[];
}

export interface LocalChatResponse {
  provider: LocalProviderId;
  text: string;
}

export interface LocalChatStreamEvent {
  type: "assistant_text" | "activity_start" | "activity_end" | "done" | "error";
  sessionId?: string;
  provider?: LocalProviderId;
  id?: string;
  label?: string;
  source?: LocalRuntimeActivitySource;
  server?: string;
  tool?: string;
  detail?: string;
  output?: string;
  isError?: boolean;
  text?: string;
  message?: string;
}

export interface LocalChatRequestMessage {
  role: "user" | "assistant";
  content: string;
}

export interface LocalRuntimeOption {
  provider: LocalProviderId;
  label: string;
  defaultModelId: string;
}

export interface LocalRuntimeActivity {
  sessionId?: string;
  provider: LocalProviderId;
  phase: "start" | "end";
  id: string;
  label: string;
  source: LocalRuntimeActivitySource;
  server?: string;
  tool?: string;
  detail?: string;
  output?: string;
  isError?: boolean;
}

export interface LocalChatRequestPayload {
  activitySessionId?: string;
  provider: string;
  modelId: string;
  systemPrompt?: string;
  messages?: Array<{
    role: string;
    content?: unknown;
    toolName?: string;
  }>;
}
