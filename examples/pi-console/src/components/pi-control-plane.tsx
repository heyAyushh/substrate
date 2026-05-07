import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  Bot,
  ChevronRight,
  Play,
  Plus,
  ShieldCheck,
  Sparkles,
  Trash2,
  Zap,
} from "lucide-react";

import type {
  PiAgentSessionRuntimeState,
  PiChatInspectorState,
} from "@/components/pi-agent-session-surface";
import { PiAgentSessionSurface } from "@/components/pi-agent-session-surface";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
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
import { Textarea } from "@/components/ui/textarea";
import type {
  ControlPlaneAgentRecord,
  ControlPlaneWorkspace,
} from "@/lib/pi-control-plane";
import {
  CONTROL_PLANE_PRESETS,
  launchCustomControlPlaneAgent,
  launchPresetControlPlaneAgent,
  loadControlPlaneWorkspace,
  resetControlPlaneWorkspace,
  markControlPlaneAgentLaunchPromptSent,
  persistControlPlaneWorkspace,
  removeControlPlaneAgent,
  setActiveControlPlaneAgent,
  syncControlPlaneWorkspace,
  updateControlPlaneAgentChatState,
} from "@/lib/pi-control-plane";
import type { DashboardSnapshot } from "@/lib/dashboard";
import { truncateMiddle } from "@/lib/dashboard";
import type { PiIdentityProfile, StoredChatState } from "@/lib/pi-identities";
import type { LocalMcpServer } from "@trust-substrate/pi-local-runtime";
import { cn } from "@/lib/utils";

const EMPTY_INSPECTOR_STATE: PiChatInspectorState = {
  mcpServers: [],
  activities: [],
  pendingToolCount: 0,
  isStreaming: false,
};

interface PiControlPlaneProps {
  identityProfiles?: PiIdentityProfile[];
  mcpServers?: LocalMcpServer[];
  runtimeLabel?: string | null;
  slotLabel?: string | null;
  latestReceiptLabel?: string | null;
  receiptCount?: number;
  receiptTimeline?: DashboardSnapshot["receiptTimeline"];
  taskLabel?: string | null;
  rpcLabel?: string | null;
  delegationLabels?: string[];
  startFresh?: boolean;
  onInspectorStateChange?: (state: PiChatInspectorState) => void;
}

export function PiControlPlane({
  identityProfiles = [],
  mcpServers = [],
  runtimeLabel = null,
  slotLabel = null,
  latestReceiptLabel = null,
  receiptCount = 0,
  receiptTimeline = [],
  taskLabel = null,
  rpcLabel = null,
  delegationLabels = [],
  startFresh = false,
  onInspectorStateChange,
}: PiControlPlaneProps) {
  const [workspace, setWorkspace] = useState<ControlPlaneWorkspace>(() =>
    startFresh
      ? resetControlPlaneWorkspace(identityProfiles, receiptCount)
      : loadControlPlaneWorkspace(identityProfiles, {
          launchedAtReceiptCount: receiptCount,
        }),
  );
  const [runtimeStateByAgentId, setRuntimeStateByAgentId] = useState<
    Record<string, PiAgentSessionRuntimeState>
  >({});
  const [isCustomFormOpen, setIsCustomFormOpen] = useState(false);
  const [customLabel, setCustomLabel] = useState("");
  const [customRoleSummary, setCustomRoleSummary] = useState("");
  const [customLaunchPrompt, setCustomLaunchPrompt] = useState("");
  const [customIdentityId, setCustomIdentityId] = useState<string>("none");

  useEffect(() => {
    let cancelled = false;

    queueMicrotask(() => {
      if (cancelled) return;
      setWorkspace((current) =>
        syncControlPlaneWorkspace(current, identityProfiles),
      );
    });

    return () => {
      cancelled = true;
    };
  }, [identityProfiles]);

  useEffect(() => {
    persistControlPlaneWorkspace(workspace);
  }, [workspace]);

  const selectedAgent =
    workspace.agents[workspace.activeAgentId] ??
    workspace.agents[workspace.order[0]];

  const selectedRuntimeState = selectedAgent
    ? (runtimeStateByAgentId[selectedAgent.id] ?? null)
    : null;
  const identityLabelsById = useMemo(
    () =>
      new Map(
        identityProfiles.map((identity) => [identity.id, identity.label]),
      ),
    [identityProfiles],
  );
  const selectedReceiptFeed = useMemo(() => {
    if (!selectedAgent) {
      return [];
    }

    return receiptTimeline.slice(selectedAgent.launchedAtReceiptCount);
  }, [receiptTimeline, selectedAgent]);

  useEffect(() => {
    onInspectorStateChange?.(
      selectedRuntimeState
        ? {
            mcpServers: selectedRuntimeState.mcpServers,
            activities: selectedRuntimeState.activities,
            pendingToolCount: selectedRuntimeState.pendingToolCount,
            isStreaming: selectedRuntimeState.isStreaming,
          }
        : EMPTY_INSPECTOR_STATE,
    );
  }, [onInspectorStateChange, selectedRuntimeState]);

  const launchPreset = useCallback(
    (presetId: "planner" | "executor" | "verifier") => {
      setWorkspace((current) =>
        launchPresetControlPlaneAgent(current, presetId, identityProfiles, {
          launchedAtReceiptCount: receiptCount,
          preferredIdentityId:
            selectedAgent?.identityId ?? identityProfiles[0]?.id ?? null,
        }),
      );
    },
    [identityProfiles, receiptCount, selectedAgent?.identityId],
  );

  const launchCustomAgent = useCallback(() => {
    const nextLabel = customLabel.trim();
    const nextRoleSummary = customRoleSummary.trim();
    const nextLaunchPrompt = customLaunchPrompt.trim();

    if (!nextLabel || !nextRoleSummary || !nextLaunchPrompt) {
      return;
    }

    setWorkspace((current) =>
      launchCustomControlPlaneAgent(current, {
        label: nextLabel,
        roleSummary: nextRoleSummary,
        launchPrompt: nextLaunchPrompt,
        identityId: customIdentityId === "none" ? null : customIdentityId,
        launchedAtReceiptCount: receiptCount,
      }),
    );
    setCustomLabel("");
    setCustomRoleSummary("");
    setCustomLaunchPrompt("");
    setCustomIdentityId("none");
    setIsCustomFormOpen(false);
  }, [
    customIdentityId,
    customLabel,
    customLaunchPrompt,
    customRoleSummary,
    receiptCount,
  ]);

  const updateAgentChatState = useCallback(
    (sessionId: string, chat: StoredChatState) => {
      setWorkspace((current) =>
        updateControlPlaneAgentChatState(current, sessionId, chat),
      );
    },
    [],
  );

  const updateRuntimeState = useCallback(
    (sessionId: string, state: PiAgentSessionRuntimeState) => {
      setRuntimeStateByAgentId((current) => ({
        ...current,
        [sessionId]: state,
      }));
    },
    [],
  );

  const handleLaunchPromptSent = useCallback((sessionId: string) => {
    setWorkspace((current) =>
      markControlPlaneAgentLaunchPromptSent(current, sessionId),
    );
  }, []);

  return (
    <div className="h-full min-h-[760px] xl:min-h-0">
      <div className="grid h-full min-h-[760px] gap-4 xl:min-h-0 xl:grid-cols-[320px_minmax(0,1fr)]">
        <div className="min-w-0">
          <ControlPlaneBoard
            workspace={workspace}
            runtimeStateByAgentId={runtimeStateByAgentId}
            identityLabelsById={identityLabelsById}
            onSelectAgent={(agentId) => {
              setWorkspace((current) =>
                setActiveControlPlaneAgent(current, agentId),
              );
            }}
            onRemoveAgent={(agentId) => {
              setWorkspace((current) =>
                removeControlPlaneAgent(current, agentId, identityProfiles),
              );
            }}
            onLaunchPlanner={() => launchPreset("planner")}
            onLaunchExecutor={() => launchPreset("executor")}
            onLaunchVerifier={() => launchPreset("verifier")}
            isCustomFormOpen={isCustomFormOpen}
            onToggleCustomForm={() =>
              setIsCustomFormOpen((current) => !current)
            }
            customLabel={customLabel}
            onCustomLabelChange={setCustomLabel}
            customRoleSummary={customRoleSummary}
            onCustomRoleSummaryChange={setCustomRoleSummary}
            customLaunchPrompt={customLaunchPrompt}
            onCustomLaunchPromptChange={setCustomLaunchPrompt}
            customIdentityId={customIdentityId}
            onCustomIdentityIdChange={setCustomIdentityId}
            identityProfiles={identityProfiles}
            onLaunchCustomAgent={launchCustomAgent}
          />
        </div>

        <div className="min-w-0">
          <div className="flex h-full min-h-[760px] flex-col gap-4 xl:min-h-0">
            {selectedAgent ? (
              <>
                <div className="min-h-0 flex-1">
                  {workspace.order.map((agentId) => {
                    const agentSession = workspace.agents[agentId];
                    if (!agentSession) {
                      return null;
                    }

                    const boundIdentity = agentSession.identityId
                      ? identityProfiles.find(
                          (identity) => identity.id === agentSession.identityId,
                        )
                      : undefined;

                    return (
                      <div
                        key={agentSession.id}
                        className={cn(
                          agentSession.id === selectedAgent.id
                            ? "h-full"
                            : "hidden",
                        )}
                      >
                        <PiAgentSessionSurface
                          session={agentSession}
                          identityProfiles={
                            boundIdentity ? [boundIdentity] : []
                          }
                          mcpServers={mcpServers}
                          runtimeLabel={runtimeLabel}
                          slotLabel={slotLabel}
                          latestReceiptLabel={latestReceiptLabel}
                          receiptCount={receiptCount}
                          taskLabel={taskLabel}
                          rpcLabel={rpcLabel}
                          delegationLabels={delegationLabels}
                          onChatStateChange={updateAgentChatState}
                          onRuntimeStateChange={updateRuntimeState}
                          onLaunchPromptSent={handleLaunchPromptSent}
                        />
                      </div>
                    );
                  })}
                </div>

                <ChainFeedCard
                  session={selectedAgent}
                  receipts={selectedReceiptFeed}
                  identityLabelsById={identityLabelsById}
                />
              </>
            ) : (
              <Card className="h-full min-h-[420px] bg-card/72 supports-[backdrop-filter]:backdrop-blur-xl">
                <CardContent className="flex h-full items-center justify-center">
                  <Empty className="border-border/70 bg-background/25 py-12 text-left">
                    <EmptyContent className="max-w-md items-start gap-4 text-left">
                      <EmptyMedia variant="icon">
                        <Bot aria-hidden="true" />
                      </EmptyMedia>
                      <EmptyHeader className="items-start text-left">
                        <EmptyTitle>No active agent</EmptyTitle>
                        <EmptyDescription>
                          Launch a planner, executor, verifier, or custom worker
                          to start the control plane.
                        </EmptyDescription>
                      </EmptyHeader>
                    </EmptyContent>
                  </Empty>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ControlPlaneBoard({
  workspace,
  runtimeStateByAgentId,
  identityLabelsById,
  onSelectAgent,
  onRemoveAgent,
  onLaunchPlanner,
  onLaunchExecutor,
  onLaunchVerifier,
  isCustomFormOpen,
  onToggleCustomForm,
  customLabel,
  onCustomLabelChange,
  customRoleSummary,
  onCustomRoleSummaryChange,
  customLaunchPrompt,
  onCustomLaunchPromptChange,
  customIdentityId,
  onCustomIdentityIdChange,
  identityProfiles,
  onLaunchCustomAgent,
}: {
  workspace: ControlPlaneWorkspace;
  runtimeStateByAgentId: Record<string, PiAgentSessionRuntimeState>;
  identityLabelsById: Map<string, string>;
  onSelectAgent: (agentId: string) => void;
  onRemoveAgent: (agentId: string) => void;
  onLaunchPlanner: () => void;
  onLaunchExecutor: () => void;
  onLaunchVerifier: () => void;
  isCustomFormOpen: boolean;
  onToggleCustomForm: () => void;
  customLabel: string;
  onCustomLabelChange: (value: string) => void;
  customRoleSummary: string;
  onCustomRoleSummaryChange: (value: string) => void;
  customLaunchPrompt: string;
  onCustomLaunchPromptChange: (value: string) => void;
  customIdentityId: string;
  onCustomIdentityIdChange: (value: string) => void;
  identityProfiles: PiIdentityProfile[];
  onLaunchCustomAgent: () => void;
}) {
  return (
    <Card className="h-full min-h-[760px] gap-0 overflow-hidden bg-card/72 supports-[backdrop-filter]:backdrop-blur-xl xl:min-h-0">
      <CardHeader className="gap-4 border-b border-border/70 bg-background/28">
        <div className="space-y-1">
          <CardTitle className="text-base font-medium">Control plane</CardTitle>
          <CardDescription>
            Prepare workers, keep their sessions mounted, and send prompts only
            when you explicitly choose to spend a model call.
          </CardDescription>
        </div>

        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
          <PresetLaunchButton
            icon={<Sparkles aria-hidden="true" />}
            label={
              CONTROL_PLANE_PRESETS.find((preset) => preset.id === "planner")!
                .label
            }
            description="Summarize the live state and pick the next move."
            onClick={onLaunchPlanner}
          />
          <PresetLaunchButton
            icon={<Zap aria-hidden="true" />}
            label={
              CONTROL_PLANE_PRESETS.find((preset) => preset.id === "executor")!
                .label
            }
            description="Drive the next transaction-ready step."
            onClick={onLaunchExecutor}
          />
          <PresetLaunchButton
            icon={<ShieldCheck aria-hidden="true" />}
            label={
              CONTROL_PLANE_PRESETS.find((preset) => preset.id === "verifier")!
                .label
            }
            description="Watch receipts and delegation for risk."
            onClick={onLaunchVerifier}
          />
          <PresetLaunchButton
            icon={<Plus aria-hidden="true" />}
            label="Custom"
            description="Prepare a worker with your own role and prompt."
            onClick={onToggleCustomForm}
          />
        </div>

        {isCustomFormOpen ? (
          <div className="grid gap-3 rounded-lg border border-border/70 bg-background/34 p-3">
            <label className="grid gap-2 text-sm">
              <span className="text-xs uppercase tracking-[0.08em] text-muted-foreground">
                Session label
              </span>
              <input
                value={customLabel}
                onChange={(event) => onCustomLabelChange(event.target.value)}
                placeholder="Arb worker"
                className="h-10 rounded-lg border border-border/70 bg-background/42 px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              />
            </label>

            <label className="grid gap-2 text-sm">
              <span className="text-xs uppercase tracking-[0.08em] text-muted-foreground">
                Role summary
              </span>
              <Textarea
                value={customRoleSummary}
                onChange={(event) =>
                  onCustomRoleSummaryChange(event.target.value)
                }
                placeholder="Monitor the task, look for transaction opportunities, and call out risks."
                rows={3}
                className="min-h-[88px] rounded-lg border-border/70 bg-background/42"
              />
            </label>

            <label className="grid gap-2 text-sm">
              <span className="text-xs uppercase tracking-[0.08em] text-muted-foreground">
                Launch prompt
              </span>
              <Textarea
                value={customLaunchPrompt}
                onChange={(event) =>
                  onCustomLaunchPromptChange(event.target.value)
                }
                placeholder="Review the live state and describe the next execution-ready move."
                rows={4}
                className="min-h-[108px] rounded-lg border-border/70 bg-background/42"
              />
            </label>

            <div className="grid gap-2">
              <span className="text-xs uppercase tracking-[0.08em] text-muted-foreground">
                Bound identity
              </span>
              <Select
                value={customIdentityId}
                onValueChange={onCustomIdentityIdChange}
              >
                <SelectTrigger className="border-border/70 bg-background/42">
                  <SelectValue placeholder="Optional identity" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="none">No identity binding</SelectItem>
                    {identityProfiles.map((identity) => (
                      <SelectItem key={identity.id} value={identity.id}>
                        {identity.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onToggleCustomForm}
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={onLaunchCustomAgent}
                disabled={
                  customLabel.trim().length === 0 ||
                  customRoleSummary.trim().length === 0 ||
                  customLaunchPrompt.trim().length === 0
                }
              >
                Prepare custom
              </Button>
            </div>
          </div>
        ) : null}
      </CardHeader>

      <CardContent className="min-h-0 flex-1 px-0 pb-0 pt-0">
        <ScrollArea className="h-full">
          <div className="flex flex-col gap-3 px-3 py-3">
            {workspace.order.map((agentId) => {
              const agent = workspace.agents[agentId];
              if (!agent) {
                return null;
              }

              const runtimeState = runtimeStateByAgentId[agent.id];
              const status = deriveAgentStatus(runtimeState);

              return (
                <div
                  key={agent.id}
                  className={cn(
                    "flex flex-col gap-3 rounded-lg border p-3",
                    workspace.activeAgentId === agent.id
                      ? "border-border bg-background/70"
                      : "border-border/70 bg-background/24 hover:bg-muted/45",
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <button
                      type="button"
                      className="flex flex-1 flex-col gap-1 rounded-md text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                      onClick={() => onSelectAgent(agent.id)}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium text-foreground">
                          {agent.label}
                        </span>
                        <Badge variant="outline">{agent.roleLabel}</Badge>
                        <Badge variant={status.variant}>{status.label}</Badge>
                      </div>
                      <p className="text-xs leading-5 text-muted-foreground">
                        {agent.roleSummary}
                      </p>
                    </button>

                    {workspace.order.length > 1 ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="shrink-0 rounded-md"
                        onClick={(event) => {
                          event.stopPropagation();
                          onRemoveAgent(agent.id);
                        }}
                        aria-label={`Remove ${agent.label}`}
                      >
                        <Trash2 aria-hidden="true" />
                      </Button>
                    ) : null}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    {agent.identityId ? (
                      <span>
                        {identityLabelsById.get(agent.identityId) ??
                          truncateMiddle(agent.identityId)}
                      </span>
                    ) : (
                      <span>Unbound</span>
                    )}
                    <span>/</span>
                    <span>
                      {runtimeState?.latestActivityLabel ?? "Waiting for work"}
                    </span>
                    <span>/</span>
                    <span>
                      +
                      {Math.max(
                        0,
                        runtimeState ? runtimeState.activities.length : 0,
                      )}{" "}
                      runtime events
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

function PresetLaunchButton({
  icon,
  label,
  description,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      className="h-auto items-start justify-between gap-3 rounded-lg border-border/70 bg-background/42 px-3 py-3 text-left whitespace-normal"
      onClick={onClick}
    >
      <span className="flex items-start gap-3">
        <span className="mt-0.5 text-muted-foreground">{icon}</span>
        <span className="flex flex-col gap-1">
          <span className="text-sm font-medium text-foreground">{label}</span>
          <span className="text-xs leading-5 text-muted-foreground">
            {description}
          </span>
        </span>
      </span>
      <ChevronRight
        className="mt-0.5 size-4 shrink-0 text-muted-foreground"
        aria-hidden="true"
      />
    </Button>
  );
}

function ChainFeedCard({
  session,
  receipts,
  identityLabelsById,
}: {
  session: ControlPlaneAgentRecord;
  receipts: DashboardSnapshot["receiptTimeline"];
  identityLabelsById: Map<string, string>;
}) {
  return (
    <Card className="bg-card/72 supports-[backdrop-filter]:backdrop-blur-xl">
      <CardHeader className="gap-2">
        <div className="flex items-center gap-2">
          <CardTitle className="text-base font-medium">
            Live chain tape
          </CardTitle>
          <Badge variant="outline">{receipts.length} since launch</Badge>
        </div>
        <CardDescription>
          Receipt movement that landed after {session.label} launched.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {receipts.length > 0 ? (
          <div className="grid gap-3">
            {receipts
              .slice(-6)
              .reverse()
              .map((receipt) => (
                <div
                  key={receipt.receiptId}
                  className="grid gap-1 rounded-lg border border-border/70 bg-background/34 px-3 py-3"
                >
                  <div className="flex flex-wrap items-center gap-2 text-sm text-foreground">
                    <span className="font-medium">{receipt.kind}</span>
                    <Badge variant="outline">{`slot ${receipt.slot.toLocaleString()}`}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {identityLabelsById.get(receipt.actor) ??
                      truncateMiddle(receipt.actor)}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {truncateMiddle(receipt.receiptId, 14, 12)}
                  </p>
                </div>
              ))}
          </div>
        ) : (
          <Empty className="border-border/70 bg-background/25 py-10 text-left">
            <EmptyContent className="items-start gap-3 text-left">
              <EmptyMedia variant="icon">
                <Play aria-hidden="true" />
              </EmptyMedia>
              <EmptyHeader className="items-start text-left">
                <EmptyTitle>No new receipts yet</EmptyTitle>
                <EmptyDescription>
                  Once new chain activity lands after this agent launches, it
                  will show up here in order.
                </EmptyDescription>
              </EmptyHeader>
            </EmptyContent>
          </Empty>
        )}
      </CardContent>
    </Card>
  );
}

function deriveAgentStatus(
  runtimeState: PiAgentSessionRuntimeState | undefined,
) {
  if (!runtimeState) {
    return {
      label: "booting",
      variant: "outline" as const,
    };
  }

  if (runtimeState.startupError || runtimeState.errorMessage) {
    return {
      label: "failed",
      variant: "destructive" as const,
    };
  }

  if (runtimeState.isStreaming && runtimeState.pendingToolCount > 0) {
    return {
      label: "using tools",
      variant: "secondary" as const,
    };
  }

  if (runtimeState.isStreaming) {
    return {
      label: "thinking",
      variant: "secondary" as const,
    };
  }

  if (!runtimeState.isReady) {
    return {
      label: "booting",
      variant: "outline" as const,
    };
  }

  return {
    label: "ready",
    variant: "outline" as const,
  };
}
