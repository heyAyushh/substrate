import { useEffect, useMemo, useRef, useState } from "react";
import type { AgentMessage, ThinkingLevel } from "@mariozechner/pi-agent-core";
import { supportsXhigh } from "@mariozechner/pi-ai";
import {
  ApiKeyPromptDialog,
  ModelSelector,
  getAppStorage,
} from "@mariozechner/pi-web-ui";
import { Bot, Loader2, Send, Square, Trash2, Wrench } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  createEmptyChatState,
  createFallbackIdentityProfile,
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
  type LocalMcpServer,
  type LocalRuntimeActivity,
  type LocalRuntimeConfig,
} from "@trust-substrate/pi-local-runtime";
import { cn } from "@/lib/utils";

const IDENTITY_SESSION_ID_PREFIX = "trust-substrate-pi-console-identity";
const BASE_SYSTEM_PROMPT = [
  "You are the selected Surfpool identity inside the Trust Substrate console.",
  "Answer in a concise, direct way.",
  "Stay faithful to the live task, receipts, delegation chain, and disputes shown in the console.",
  "If you infer something from the live snapshot instead of knowing it directly, say so plainly.",
  "Use tools when they improve precision.",
  "If Codex MCP servers are configured, prefer them for search and external context when they materially improve the answer.",
].join(" ");

interface PiChatSurfaceProps {
  identityProfiles?: PiIdentityProfile[];
  mcpServers?: LocalMcpServer[];
  runtimeLabel?: string | null;
  slotLabel?: string | null;
  latestReceiptLabel?: string | null;
  receiptCount?: number;
  taskLabel?: string | null;
  rpcLabel?: string | null;
  delegationLabels?: string[];
  onInspectorStateChange?: (state: PiChatInspectorState) => void;
}

export interface PiChatInspectorState {
  mcpServers: LocalMcpServer[];
  activities: LocalRuntimeActivity[];
  pendingToolCount: number;
  isStreaming: boolean;
}

type PiConsoleAgentHandle = Awaited<ReturnType<typeof createPiConsoleAgent>>;

export function PiChatSurface({
  identityProfiles = [],
  mcpServers = [],
  runtimeLabel = null,
  slotLabel = null,
  latestReceiptLabel = null,
  receiptCount = 0,
  taskLabel = null,
  rpcLabel = null,
  delegationLabels = [],
  onInspectorStateChange,
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
      loadIdentityWorkspace(availableIdentities),
    );
  const [agentHandle, setAgentHandle] = useState<PiConsoleAgentHandle | null>(
    null,
  );
  const [draft, setDraft] = useState("");
  const [composeError, setComposeError] = useState<string | null>(null);
  const [activityLog, setActivityLog] = useState<LocalRuntimeActivity[]>([]);
  const [version, setVersion] = useState(0);
  const [isReady, setIsReady] = useState(false);
  const [startupError, setStartupError] = useState<string | null>(null);

  const bottomRef = useRef<HTMLDivElement | null>(null);
  const agentRef = useRef<PiConsoleAgentHandle | null>(null);
  const systemPromptRef = useRef("");

  const syncedIdentityWorkspace = useMemo(
    () => syncIdentityWorkspace(identityWorkspace, availableIdentities),
    [availableIdentities, identityWorkspace],
  );

  const activeIdentity =
    availableIdentities.find(
      (identity) => identity.id === syncedIdentityWorkspace.activeIdentityId,
    ) ?? availableIdentities[0];
  const activeChatState =
    syncedIdentityWorkspace.chats[activeIdentity.id] ?? createEmptyChatState();
  const initialChatStateRef = useRef(activeChatState);

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
        ? `Program-backed reputation score: ${activeIdentity.score}`
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
    initialChatStateRef.current = activeChatState;
  }, [activeChatState]);

  useEffect(() => {
    systemPromptRef.current = systemPrompt;
  }, [systemPrompt]);

  useEffect(() => {
    persistIdentityWorkspace(syncedIdentityWorkspace);
  }, [syncedIdentityWorkspace]);

  useEffect(() => {
    let isActive = true;
    let unsubscribe = () => {};

    const initialize = async () => {
      try {
        const initialChatState = initialChatStateRef.current;
        const handle = await createPiConsoleAgent({
          sessionId: getIdentitySessionId(activeIdentity.id),
          systemPrompt: systemPromptRef.current,
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

          setIdentityWorkspace((current) =>
            updateIdentityChatState(current, activeIdentity.id, {
              messages: [...handle.agent.state.messages],
              preferredModel: {
                provider: handle.agent.state.model.provider,
                modelId: handle.agent.state.model.id,
              },
              thinkingLevel: handle.agent.state.thinkingLevel,
            }),
          );
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
  }, [activeIdentity.id]);

  useEffect(() => {
    if (!agentRef.current) {
      return;
    }

    agentRef.current.agent.state.systemPrompt = systemPrompt;
  }, [systemPrompt]);

  useEffect(() => {
    const unsubscribe = subscribeToLocalRuntimeActivity((activity) => {
      setActivityLog((current) => upsertActivity(current, activity));
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    const bottomMarker = bottomRef.current;
    if (!bottomMarker) {
      return;
    }

    bottomMarker.scrollIntoView({
      behavior: "smooth",
      block: "end",
    });
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
  const runtimeMcpServers = agentHandle?.runtime.mcpServers.length
    ? agentHandle.runtime.mcpServers
    : mcpServers;
  const isLocalRuntimeModel = currentModel
    ? isLocalRuntimeProvider(runtime, currentModel.provider)
    : false;
  const availableThinkingLevels = useMemo(() => {
    if (!currentModel) {
      return ["off", "minimal", "low", "medium", "high"] as ThinkingLevel[];
    }

    return supportsXhigh(currentModel)
      ? ([
          "off",
          "minimal",
          "low",
          "medium",
          "high",
          "xhigh",
        ] as ThinkingLevel[])
      : (["off", "minimal", "low", "medium", "high"] as ThinkingLevel[]);
  }, [currentModel]);
  const quickPrompts = useMemo(
    () =>
      [
        {
          label: "Task",
          prompt: "Summarize the active task and the highest-risk open issue.",
        },
        {
          label: "Receipts",
          prompt:
            "List the latest receipts and what they imply for the current run.",
        },
        {
          label: "Delegation",
          prompt:
            "Explain the current delegation chain and who should act next.",
        },
      ].filter(Boolean) as Array<{ label: string; prompt: string }>,
    [],
  );

  useEffect(() => {
    onInspectorStateChange?.({
      mcpServers: runtimeMcpServers,
      activities: activityLog,
      pendingToolCount: pendingToolCalls.size,
      isStreaming: isStreaming && isLocalRuntimeModel,
    });
  }, [
    activityLog,
    isLocalRuntimeModel,
    isStreaming,
    onInspectorStateChange,
    pendingToolCalls.size,
    runtimeMcpServers,
  ]);

  const handleSubmit = async () => {
    const activeAgent = agentRef.current?.agent;
    if (
      !activeAgent ||
      !currentModel ||
      draft.trim().length === 0 ||
      isStreaming
    ) {
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
      const nextUserMessage = {
        role: "user",
        content: [{ type: "text", text: message }],
        timestamp: Date.now(),
      } as AgentMessage;

      // eslint-disable-next-line react-hooks/immutability -- Pi agent state is an imperative runtime object.
      activeAgent.state.messages = [
        ...activeAgent.state.messages,
        nextUserMessage,
      ];
      setIdentityWorkspace((current) =>
        updateIdentityChatState(current, activeIdentity.id, {
          messages: [...activeAgent.state.messages],
          preferredModel: {
            provider: activeAgent.state.model.provider,
            modelId: activeAgent.state.model.id,
          },
          thinkingLevel: activeAgent.state.thinkingLevel,
        }),
      );
      setVersion((current) => current + 1);

      await activeAgent.continue();
    } catch (error) {
      setDraft(message);
      setComposeError(
        error instanceof Error ? error.message : "Pi failed to respond",
      );
    }
  };

  const handleClear = () => {
    const activeAgent = agentRef.current?.agent;
    if (!activeAgent || isStreaming) {
      return;
    }

    // eslint-disable-next-line react-hooks/immutability -- Pi agent state is an imperative runtime object.
    activeAgent.state.messages = [];
    setActivityLog([]);
    setComposeError(null);
    setVersion((current) => current + 1);
  };

  const handleSelectModel = () => {
    if (!agent || !currentModel) {
      return;
    }

    ModelSelector.open(currentModel, (nextModel) => {
      const activeAgent = agentRef.current?.agent;
      if (!activeAgent) {
        return;
      }

      activeAgent.state.model = nextModel;
      setComposeError(null);
      setVersion((current) => current + 1);
    });
  };

  const handleSwitchIdentity = (identityId: string) => {
    if (identityId === activeIdentity.id) {
      return;
    }

    setIdentityWorkspace((current) => setActiveIdentity(current, identityId));
    setAgentHandle(null);
    setIsReady(false);
    setStartupError(null);
    setComposeError(null);
    setDraft("");
    setActivityLog([]);
  };

  const handleUsePrompt = (prompt: string) => {
    if (isStreaming) {
      return;
    }

    setDraft(prompt);
  };

  if (!isReady && !startupError) {
    return <ChatSurfaceSkeleton identityLabel={activeIdentity.label} />;
  }

  if (!agent || !currentModel) {
    return (
      <Card className="min-h-[420px] gap-0 bg-card/72 supports-[backdrop-filter]:backdrop-blur-xl">
        <CardHeader className="border-b border-border/70 bg-background/28">
          <CardTitle>Pi could not start</CardTitle>
          <CardDescription>
            Reload after the local runtime is ready.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-1 items-center justify-center py-8">
          <Alert variant="destructive" className="max-w-lg">
            <Bot aria-hidden="true" />
            <AlertTitle>Startup failed</AlertTitle>
            <AlertDescription>
              {startupError ?? "The local runtime did not become ready."}
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  const activeError =
    composeError ??
    (agent.state.errorMessage && agent.state.errorMessage !== "aborted"
      ? agent.state.errorMessage
      : null);
  const connectionSummary = buildConnectionSummary(activeIdentity);

  return (
    <Card className="h-full min-h-[760px] gap-0 overflow-hidden bg-card/72 supports-[backdrop-filter]:backdrop-blur-xl xl:min-h-0">
      <CardHeader className="gap-4 border-b border-border/70 bg-background/28">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-base font-medium">
                {activeIdentity.label}
              </CardTitle>
              <Badge variant="outline">
                {activeIdentity.receiptCount} receipts
              </Badge>
              {activeIdentity.latestReceiptKind ? (
                <Badge variant="outline">
                  {activeIdentity.latestReceiptKind}
                </Badge>
              ) : null}
              {activeIdentity.score !== null ? (
                <Badge variant="outline">
                  program score {activeIdentity.score}
                </Badge>
              ) : null}
            </div>

            <CardDescription className="max-w-3xl">
              {activeIdentity.roleSummary}
            </CardDescription>
            {connectionSummary ? (
              <p className="text-xs text-muted-foreground">
                {connectionSummary}
              </p>
            ) : null}
          </div>

          <div className="flex w-full flex-col gap-2 lg:w-auto lg:items-end">
            {availableIdentities.length > 1 ? (
              <div className="sm:hidden">
                <Select
                  value={activeIdentity.id}
                  onValueChange={handleSwitchIdentity}
                >
                  <SelectTrigger className="w-full border-border/70 bg-background/30">
                    <SelectValue placeholder="Choose identity" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {availableIdentities.map((identityOption) => (
                        <SelectItem
                          key={identityOption.id}
                          value={identityOption.id}
                        >
                          {identityOption.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
            ) : null}
          </div>
        </div>

        {availableIdentities.length > 1 ? (
          <div className="hidden overflow-x-auto pb-1 sm:block">
            <div className="flex gap-2">
              {availableIdentities.map((identityOption) => {
                const isActive = identityOption.id === activeIdentity.id;

                return (
                  <button
                    key={identityOption.id}
                    type="button"
                    className={cn(
                      "flex min-w-[148px] flex-col gap-1 rounded-md border px-3 py-2 text-left transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50",
                      isActive
                        ? "border-border bg-background/72 text-foreground"
                        : "border-border/70 bg-background/24 text-foreground/82 hover:bg-muted/50",
                    )}
                    onClick={() => handleSwitchIdentity(identityOption.id)}
                  >
                    <span className="text-sm font-medium">
                      {identityOption.label}
                    </span>
                    <span className="text-[11px] leading-5 text-muted-foreground">
                      {buildIdentityChipMeta(identityOption)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
      </CardHeader>

      <CardContent className="min-h-0 flex-1 px-0 py-0">
        <ConversationPane
          messages={messages}
          streamingMessage={streamingMessage}
          pendingToolCalls={pendingToolCalls}
          activityLog={activityLog}
          isStreaming={isStreaming && isLocalRuntimeModel}
          activeIdentity={activeIdentity}
          quickPrompts={quickPrompts}
          onUsePrompt={handleUsePrompt}
          bottomRef={bottomRef}
        />
      </CardContent>

      <CardFooter className="border-t border-border/70 bg-background/20 px-3 py-3 supports-[backdrop-filter]:bg-background/44 supports-[backdrop-filter]:backdrop-blur-2xl sm:px-4 sm:py-4">
        <form
          className="flex w-full flex-col gap-3 rounded-lg border border-border/70 bg-background/26 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] supports-[backdrop-filter]:bg-background/24 sm:p-4"
          onSubmit={(event) => {
            event.preventDefault();
            void handleSubmit();
          }}
        >
          {activeError ? (
            <Alert variant="destructive">
              <Bot aria-hidden="true" />
              <AlertTitle>Pi failed to respond</AlertTitle>
              <AlertDescription>{activeError}</AlertDescription>
            </Alert>
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-lg border-border/70 bg-background/40"
              onClick={handleSelectModel}
            >
              {currentModel.id}
            </Button>

            <Select
              value={agent.state.thinkingLevel}
              onValueChange={(nextValue) => {
                const activeAgent = agentRef.current?.agent;
                if (!activeAgent) {
                  return;
                }

                // eslint-disable-next-line react-hooks/immutability -- Pi agent state is an imperative runtime object.
                activeAgent.state.thinkingLevel = nextValue as ThinkingLevel;
                setVersion((current) => current + 1);
              }}
            >
              <SelectTrigger
                size="sm"
                className="w-[122px] rounded-lg border-border/70 bg-background/40"
              >
                <SelectValue placeholder="Thinking" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {availableThinkingLevels.map((level) => (
                    <SelectItem key={level} value={level}>
                      {level}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>

            {pendingToolCalls.size > 0 ? (
              <Badge variant="outline">
                {pendingToolCalls.size} tools running
              </Badge>
            ) : null}
          </div>

          <label htmlFor="pi-chat-input" className="sr-only">
            Message {activeIdentity.label}
          </label>

          <Textarea
            id="pi-chat-input"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void handleSubmit();
              }
            }}
            placeholder={`Ask ${activeIdentity.label} about the task, receipts, or next handoff`}
            disabled={isStreaming}
            rows={5}
            enterKeyHint="send"
            className="min-h-[140px] resize-none rounded-lg border-border/70 bg-background/38 px-4 py-3 text-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] supports-[backdrop-filter]:bg-background/30"
          />

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">
              Enter sends. Shift+Enter adds a line. Tool and MCP activity lands
              in the inspector.
            </p>

            <div className="flex justify-end gap-2">
              {messages.length > 0 ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="rounded-lg"
                  onClick={handleClear}
                  disabled={isStreaming}
                >
                  <Trash2 data-icon="inline-start" aria-hidden="true" />
                  Clear
                </Button>
              ) : null}

              {isStreaming ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="rounded-lg"
                  onClick={() => agent.abort()}
                >
                  <Square data-icon="inline-start" aria-hidden="true" />
                  Stop
                </Button>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  className="rounded-lg"
                  onClick={() => void handleSubmit()}
                  disabled={!canSend}
                >
                  Send
                  <Send data-icon="inline-end" aria-hidden="true" />
                </Button>
              )}
            </div>
          </div>
        </form>
      </CardFooter>
    </Card>
  );
}

function EmptyState({
  identity,
  quickPrompts,
  onUsePrompt,
}: {
  identity: PiIdentityProfile;
  quickPrompts: Array<{ label: string; prompt: string }>;
  onUsePrompt: (prompt: string) => void;
}) {
  return (
    <Empty className="border-border/70 bg-background/25 py-12 text-left sm:py-16">
      <EmptyContent className="max-w-none items-start gap-4 text-left">
        <EmptyMedia variant="icon">
          <Bot aria-hidden="true" />
        </EmptyMedia>
        <EmptyHeader className="max-w-xl items-start text-left">
          <Badge variant="outline" className="mb-1">
            {identity.label}
          </Badge>
          <EmptyTitle className="text-base">
            Start with the task, a receipt, or a handoff.
          </EmptyTitle>
          <EmptyDescription>{identity.roleSummary}</EmptyDescription>
          <p className="text-sm text-muted-foreground">{identity.promptHint}</p>
        </EmptyHeader>
        <div className="grid w-full gap-2 sm:grid-cols-3">
          {quickPrompts.map((quickPrompt) => (
            <Button
              key={quickPrompt.label}
              type="button"
              variant="outline"
              className="h-auto items-start justify-start rounded-lg border-border/70 bg-background/42 px-3 py-3 text-left whitespace-normal"
              onClick={() => onUsePrompt(quickPrompt.prompt)}
            >
              <span className="flex flex-col items-start gap-1">
                <span className="text-xs uppercase tracking-[0.08em] text-muted-foreground">
                  {quickPrompt.label}
                </span>
                <span className="text-sm leading-6 text-foreground">
                  {quickPrompt.prompt}
                </span>
              </span>
            </Button>
          ))}
        </div>
      </EmptyContent>
    </Empty>
  );
}

function ConversationPane({
  messages,
  streamingMessage,
  pendingToolCalls,
  activityLog,
  isStreaming,
  activeIdentity,
  quickPrompts,
  onUsePrompt,
  bottomRef,
}: {
  messages: AgentMessage[];
  streamingMessage: AssistantMessageLike | null;
  pendingToolCalls: ReadonlySet<string>;
  activityLog: LocalRuntimeActivity[];
  isStreaming: boolean;
  activeIdentity: PiIdentityProfile;
  quickPrompts: Array<{ label: string; prompt: string }>;
  onUsePrompt: (prompt: string) => void;
  bottomRef: { current: HTMLDivElement | null };
}) {
  return (
    <ScrollArea className="h-[360px] min-h-[360px] w-full sm:h-[440px] lg:h-[520px] xl:h-full">
      <div className="flex min-h-full flex-col gap-4 px-4 py-4">
        {messages.length === 0 && !streamingMessage ? (
          <EmptyState
            identity={activeIdentity}
            quickPrompts={quickPrompts}
            onUsePrompt={onUsePrompt}
          />
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
            isStreaming={isStreaming}
          />
        ) : null}

        {isStreaming && activityLog.length === 0 ? (
          <PendingRuntimeCard />
        ) : null}

        {streamingMessage ? (
          <AssistantBubble
            message={streamingMessage}
            pendingToolCalls={pendingToolCalls}
          />
        ) : null}
        <div ref={bottomRef} />
      </div>
    </ScrollArea>
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
    return (
      <AssistantBubble message={message} pendingToolCalls={pendingToolCalls} />
    );
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
  const textContent = getUserMessageText(message);

  return (
    <div className="flex justify-end">
      <Card
        size="sm"
        className="max-w-[86%] gap-0 bg-primary/10 py-3 ring-primary/15"
      >
        <CardContent className="text-sm leading-6 whitespace-pre-wrap text-foreground">
          {textContent}
        </CardContent>
      </Card>
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
          <Card
            size="sm"
            className="gap-0 bg-background/45 py-3 ring-border/70"
          >
            <CardContent className="flex flex-col gap-3 text-sm leading-6 whitespace-pre-wrap text-foreground">
              {textBlocks.map((block, index) => (
                <p key={`${message.timestamp ?? 0}-text-${index}`}>
                  {block.text}
                </p>
              ))}
            </CardContent>
          </Card>
        ) : null}

        {thinkingBlocks.map((block, index) => (
          <Card
            key={`${message.timestamp ?? 0}-thinking-${index}`}
            size="sm"
            className="gap-0 bg-muted/40 py-3 ring-border/70"
          >
            <CardContent className="flex flex-col gap-2 text-xs leading-5 whitespace-pre-wrap text-muted-foreground">
              <span className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
                Reasoning
              </span>
              <span>{block.thinking}</span>
            </CardContent>
          </Card>
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
    <Card size="sm" className="gap-0 bg-background/45 py-3 ring-border/70">
      <CardContent className="flex flex-col gap-2">
        <div className="flex items-center gap-2 text-sm text-foreground">
          <Wrench className="size-4 text-muted-foreground" />
          <span className="font-medium">{toolCall.name}</span>
          <Badge variant="outline">{isPending ? "running" : "ready"}</Badge>
        </div>
        {toolCall.arguments ? (
          <pre className="overflow-x-auto rounded-lg bg-background/70 px-2 py-2 text-xs leading-5 whitespace-pre-wrap text-muted-foreground">
            {JSON.stringify(toolCall.arguments, null, 2)}
          </pre>
        ) : null}
      </CardContent>
    </Card>
  );
}

function ToolResultBubble({ message }: { message: ToolResultMessageLike }) {
  const textOutput = message.content
    .filter(isToolResultTextBlock)
    .map((block) => block.text)
    .join("\n")
    .trim();

  return (
    <div className="flex justify-start">
      <Card
        size="sm"
        className="max-w-[92%] gap-0 bg-background/45 py-3 ring-border/70"
      >
        <CardContent className="flex flex-col gap-2">
          <div className="flex items-center gap-2 text-sm text-foreground">
            <Wrench className="size-4 text-muted-foreground" />
            <span className="font-medium">{message.toolName}</span>
            <Badge variant={message.isError ? "destructive" : "outline"}>
              {message.isError ? "failed" : "complete"}
            </Badge>
          </div>
          {textOutput ? (
            <pre className="max-h-56 overflow-auto rounded-lg bg-background/70 px-2 py-2 text-xs leading-5 whitespace-pre-wrap text-muted-foreground">
              {textOutput}
            </pre>
          ) : null}
        </CardContent>
      </Card>
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
    <Card size="sm" className="gap-0 bg-background/45 py-3 ring-border/70">
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-center gap-2 text-sm text-foreground">
          <Wrench className="size-4 text-muted-foreground" />
          <span className="font-medium">Tools and MCP</span>
          {isStreaming ? (
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          ) : null}
        </div>

        <div className="flex flex-col gap-3">
          {activities.map((activity) => (
            <div key={activity.id} className="flex flex-col gap-1">
              <div className="flex flex-wrap items-center gap-2 text-sm text-foreground">
                <span>{activity.label}</span>
                <Badge variant="outline">{activity.source}</Badge>
                {activity.server ? (
                  <Badge variant="outline">{activity.server}</Badge>
                ) : null}
                <Badge variant={activity.isError ? "destructive" : "outline"}>
                  {activity.phase === "start"
                    ? "running"
                    : activity.isError
                      ? "failed"
                      : "done"}
                </Badge>
              </div>
              {activity.detail ? (
                <p className="text-xs leading-5 text-muted-foreground">
                  {activity.detail}
                </p>
              ) : null}
              {activity.output ? (
                <pre className="max-h-48 overflow-auto rounded-lg bg-background/70 px-2 py-2 text-[11px] leading-5 whitespace-pre-wrap text-muted-foreground">
                  {activity.output}
                </pre>
              ) : null}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function PendingRuntimeCard() {
  return (
    <Card size="sm" className="gap-0 bg-background/45 py-3 ring-border/70">
      <CardContent className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        <span>Waiting for the local runtime…</span>
      </CardContent>
    </Card>
  );
}

function ChatSurfaceSkeleton({ identityLabel }: { identityLabel: string }) {
  return (
    <Card className="min-h-[760px] gap-0 overflow-hidden bg-card/80">
      <CardHeader className="gap-4 border-b border-border/70 bg-background/35">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{identityLabel}</Badge>
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-5 w-20" />
          </div>
          <Skeleton className="h-4 w-full max-w-xl" />
          <div className="hidden gap-2 sm:flex">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-14 w-[148px]" />
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-3 px-4 py-4">
        <div className="flex items-center justify-center gap-2 py-20 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Connecting to {identityLabel}
        </div>
        <Skeleton className="h-14 w-2/3" />
        <Skeleton className="h-24 w-3/4" />
        <Skeleton className="h-20 w-1/2 self-end" />
      </CardContent>
      <CardFooter className="flex flex-col items-stretch gap-3 border-t border-border/70 bg-background/35">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-28 w-full" />
        <div className="flex justify-end gap-2">
          <Skeleton className="h-8 w-20" />
          <Skeleton className="h-8 w-24" />
        </div>
      </CardFooter>
    </Card>
  );
}

function buildIdentityChipMeta(identity: PiIdentityProfile) {
  const parts = [`${identity.receiptCount} receipts`];
  if (identity.latestReceiptKind) {
    parts.push(identity.latestReceiptKind);
  }
  if (identity.score !== null) {
    parts.push(`program score ${identity.score}`);
  }
  return parts.join(" · ");
}

function getUserMessageText(message: UserLikeMessage) {
  if (typeof message.content === "string") {
    return message.content;
  }

  if (!Array.isArray(message.content)) {
    return "";
  }

  return message.content
    .map((entry) => {
      if (!entry || typeof entry !== "object") {
        return "";
      }

      if (
        "type" in entry &&
        entry.type === "text" &&
        "text" in entry &&
        typeof entry.text === "string"
      ) {
        return entry.text;
      }

      if ("type" in entry && entry.type === "image") {
        return "[image]";
      }

      return "";
    })
    .filter(Boolean)
    .join("\n\n");
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
  const timestamp =
    "timestamp" in message ? String(message.timestamp) : "untimed";
  return `${message.role}-${timestamp}-${index}`;
}

type UserLikeMessage = Extract<
  AgentMessage,
  { role: "user" | "user-with-attachments" }
>;
type AssistantMessageLike = Extract<AgentMessage, { role: "assistant" }>;
type ToolResultMessageLike = Extract<AgentMessage, { role: "toolResult" }>;
type ToolCallBlock = Extract<
  AssistantMessageLike["content"][number],
  { type: "toolCall" }
>;
type ThinkingBlock = Extract<
  AssistantMessageLike["content"][number],
  { type: "thinking" }
>;
type TextBlock = Extract<
  AssistantMessageLike["content"][number],
  { type: "text" }
>;
type ToolResultTextBlock = Extract<
  ToolResultMessageLike["content"][number],
  { type: "text" }
>;

function isUserLikeMessage(
  message: AgentMessage | null | undefined,
): message is UserLikeMessage {
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
