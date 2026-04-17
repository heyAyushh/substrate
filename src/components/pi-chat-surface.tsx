import { useEffect, useMemo, useRef, useState } from "react";
import type { AgentMessage, ThinkingLevel } from "@mariozechner/pi-agent-core";
import { supportsXhigh } from "@mariozechner/pi-ai";
import {
  ApiKeyPromptDialog,
  ModelSelector,
  getAppStorage,
} from "@mariozechner/pi-web-ui";
import { Bot, Loader2, Send, Square, Trash2, Wrench } from "lucide-react";

import {
  PromptInput,
  PromptInputActions,
  PromptInputEnterHint,
  PromptInputFooter,
  PromptInputHeader,
  PromptInputMeta,
  PromptInputTextarea,
  PromptInputTools,
} from "@/components/ai-elements/prompt-input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  createEmptyChatState,
  createFallbackIdentityProfile,
  createIdentityWorkspace,
  loadIdentityWorkspace,
  persistIdentityWorkspace,
  setActiveIdentity,
  syncIdentityWorkspace,
  type PiIdentityProfile,
  type StoredIdentityWorkspace,
  updateIdentityChatState,
} from "@/lib/pi-identities";
import { createPiConsoleAgent } from "@/lib/pi-chat";
import {
  subscribeToLocalRuntimeActivity,
  type LocalRuntimeActivity,
  type LocalRuntimeConfig,
} from "@/lib/local-runtime";
import { cn } from "@/lib/utils";

const IDENTITY_SESSION_ID_PREFIX = "trust-substrate-pi-console-identity";
const BASE_SYSTEM_PROMPT = [
  "You are the selected Surfpool identity inside the Trust Substrate console.",
  "Answer in a concise, direct way.",
  "Stay faithful to the live task, receipts, delegation chain, and disputes shown in the console.",
  "If you infer something from the live snapshot instead of knowing it directly, say so plainly.",
  "Use tools when they improve precision.",
].join(" ");

interface PiChatSurfaceProps {
  identityProfiles?: PiIdentityProfile[];
  runtimeLabel?: string | null;
  slotLabel?: string | null;
  latestReceiptLabel?: string | null;
  receiptCount?: number;
  taskLabel?: string | null;
  rpcLabel?: string | null;
  delegationLabels?: string[];
}

export function PiChatSurface({
  identityProfiles = [],
  runtimeLabel = null,
  slotLabel = null,
  latestReceiptLabel = null,
  receiptCount = 0,
  taskLabel = null,
  rpcLabel = null,
  delegationLabels = [],
}: PiChatSurfaceProps) {
  const availableIdentities = useMemo(
    () =>
      identityProfiles.length > 0
        ? identityProfiles
        : [createFallbackIdentityProfile(taskLabel)],
    [identityProfiles, taskLabel],
  );
  const [identityWorkspace, setIdentityWorkspace] =
    useState<StoredIdentityWorkspace>(() =>
      createIdentityWorkspace(availableIdentities),
    );
  const [agentHandle, setAgentHandle] = useState<Awaited<
    ReturnType<typeof createPiConsoleAgent>
  > | null>(null);
  const [draft, setDraft] = useState("");
  const [composeError, setComposeError] = useState<string | null>(null);
  const [activityLog, setActivityLog] = useState<LocalRuntimeActivity[]>([]);
  const [version, setVersion] = useState(0);
  const [isReady, setIsReady] = useState(false);
  const [startupError, setStartupError] = useState<string | null>(null);
  const [workspaceReady, setWorkspaceReady] = useState(false);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const agentRef = useRef<Awaited<ReturnType<typeof createPiConsoleAgent>> | null>(
    null,
  );

  const activeIdentity =
    availableIdentities.find(
      (identity) => identity.id === identityWorkspace.activeIdentityId,
    ) ?? availableIdentities[0];
  const activeChatState =
    identityWorkspace.chats[activeIdentity.id] ?? createEmptyChatState();
  const initialChatState = useMemo(() => activeChatState, [activeIdentity.id]);

  const systemPrompt = useMemo(() => {
    const identityLines = [
      `Label: ${activeIdentity.label}`,
      `Identity id: ${activeIdentity.id}`,
      `Role: ${activeIdentity.roleSummary}`,
      activeIdentity.latestReceiptKind
        ? `Latest receipt: ${activeIdentity.latestReceiptKind}`
        : null,
      `Receipts landed: ${activeIdentity.receiptCount}`,
      activeIdentity.score !== null
        ? `Leaderboard score: ${activeIdentity.score}`
        : null,
      activeIdentity.delegatedFromLabels.length > 0
        ? `Delegated from: ${activeIdentity.delegatedFromLabels.join(" | ")}`
        : "Delegated from: none",
      activeIdentity.delegatedToLabels.length > 0
        ? `Delegates to: ${activeIdentity.delegatedToLabels.join(" | ")}`
        : "Delegates to: none",
    ].filter(Boolean);
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

    return [
      BASE_SYSTEM_PROMPT,
      `Active identity:\n${identityLines.join("\n")}`,
      `Live context:\n${contextLines.join("\n")}`,
    ].join("\n\n");
  }, [
    activeIdentity,
    delegationLabels,
    latestReceiptLabel,
    receiptCount,
    rpcLabel,
    runtimeLabel,
    slotLabel,
    taskLabel,
  ]);

  useEffect(() => {
    setIdentityWorkspace(loadIdentityWorkspace(availableIdentities));
    setWorkspaceReady(true);
  }, []);

  useEffect(() => {
    if (!workspaceReady) {
      return;
    }

    setIdentityWorkspace((current) =>
      syncIdentityWorkspace(current, availableIdentities),
    );
  }, [availableIdentities, workspaceReady]);

  useEffect(() => {
    if (!workspaceReady) {
      return;
    }

    persistIdentityWorkspace(identityWorkspace);
  }, [identityWorkspace, workspaceReady]);

  useEffect(() => {
    if (!workspaceReady) {
      return;
    }

    let isActive = true;
    let unsubscribe = () => {};

    setIsReady(false);
    setStartupError(null);
    setComposeError(null);
    setDraft("");
    setActivityLog([]);

    const initialize = async () => {
      try {
        const handle = await createPiConsoleAgent({
          sessionId: getIdentitySessionId(activeIdentity.id),
          systemPrompt,
          messages: initialChatState.messages,
          preferredModel: initialChatState.preferredModel,
          thinkingLevel: initialChatState.thinkingLevel,
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
      } catch (error) {
        if (!isActive) {
          return;
        }

        setStartupError(
          error instanceof Error ? error.message : "Pi could not start",
        );
      }
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
  }, [activeIdentity.id, initialChatState, workspaceReady]);

  useEffect(() => {
    if (!agentHandle) {
      return;
    }

    agentHandle.agent.state.systemPrompt = systemPrompt;
    setVersion((current) => current + 1);
  }, [agentHandle, systemPrompt]);

  useEffect(() => {
    const unsubscribe = subscribeToLocalRuntimeActivity((activity) => {
      setActivityLog((current) => upsertActivity(current, activity));
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!agentHandle || !workspaceReady) {
      return;
    }

    setIdentityWorkspace((current) =>
      updateIdentityChatState(current, activeIdentity.id, {
        messages: [...agentHandle.agent.state.messages],
        preferredModel: {
          provider: agentHandle.agent.state.model.provider,
          modelId: agentHandle.agent.state.model.id,
        },
        thinkingLevel: agentHandle.agent.state.thinkingLevel,
      }),
    );
  }, [activeIdentity.id, agentHandle, version, workspaceReady]);

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
    if (!isLocalRuntimeProvider(runtime, currentModel.provider)) {
      const providerKey = await getAppStorage().providerKeys.get(
        currentModel.provider,
      );
      if (!providerKey) {
        const didProvideKey = await ApiKeyPromptDialog.prompt(
          currentModel.provider,
        );
        if (!didProvideKey) {
          return;
        }
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

  const handleSwitchIdentity = (identityId: string) => {
    if (identityId === activeIdentity.id) {
      return;
    }

    setIdentityWorkspace((current) => setActiveIdentity(current, identityId));
    setComposeError(null);
    setDraft("");
    setActivityLog([]);
  };

  if (!workspaceReady || (!isReady && !startupError)) {
    return (
      <div className="flex h-full items-center justify-center px-6">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Connecting to {activeIdentity.label}
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
            {startupError ?? "Reload the page after the local runtime is ready."}
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
  const identityMeta = [
    providerLabel,
    currentModel.id,
    agent.state.thinkingLevel,
    slotLabel,
  ].filter(Boolean);
  const connectionSummary = buildConnectionSummary(activeIdentity);

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="border-b border-border/80 px-4 py-3 sm:px-5">
        <div className="space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 space-y-1.5">
              <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
                <span>Identities</span>
                <span>{availableIdentities.length}</span>
              </div>
              <p className="hidden max-w-2xl text-sm leading-6 text-foreground/82 sm:block">
                {activeIdentity.roleSummary}
              </p>
              {connectionSummary ? (
                <p className="hidden max-w-2xl text-xs leading-5 text-muted-foreground sm:block">
                  {connectionSummary}
                </p>
              ) : null}
            </div>

            <div className="hidden flex-wrap items-center gap-2 sm:flex">
              {activeIdentity.score !== null ? (
                <Badge variant="outline" className="h-6 rounded-md px-2.5">
                  score {activeIdentity.score}
                </Badge>
              ) : null}
              <Badge variant="outline" className="h-6 rounded-md px-2.5">
                {activeIdentity.receiptCount} receipts
              </Badge>
              {activeIdentity.latestReceiptKind ? (
                <Badge variant="outline" className="h-6 rounded-md px-2.5">
                  {activeIdentity.latestReceiptKind}
                </Badge>
              ) : null}
            </div>
          </div>

          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {availableIdentities.map((identityOption) => {
              const isActive = identityOption.id === activeIdentity.id;

              return (
                <button
                  key={identityOption.id}
                  type="button"
                  className={cn(
                    "min-h-10 min-w-[136px] rounded-lg border px-3 py-2 text-left transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50",
                    isActive
                      ? "border-border bg-card/80 text-foreground shadow-sm shadow-black/20"
                      : "border-border/70 bg-background/40 text-foreground/82 hover:bg-muted/35",
                  )}
                  onClick={() => handleSwitchIdentity(identityOption.id)}
                >
                  <span className="block text-sm">{identityOption.label}</span>
                  <span className="mt-1 block text-[11px] leading-5 text-muted-foreground">
                    {buildIdentityChipMeta(identityOption)}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="hidden flex-wrap items-center gap-2 text-xs text-muted-foreground sm:flex">
            <span className="text-foreground/82">{truncateIdentity(activeIdentity.id)}</span>
            {identityMeta.map((value) => (
              <span key={value}>{value}</span>
            ))}
            {latestReceiptLabel ? <span>{latestReceiptLabel}</span> : null}
            <span>{receiptCount} total receipts</span>
          </div>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 sm:px-5">
        <div className="mx-auto flex max-w-3xl flex-col gap-4">
          {messages.length === 0 && !streamingMessage && activityLog.length === 0 ? (
            <EmptyState identity={activeIdentity} />
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

      <div className="border-t border-border/80 px-4 py-3 sm:px-5">
        <div className="mx-auto max-w-3xl">
          {activeError ? (
            <div className="mb-3 rounded-lg border border-destructive/30 bg-destructive/8 px-3 py-2 text-sm text-destructive">
              {activeError}
            </div>
          ) : null}

          <PromptInput
            onSubmit={(event) => {
              event.preventDefault();
              void handleSubmit();
            }}
          >
            <PromptInputHeader>
              <div className="space-y-1.5">
                <label
                  htmlFor="pi-chat-input"
                  className="block text-[11px] uppercase tracking-[0.08em] text-muted-foreground"
                >
                  Message {activeIdentity.label}
                </label>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary" className="h-6 rounded-md px-2.5">
                    {activeIdentity.label}
                  </Badge>
                  <span className="hidden text-xs leading-5 text-muted-foreground sm:inline">
                    {activeIdentity.promptHint}
                  </span>
                </div>
              </div>
            </PromptInputHeader>

            <PromptInputTextarea
              id="pi-chat-input"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void handleSubmit();
                }
              }}
              placeholder={`Ask ${activeIdentity.label} about the task, delegation, or receipts`}
              disabled={isStreaming}
              rows={4}
              enterKeyHint="send"
            />

            <PromptInputFooter>
              <div className="space-y-2">
                <PromptInputTools>
                  <div className="inline-flex h-8 items-center gap-2 rounded-md border border-border/70 bg-background/60 px-2">
                    <span className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
                      Model
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 rounded-md px-2 text-xs font-normal"
                      onClick={handleSelectModel}
                    >
                      {currentModel.id}
                    </Button>
                  </div>

                  <label className="inline-flex h-8 items-center gap-2 rounded-md border border-border/70 bg-background/60 px-2">
                    <span className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
                      Reasoning
                    </span>
                    <select
                      value={agent.state.thinkingLevel}
                      onChange={(event) => {
                        agent.state.thinkingLevel = event.target.value as ThinkingLevel;
                        setVersion((current) => current + 1);
                      }}
                      className="h-6 bg-transparent pr-1 text-xs text-foreground outline-none"
                    >
                      {availableThinkingLevels.map((level) => (
                        <option key={level} value={level}>
                          {level}
                        </option>
                      ))}
                    </select>
                  </label>

                  <Badge variant="outline" className="h-6 rounded-md px-2.5">
                    MCP + tools
                  </Badge>
                </PromptInputTools>

                <PromptInputMeta>
                  <PromptInputEnterHint />
                  <span>{messages.length} messages</span>
                  <span>{activeIdentity.receiptCount} live receipts</span>
                </PromptInputMeta>
              </div>

              <PromptInputActions>
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
              </PromptInputActions>
            </PromptInputFooter>
          </PromptInput>
        </div>
      </div>
    </div>
  );
}

function EmptyState({ identity }: { identity: PiIdentityProfile }) {
  return (
    <div className="flex min-h-[88px] items-center justify-center sm:min-h-[220px]">
      <div className="max-w-sm space-y-2 text-center">
        <div className="flex justify-center">
          <Bot className="size-5 text-muted-foreground" />
        </div>
        <p className="text-sm text-foreground/84">
          Start with the task, a receipt, or a dispute.
        </p>
        <p className="text-xs leading-5 text-muted-foreground">
          {identity.promptHint}
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
      <div className="max-w-[88%] rounded-lg border border-border/70 bg-card/70 px-3 py-2 text-sm leading-6 whitespace-pre-wrap text-foreground">
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

function buildIdentityChipMeta(identity: PiIdentityProfile) {
  const parts = [`${identity.receiptCount} receipts`];
  if (identity.latestReceiptKind) {
    parts.push(identity.latestReceiptKind);
  }
  if (identity.score !== null) {
    parts.push(`score ${identity.score}`);
  }
  return parts.join(" · ");
}

function buildConnectionSummary(identity: PiIdentityProfile) {
  const segments = [];
  if (identity.delegatedFromLabels.length > 0) {
    segments.push(`from ${identity.delegatedFromLabels.join(", ")}`);
  }
  if (identity.delegatedToLabels.length > 0) {
    segments.push(`to ${identity.delegatedToLabels.join(", ")}`);
  }
  return segments.length > 0 ? `Connected ${segments.join(" · ")}` : null;
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

function getIdentitySessionId(identityId: string) {
  return `${IDENTITY_SESSION_ID_PREFIX}-${identityId}`;
}

function getMessageKey(message: AgentMessage, index: number) {
  const timestamp = "timestamp" in message ? String(message.timestamp) : "untimed";
  return `${message.role}-${timestamp}-${index}`;
}

function truncateIdentity(identityId: string) {
  return identityId.length > 24
    ? `${identityId.slice(0, 12)}...${identityId.slice(-8)}`
    : identityId;
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

function isTextBlock(block: AssistantMessageLike["content"][number]): block is TextBlock {
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
