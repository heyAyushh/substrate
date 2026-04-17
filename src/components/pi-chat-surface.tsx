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
  Plus,
  Send,
  Square,
  Trash2,
  Wrench,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  appendAgent,
  createAgentRecord,
  createDefaultAgentWorkspace,
  getActiveAgentRecord,
  loadAgentWorkspace,
  persistAgentWorkspace,
  setActiveAgent,
  type StoredAgentWorkspace,
  updateAgentChatState,
} from "@/lib/pi-agents";
import { createPiConsoleAgent } from "@/lib/pi-chat";
import {
  subscribeToLocalRuntimeActivity,
  type LocalRuntimeActivity,
  type LocalRuntimeConfig,
} from "@/lib/local-runtime";

const AGENT_SESSION_ID_PREFIX = "trust-substrate-pi-console-agent";
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

export function PiChatSurface({
  runtimeLabel = null,
  slotLabel = null,
  latestReceiptLabel = null,
  receiptCount = 0,
  taskLabel = null,
  rpcLabel = null,
  delegationLabels = [],
}: PiChatSurfaceProps) {
  const [agentWorkspace, setAgentWorkspace] = useState<StoredAgentWorkspace>(
    () => createDefaultAgentWorkspace(),
  );
  const [agentHandle, setAgentHandle] = useState<Awaited<
    ReturnType<typeof createPiConsoleAgent>
  > | null>(null);
  const [draft, setDraft] = useState("");
  const [composeError, setComposeError] = useState<string | null>(null);
  const [activityLog, setActivityLog] = useState<LocalRuntimeActivity[]>([]);
  const [version, setVersion] = useState(0);
  const [isReady, setIsReady] = useState(false);
  const [workspaceReady, setWorkspaceReady] = useState(false);
  const [isCreatingAgent, setIsCreatingAgent] = useState(false);
  const [newAgentName, setNewAgentName] = useState("");
  const [newAgentInstructions, setNewAgentInstructions] = useState("");

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const agentRef = useRef<Awaited<ReturnType<typeof createPiConsoleAgent>> | null>(
    null,
  );

  const activeAgentRecord = useMemo(
    () => getActiveAgentRecord(agentWorkspace),
    [agentWorkspace],
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

    const sections = [BASE_SYSTEM_PROMPT];
    if (activeAgentRecord.instructions) {
      sections.push(`Agent brief:\n${activeAgentRecord.instructions}`);
    }
    sections.push(`Live context:\n${contextLines.join("\n")}`);
    return sections.join("\n\n");
  }, [
    activeAgentRecord.instructions,
    delegationLabels,
    latestReceiptLabel,
    receiptCount,
    rpcLabel,
    runtimeLabel,
    slotLabel,
    taskLabel,
  ]);

  useEffect(() => {
    const workspace = loadAgentWorkspace();
    setAgentWorkspace(workspace);
    setWorkspaceReady(true);
  }, []);

  useEffect(() => {
    if (!workspaceReady) {
      return;
    }

    persistAgentWorkspace(agentWorkspace);
  }, [agentWorkspace, workspaceReady]);

  useEffect(() => {
    if (!workspaceReady) {
      return;
    }

    let isActive = true;
    let unsubscribe = () => {};

    setIsReady(false);
    setComposeError(null);
    setDraft("");
    setActivityLog([]);

    const initialize = async () => {
      const handle = await createPiConsoleAgent({
        sessionId: getAgentSessionId(activeAgentRecord.id),
        systemPrompt,
        messages: activeAgentRecord.state.messages,
        preferredModel: activeAgentRecord.state.preferredModel,
        thinkingLevel: activeAgentRecord.state.thinkingLevel,
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
        agentRef.current = null;
      }
    };
  }, [activeAgentRecord.id, workspaceReady]);

  useEffect(() => {
    if (!agentHandle) {
      return;
    }

    agentHandle.agent.state.systemPrompt = systemPrompt;
    setVersion((current) => current + 1);
  }, [agentHandle, systemPrompt]);

  useEffect(() => {
    if (!agentHandle || !workspaceReady) {
      return;
    }

    setAgentWorkspace((current) =>
      updateAgentChatState(current, activeAgentRecord.id, {
        messages: [...agentHandle.agent.state.messages],
        preferredModel: {
          provider: agentHandle.agent.state.model.provider,
          modelId: agentHandle.agent.state.model.id,
        },
        thinkingLevel: agentHandle.agent.state.thinkingLevel,
      }),
    );
  }, [activeAgentRecord.id, agentHandle, version, workspaceReady]);

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

  const handleSwitchAgent = (agentId: string) => {
    if (agentId === activeAgentRecord.id) {
      return;
    }

    setAgentWorkspace((current) => setActiveAgent(current, agentId));
    setComposeError(null);
    setDraft("");
    setActivityLog([]);
  };

  const handleCreateAgent = () => {
    const agentNumber = agentWorkspace.agents.length + 1;
    const nextAgent = createAgentRecord({
      name: newAgentName.trim() || `Agent ${agentNumber}`,
      instructions: newAgentInstructions,
    });

    setAgentWorkspace((current) => appendAgent(current, nextAgent));
    setIsCreatingAgent(false);
    setNewAgentName("");
    setNewAgentInstructions("");
    setComposeError(null);
    setDraft("");
    setActivityLog([]);
  };

  if (!workspaceReady || !isReady) {
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
        <div className="space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 space-y-2">
              <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
                <span>Agents</span>
                <span>{agentWorkspace.agents.length}</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {agentWorkspace.agents.map((agentOption) => (
                  <Button
                    key={agentOption.id}
                    type="button"
                    variant={
                      agentOption.id === activeAgentRecord.id ? "secondary" : "ghost"
                    }
                    size="sm"
                    className="max-w-full font-normal"
                    onClick={() => handleSwitchAgent(agentOption.id)}
                  >
                    {agentOption.name}
                  </Button>
                ))}
              </div>
              <p className="max-w-2xl text-xs leading-5 text-muted-foreground">
                {activeAgentRecord.instructions
                  ? activeAgentRecord.instructions
                  : "Separate each agent by brief, history, and model choice."}
              </p>
            </div>

            <Button
              type="button"
              variant={isCreatingAgent ? "secondary" : "outline"}
              size="sm"
              className="font-normal"
              onClick={() => {
                setIsCreatingAgent((current) => !current);
                if (isCreatingAgent) {
                  setNewAgentName("");
                  setNewAgentInstructions("");
                }
              }}
            >
              <Plus className="size-3.5" />
              New agent
            </Button>
          </div>

          {isCreatingAgent ? (
            <div className="rounded-lg border border-border/70 bg-card/60 px-3 py-3">
              <div className="grid gap-3 sm:grid-cols-[minmax(0,220px)_minmax(0,1fr)]">
                <label className="space-y-2">
                  <span className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
                    Name
                  </span>
                  <input
                    value={newAgentName}
                    onChange={(event) => setNewAgentName(event.target.value)}
                    placeholder={`Agent ${agentWorkspace.agents.length + 1}`}
                    className="h-9 w-full rounded-lg border border-border/70 bg-background/80 px-3 text-sm text-foreground outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
                  />
                </label>

                <label className="space-y-2">
                  <span className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
                    Brief
                  </span>
                  <textarea
                    value={newAgentInstructions}
                    onChange={(event) =>
                      setNewAgentInstructions(event.target.value)
                    }
                    rows={2}
                    placeholder="Optional role or focus for this agent"
                    className="min-h-[78px] w-full resize-none rounded-lg border border-border/70 bg-background/80 px-3 py-2 text-sm leading-6 text-foreground outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 placeholder:text-muted-foreground"
                  />
                </label>
              </div>

              <div className="mt-3 flex items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="font-normal"
                  onClick={() => {
                    setIsCreatingAgent(false);
                    setNewAgentName("");
                    setNewAgentInstructions("");
                  }}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="font-normal"
                  onClick={handleCreateAgent}
                >
                  Create agent
                </Button>
              </div>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-2 text-[12px] text-muted-foreground">
            <span className="truncate text-foreground/78">
              {activeAgentRecord.name}
            </span>
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
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 sm:px-5">
        <div className="mx-auto flex max-w-3xl flex-col gap-4">
          {messages.length === 0 && !streamingMessage && activityLog.length === 0 ? (
            <EmptyState agentName={activeAgentRecord.name} />
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
              isStreaming={
                isStreaming && isLocalRuntimeProvider(runtime, currentModel.provider)
              }
            />
          ) : null}

          {streamingMessage ? (
            <AssistantBubble
              message={streamingMessage}
              pendingToolCalls={pendingToolCalls}
            />
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
              Message {activeAgentRecord.name}
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
              placeholder={`Ask ${activeAgentRecord.name} about the run`}
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
                  className="max-w-full truncate font-normal"
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
                    className="font-normal"
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
                    className="font-normal"
                    onClick={() => agent.abort()}
                  >
                    <Square className="size-3.5" />
                    Stop
                  </Button>
                ) : (
                  <Button
                    type="submit"
                    size="sm"
                    className="font-normal"
                    disabled={!canSend}
                  >
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

function EmptyState({ agentName }: { agentName: string }) {
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
          {agentName} keeps a separate history. Create another agent when you
          need a different brief.
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
                {activity.phase === "start"
                  ? "running"
                  : activity.isError
                    ? "failed"
                    : "done"}
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

function getAgentSessionId(agentId: string) {
  return `${AGENT_SESSION_ID_PREFIX}-${agentId}`;
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
