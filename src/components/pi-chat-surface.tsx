import { useEffect, useMemo, useRef, useState } from "react";
import type { AgentMessage, ThinkingLevel } from "@mariozechner/pi-agent-core";
import { supportsXhigh } from "@mariozechner/pi-ai";
import {
  ApiKeyPromptDialog,
  ModelSelector,
  getAppStorage,
} from "@mariozechner/pi-web-ui";
import {
  Bot,
  Loader2,
  Send,
  Square,
  Trash2,
  Wrench,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  createPiConsoleAgent,
  type PiModelPreference,
} from "@/lib/pi-chat";
import {
  subscribeToLocalRuntimeActivity,
  type LocalRuntimeActivity,
  type LocalRuntimeConfig,
} from "@/lib/local-runtime";

const CHAT_STORAGE_KEY = "trust-substrate-pi-console-chat-v2";
const BASE_SYSTEM_PROMPT = [
  "You are Pi inside the Trust Substrate console.",
  "Stay concise.",
  "Prioritize the current Surfpool task, receipts, delegation chain, and disputes.",
  "When you do not know a fact, say so plainly.",
  "Use the live context block below as the source of truth for the current local run.",
  "If the active model exposes tools, use them when they improve precision.",
].join(" ");

interface PiChatSurfaceProps {
  runtimeLabel?: string | null;
  slotLabel?: string | null;
  latestReceiptLabel?: string | null;
  receiptCount?: number;
  taskLabel?: string | null;
  rpcLabel?: string | null;
  delegationLabels?: string[];
}

interface StoredChatState {
  messages: AgentMessage[];
  preferredModel: PiModelPreference | null;
  thinkingLevel: ThinkingLevel;
}

export function PiChatSurface({
  runtimeLabel = null,
  slotLabel = null,
  latestReceiptLabel = null,
  receiptCount = 0,
  taskLabel = null,
  rpcLabel = null,
  delegationLabels = [],
}: PiChatSurfaceProps) {
  const [agentHandle, setAgentHandle] = useState<Awaited<
    ReturnType<typeof createPiConsoleAgent>
  > | null>(null);
  const [draft, setDraft] = useState("");
  const [composeError, setComposeError] = useState<string | null>(null);
  const [activityLog, setActivityLog] = useState<LocalRuntimeActivity[]>([]);
  const [version, setVersion] = useState(0);
  const [isReady, setIsReady] = useState(false);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const agentRef = useRef<Awaited<ReturnType<typeof createPiConsoleAgent>> | null>(
    null,
  );

  const systemPrompt = useMemo(() => {
    const contextLines = [
      taskLabel ? `Task: ${taskLabel}` : null,
      runtimeLabel ? `Runtime: ${runtimeLabel}` : null,
      slotLabel ? `Slot: ${slotLabel}` : null,
      rpcLabel ? `RPC: ${rpcLabel}` : null,
      latestReceiptLabel ? `Latest receipt: ${latestReceiptLabel}` : null,
      `Receipt count: ${receiptCount}`,
      delegationLabels.length > 0
        ? `Delegation: ${delegationLabels.slice(0, 4).join(" | ")}`
        : "Delegation: none",
    ].filter(Boolean);

    return `${BASE_SYSTEM_PROMPT}\n\nLive context:\n${contextLines.join("\n")}`;
  }, [
    delegationLabels,
    latestReceiptLabel,
    receiptCount,
    rpcLabel,
    runtimeLabel,
    slotLabel,
    taskLabel,
  ]);
  const initialSystemPromptRef = useRef(systemPrompt);

  useEffect(() => {
    let isActive = true;
    let unsubscribe = () => {};
    const storedState = loadStoredChatState();

    const initialize = async () => {
      const handle = await createPiConsoleAgent({
        systemPrompt: initialSystemPromptRef.current,
        messages: storedState.messages,
        preferredModel: storedState.preferredModel,
        thinkingLevel: storedState.thinkingLevel,
      });

      if (!isActive) {
        handle.agent.abort();
        return;
      }

      unsubscribe = handle.agent.subscribe(() => {
        if (!isActive) {
          return;
        }
        setVersion((current) => current + 1);
      });
      agentRef.current = handle;
      setAgentHandle(handle);
      setIsReady(true);
    };

    void initialize();

    return () => {
      isActive = false;
      unsubscribe();
      if (agentRef.current) {
        agentRef.current.agent.abort();
      }
    };
  }, []);

  useEffect(() => {
    if (!agentHandle) {
      return;
    }

    agentHandle.agent.state.systemPrompt = systemPrompt;
    setVersion((current) => current + 1);
  }, [agentHandle, systemPrompt]);

  useEffect(() => {
    if (!agentHandle) {
      return;
    }

    persistChatState({
      messages: agentHandle.agent.state.messages,
      preferredModel: {
        provider: agentHandle.agent.state.model.provider,
        modelId: agentHandle.agent.state.model.id,
      },
      thinkingLevel: agentHandle.agent.state.thinkingLevel,
    });
  }, [agentHandle, version]);

  useEffect(() => {
    const unsubscribe = subscribeToLocalRuntimeActivity((activity) => {
      setActivityLog((current) => upsertActivity(current, activity));
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) {
      return;
    }

    container.scrollTop = container.scrollHeight;
  }, [activityLog, version]);

  const agent = agentHandle?.agent ?? null;
  const runtime = agentHandle?.runtime ?? null;
  const messages = agent?.state.messages ?? [];
  const streamingMessage = isAssistantMessage(agent?.state.streamingMessage)
    ? agent.state.streamingMessage
    : null;
  const isStreaming = agent?.state.isStreaming ?? false;
  const currentModel = agent?.state.model ?? null;
  const pendingToolCalls = agent?.state.pendingToolCalls ?? new Set<string>();
  const canSend = Boolean(agent && draft.trim().length > 0 && !isStreaming);
  const providerLabel = currentModel
    ? getProviderLabel(currentModel.provider, runtime)
    : runtimeLabel;
  const availableThinkingLevels = useMemo(() => {
    if (!currentModel) {
      return ["off", "minimal", "low", "medium", "high"] as ThinkingLevel[];
    }

    return supportsXhigh(currentModel)
      ? (["off", "minimal", "low", "medium", "high", "xhigh"] as ThinkingLevel[])
      : (["off", "minimal", "low", "medium", "high"] as ThinkingLevel[]);
  }, [currentModel]);

  const handleSubmit = async () => {
    if (!agent || !currentModel || draft.trim().length === 0 || isStreaming) {
      return;
    }

    const message = draft.trim();
    const providerKey = await getAppStorage().providerKeys.get(currentModel.provider);
    if (!providerKey) {
      const didProvideKey = await ApiKeyPromptDialog.prompt(currentModel.provider);
      if (!didProvideKey) {
        return;
      }
    }

    if (isLocalRuntimeProvider(runtime, currentModel.provider)) {
      setActivityLog([]);
    }

    setComposeError(null);
    setDraft("");

    try {
      await agent.prompt(message);
    } catch (error) {
      setDraft(message);
      setComposeError(
        error instanceof Error ? error.message : "Pi failed to respond",
      );
    }
  };

  const handleClear = () => {
    if (!agent || isStreaming) {
      return;
    }

    agent.state.messages = [];
    setActivityLog([]);
    setComposeError(null);
    setVersion((current) => current + 1);
  };

  const handleSelectModel = () => {
    if (!agent || !currentModel) {
      return;
    }

    ModelSelector.open(currentModel, (nextModel) => {
      agent.state.model = nextModel;
      setComposeError(null);
      setVersion((current) => current + 1);
    });
  };

  if (!isReady) {
    return (
      <div className="flex h-full items-center justify-center px-6">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Connecting to Pi
        </div>
      </div>
    );
  }

  if (!agent || !currentModel) {
    return (
      <div className="flex h-full items-center justify-center px-6">
        <div className="max-w-sm space-y-2 text-center">
          <div className="flex justify-center">
            <Bot className="size-5 text-muted-foreground" />
          </div>
          <p className="text-sm text-foreground">Pi could not start.</p>
          <p className="text-xs text-muted-foreground">
            Reload the page after the local runtime is ready.
          </p>
        </div>
      </div>
    );
  }

  const activeError =
    composeError ??
    (agent.state.errorMessage && agent.state.errorMessage !== "aborted"
      ? agent.state.errorMessage
      : null);

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="border-b border-border/80 px-4 py-3 sm:px-5">
        <div className="flex flex-wrap items-center gap-2 text-[12px] text-muted-foreground">
          {providerLabel ? (
            <span className="truncate text-foreground/78">{providerLabel}</span>
          ) : null}
          <span className="truncate">{currentModel.id}</span>
          <span>{agent.state.thinkingLevel}</span>
          {slotLabel ? <span>{slotLabel}</span> : null}
          {latestReceiptLabel ? <span>{latestReceiptLabel}</span> : null}
          <span>{receiptCount} receipts</span>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 sm:px-5">
        <div className="mx-auto flex max-w-3xl flex-col gap-4">
          {messages.length === 0 && !streamingMessage && activityLog.length === 0 ? (
            <EmptyState />
          ) : null}

          {messages.map((message, index) => (
            <MessageRow
              key={getMessageKey(message, index)}
              message={message}
              pendingToolCalls={pendingToolCalls}
            />
          ))}

          {activityLog.length > 0 ? (
            <RuntimeActivityCard
              activities={activityLog}
              isStreaming={isStreaming && isLocalRuntimeProvider(runtime, currentModel.provider)}
            />
          ) : null}

          {streamingMessage ? (
            <AssistantBubble message={streamingMessage} pendingToolCalls={pendingToolCalls} />
          ) : null}
        </div>
      </div>

      <form
        className="border-t border-border/80 px-4 py-3 sm:px-5"
        onSubmit={(event) => {
          event.preventDefault();
          void handleSubmit();
        }}
      >
        <div className="mx-auto max-w-3xl space-y-3">
          {activeError ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/8 px-3 py-2 text-sm text-destructive">
              {activeError}
            </div>
          ) : null}

          <div className="rounded-lg border border-border/70 bg-card/70 px-3 py-3 shadow-sm">
            <label htmlFor="pi-chat-input" className="sr-only">
              Message Pi
            </label>
            <textarea
              id="pi-chat-input"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void handleSubmit();
                }
              }}
              placeholder="Ask Pi about the run"
              rows={3}
              disabled={isStreaming}
              className="min-h-[92px] w-full resize-none bg-transparent text-sm leading-6 text-foreground outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-70"
            />

            <div className="mt-3 flex flex-col gap-2 border-t border-border/70 pt-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="max-w-full truncate"
                  onClick={handleSelectModel}
                >
                  {currentModel.id}
                </Button>

                <label className="sr-only" htmlFor="pi-thinking-level">
                  Reasoning level
                </label>
                <select
                  id="pi-thinking-level"
                  value={agent.state.thinkingLevel}
                  onChange={(event) => {
                    agent.state.thinkingLevel = event.target.value as ThinkingLevel;
                    setVersion((current) => current + 1);
                  }}
                  className="h-8 rounded-lg border border-border/70 bg-background/80 px-2 text-xs text-muted-foreground outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
                >
                  {availableThinkingLevels.map((level) => (
                    <option key={level} value={level}>
                      {level}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2">
                {messages.length > 0 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleClear}
                    disabled={isStreaming}
                  >
                    <Trash2 className="size-3.5" />
                    Clear
                  </Button>
                ) : null}

                {isStreaming ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => agent.abort()}
                  >
                    <Square className="size-3.5" />
                    Stop
                  </Button>
                ) : (
                  <Button type="submit" size="sm" disabled={!canSend}>
                    <Send className="size-3.5" />
                    Send
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex min-h-[220px] items-center justify-center">
      <div className="max-w-sm space-y-2 text-center">
        <div className="flex justify-center">
          <Bot className="size-5 text-muted-foreground" />
        </div>
        <p className="text-sm text-foreground/84">
          Start with the task, a receipt, or a dispute.
        </p>
        <p className="text-xs text-muted-foreground">
          Local Codex stays the default. You can switch models when you need a
          different runtime.
        </p>
      </div>
    </div>
  );
}

function MessageRow({
  message,
  pendingToolCalls,
}: {
  message: AgentMessage;
  pendingToolCalls: ReadonlySet<string>;
}) {
  if (isAssistantMessage(message)) {
    return <AssistantBubble message={message} pendingToolCalls={pendingToolCalls} />;
  }

  if (isToolResultMessage(message)) {
    return <ToolResultBubble message={message} />;
  }

  if (isUserLikeMessage(message)) {
    return <UserBubble message={message} />;
  }

  return null;
}

function UserBubble({ message }: { message: UserLikeMessage }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[88%] rounded-lg border border-border/70 bg-card px-3 py-2 text-sm leading-6 whitespace-pre-wrap text-foreground">
        {typeof message.content === "string" ? message.content : ""}
      </div>
    </div>
  );
}

function AssistantBubble({
  message,
  pendingToolCalls,
}: {
  message: AssistantMessageLike;
  pendingToolCalls: ReadonlySet<string>;
}) {
  const textBlocks = message.content.filter(isTextBlock);
  const toolCalls = message.content.filter(isToolCallBlock);
  const thinkingBlocks = message.content.filter(isThinkingBlock);

  return (
    <div className="flex justify-start">
      <div className="flex max-w-[92%] flex-col gap-3">
        {textBlocks.length > 0 ? (
          <div className="rounded-lg px-1 text-sm leading-6 whitespace-pre-wrap text-foreground/90">
            {textBlocks.map((block, index) => (
              <p key={`${message.timestamp ?? 0}-text-${index}`}>{block.text}</p>
            ))}
          </div>
        ) : null}

        {thinkingBlocks.map((block, index) => (
          <div
            key={`${message.timestamp ?? 0}-thinking-${index}`}
            className="rounded-lg border border-border/70 bg-card/60 px-3 py-2 text-xs leading-5 whitespace-pre-wrap text-muted-foreground"
          >
            {block.thinking}
          </div>
        ))}

        {toolCalls.map((toolCall) => (
          <ToolCallBubble
            key={toolCall.id}
            toolCall={toolCall}
            isPending={pendingToolCalls.has(toolCall.id)}
          />
        ))}
      </div>
    </div>
  );
}

function ToolCallBubble({
  toolCall,
  isPending,
}: {
  toolCall: ToolCallBlock;
  isPending: boolean;
}) {
  return (
    <div className="rounded-lg border border-border/70 bg-card/70 px-3 py-2">
      <div className="flex items-center gap-2 text-sm text-foreground/84">
        <Wrench className="size-3.5 text-muted-foreground" />
        <span>{toolCall.name}</span>
        <span className="text-xs text-muted-foreground">
          {isPending ? "running" : "ready"}
        </span>
      </div>
      {toolCall.arguments ? (
        <pre className="mt-2 overflow-x-auto text-xs leading-5 whitespace-pre-wrap text-muted-foreground">
          {JSON.stringify(toolCall.arguments, null, 2)}
        </pre>
      ) : null}
    </div>
  );
}

function ToolResultBubble({
  message,
}: {
  message: ToolResultMessageLike;
}) {
  const textOutput = message.content
    .filter(isToolResultTextBlock)
    .map((block) => block.text)
    .join("\n")
    .trim();

  return (
    <div className="flex justify-start">
      <div className="max-w-[92%] rounded-lg border border-border/70 bg-card/70 px-3 py-2">
        <div className="flex items-center gap-2 text-sm text-foreground/84">
          <Wrench className="size-3.5 text-muted-foreground" />
          <span>{message.toolName}</span>
          <span className="text-xs text-muted-foreground">
            {message.isError ? "failed" : "complete"}
          </span>
        </div>
        {textOutput ? (
          <pre className="mt-2 max-h-56 overflow-auto text-xs leading-5 whitespace-pre-wrap text-muted-foreground">
            {textOutput}
          </pre>
        ) : null}
      </div>
    </div>
  );
}

function RuntimeActivityCard({
  activities,
  isStreaming,
}: {
  activities: LocalRuntimeActivity[];
  isStreaming: boolean;
}) {
  return (
    <div className="rounded-lg border border-border/70 bg-card/60 px-3 py-3">
      <div className="flex items-center gap-2 text-sm text-foreground/84">
        <Wrench className="size-3.5 text-muted-foreground" />
        <span>Local runtime activity</span>
        {isStreaming ? (
          <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
        ) : null}
      </div>

      <div className="mt-3 space-y-3">
        {activities.map((activity) => (
          <div key={activity.id} className="space-y-1">
            <div className="flex items-center gap-2 text-sm text-foreground/82">
              <span>{activity.label}</span>
              <span className="text-xs text-muted-foreground">
                {activity.phase === "start" ? "running" : activity.isError ? "failed" : "done"}
              </span>
            </div>
            {activity.detail ? (
              <p className="text-xs leading-5 text-muted-foreground">
                {activity.detail}
              </p>
            ) : null}
            {activity.output ? (
              <pre className="max-h-48 overflow-auto rounded-md bg-background/70 px-2 py-2 text-[11px] leading-5 whitespace-pre-wrap text-muted-foreground">
                {activity.output}
              </pre>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function loadStoredChatState(): StoredChatState {
  if (typeof window === "undefined") {
    return {
      messages: [],
      preferredModel: null,
      thinkingLevel: "off",
    };
  }

  try {
    const rawValue = window.localStorage.getItem(CHAT_STORAGE_KEY);
    if (!rawValue) {
      return {
        messages: [],
        preferredModel: null,
        thinkingLevel: "off",
      };
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
        : "off",
    };
  } catch {
    return {
      messages: [],
      preferredModel: null,
      thinkingLevel: "off",
    };
  }
}

function persistChatState(state: StoredChatState) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(state));
  } catch {
    window.localStorage.removeItem(CHAT_STORAGE_KEY);
  }
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

function getProviderLabel(
  provider: string,
  runtime: LocalRuntimeConfig | null,
) {
  if (provider === "openai-codex") {
    return "Local Codex";
  }

  if (provider === "anthropic" && runtime?.claude.available) {
    return "Local Claude";
  }

  return provider;
}

function isLocalRuntimeProvider(
  runtime: LocalRuntimeConfig | null,
  provider: string,
) {
  if (!runtime) {
    return false;
  }

  if (provider === "openai-codex") {
    return runtime.codex.available;
  }

  if (provider === "anthropic") {
    return runtime.claude.available;
  }

  return false;
}

function upsertActivity(
  activities: LocalRuntimeActivity[],
  nextActivity: LocalRuntimeActivity,
) {
  const existingIndex = activities.findIndex(
    (activity) => activity.id === nextActivity.id,
  );
  if (existingIndex < 0) {
    return [...activities, nextActivity];
  }

  const updatedActivities = [...activities];
  updatedActivities[existingIndex] = {
    ...updatedActivities[existingIndex],
    ...nextActivity,
  };
  return updatedActivities;
}

function getMessageKey(message: AgentMessage, index: number) {
  const timestamp = "timestamp" in message ? String(message.timestamp) : "untimed";
  return `${message.role}-${timestamp}-${index}`;
}

type UserLikeMessage = Extract<AgentMessage, { role: "user" | "user-with-attachments" }>;
type AssistantMessageLike = Extract<AgentMessage, { role: "assistant" }>;
type ToolResultMessageLike = Extract<AgentMessage, { role: "toolResult" }>;
type ToolCallBlock = Extract<AssistantMessageLike["content"][number], { type: "toolCall" }>;
type ThinkingBlock = Extract<AssistantMessageLike["content"][number], { type: "thinking" }>;
type TextBlock = Extract<AssistantMessageLike["content"][number], { type: "text" }>;
type ToolResultTextBlock = Extract<
  ToolResultMessageLike["content"][number],
  { type: "text" }
>;

function isUserLikeMessage(message: AgentMessage | null | undefined): message is UserLikeMessage {
  return message?.role === "user" || message?.role === "user-with-attachments";
}

function isAssistantMessage(
  message: AgentMessage | null | undefined,
): message is AssistantMessageLike {
  return message?.role === "assistant";
}

function isToolResultMessage(
  message: AgentMessage | null | undefined,
): message is ToolResultMessageLike {
  return message?.role === "toolResult";
}

function isTextBlock(
  block: AssistantMessageLike["content"][number],
): block is TextBlock {
  return block.type === "text";
}

function isThinkingBlock(
  block: AssistantMessageLike["content"][number],
): block is ThinkingBlock {
  return block.type === "thinking";
}

function isToolCallBlock(
  block: AssistantMessageLike["content"][number],
): block is ToolCallBlock {
  return block.type === "toolCall";
}

function isToolResultTextBlock(
  block: ToolResultMessageLike["content"][number],
): block is ToolResultTextBlock {
  return block.type === "text";
}
