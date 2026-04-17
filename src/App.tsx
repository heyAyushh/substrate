import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Activity,
  AlertCircle,
  ArrowUpRight,
  FileText,
  Link2,
  Trophy,
  Wrench,
} from "lucide-react";

import {
  PiChatSurface,
  type PiChatInspectorState,
} from "@/components/pi-chat-surface";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  type DashboardSnapshot,
  DEFAULT_SNAPSHOT_URL,
  DEFAULT_STUDIO_ACCOUNTS_URL,
  DEFAULT_STUDIO_SCENARIOS_URL,
  DEFAULT_STUDIO_URL,
  formatLamports,
  formatTimestamp,
  loadDashboardSnapshot,
  loadSurfpoolStudioLinks,
  loadSurfpoolStatus,
  SNAPSHOT_POLL_INTERVAL_MS,
  type SurfpoolStatus,
  SURFPOOL_STUDIO_LINK_POLL_INTERVAL_MS,
  type SurfpoolStudioLinks,
  truncateMiddle,
} from "@/lib/dashboard";
import type { PiIdentityProfile } from "@/lib/pi-identities";
import {
  getDefaultRuntimeLabel,
  loadLocalRuntimeConfig,
  type LocalMcpServer,
  type LocalRuntimeActivity,
  type LocalRuntimeConfig,
} from "@/lib/local-runtime";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const EMPTY_MCP_SERVERS: LocalMcpServer[] = [];
const EMPTY_RUNTIME_ACTIVITY: LocalRuntimeActivity[] = [];
const EMPTY_INSPECTOR_STATE: PiChatInspectorState = {
  mcpServers: EMPTY_MCP_SERVERS,
  activities: EMPTY_RUNTIME_ACTIVITY,
  pendingToolCount: 0,
  isStreaming: false,
};

function App() {
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(null);
  const [snapshotError, setSnapshotError] = useState<string | null>(null);
  const [snapshotUpdatedAt, setSnapshotUpdatedAt] = useState<number | null>(
    null,
  );
  const [surfpoolStatus, setSurfpoolStatus] = useState<SurfpoolStatus | null>(
    null,
  );
  const [studioLinks, setStudioLinks] = useState<SurfpoolStudioLinks>({
    studio: {
      href: DEFAULT_STUDIO_URL,
      available: false,
    },
    accounts: {
      href: DEFAULT_STUDIO_ACCOUNTS_URL,
      available: false,
    },
    scenarios: {
      href: DEFAULT_STUDIO_SCENARIOS_URL,
      available: false,
    },
  });
  const [runtime, setRuntime] = useState<LocalRuntimeConfig | null>(null);
  const [chatInspector, setChatInspector] =
    useState<PiChatInspectorState>(EMPTY_INSPECTOR_STATE);

  useEffect(() => {
    let isActive = true;
    let timerId: number | undefined;

    const refreshSnapshot = async () => {
      try {
        const nextSnapshot = await loadDashboardSnapshot();
        if (!isActive) {
          return;
        }
        setSnapshot(nextSnapshot);
        setSnapshotError(null);
        setSnapshotUpdatedAt(Date.now());
      } catch (error) {
        if (!isActive) {
          return;
        }
        setSnapshotError(
          error instanceof Error ? error.message : "Snapshot unavailable",
        );
      } finally {
        if (isActive) {
          timerId = window.setTimeout(
            refreshSnapshot,
            SNAPSHOT_POLL_INTERVAL_MS,
          );
        }
      }
    };

    void refreshSnapshot();

    return () => {
      isActive = false;
      if (timerId !== undefined) {
        window.clearTimeout(timerId);
      }
    };
  }, []);

  useEffect(() => {
    let isActive = true;

    const refreshRuntime = async () => {
      const nextRuntime = await loadLocalRuntimeConfig();
      if (!isActive) {
        return;
      }
      setRuntime(nextRuntime);
    };

    void refreshRuntime();

    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    let isActive = true;
    let timerId: number | undefined;

    const refreshStudioLinks = async () => {
      const nextLinks = await loadSurfpoolStudioLinks();
      if (!isActive) {
        return;
      }
      setStudioLinks(nextLinks);
      timerId = window.setTimeout(
        refreshStudioLinks,
        SURFPOOL_STUDIO_LINK_POLL_INTERVAL_MS,
      );
    };

    void refreshStudioLinks();

    return () => {
      isActive = false;
      if (timerId !== undefined) {
        window.clearTimeout(timerId);
      }
    };
  }, []);

  const runtimeLabel = runtime ? getDefaultRuntimeLabel(runtime) : null;
  const runtimeMcpServers = useMemo(
    () => runtime?.mcpServers ?? EMPTY_MCP_SERVERS,
    [runtime],
  );

  useEffect(() => {
    let isActive = true;
    let timerId: number | undefined;

    const refreshStatus = async () => {
      const nextStatus = await loadSurfpoolStatus();
      if (!isActive) {
        return;
      }
      setSurfpoolStatus(nextStatus);
      timerId = window.setTimeout(refreshStatus, nextStatus.pollIntervalMs);
    };

    void refreshStatus();

    return () => {
      isActive = false;
      if (timerId !== undefined) {
        window.clearTimeout(timerId);
      }
    };
  }, []);

  const identityLabelsById = useMemo(() => {
    if (!snapshot) {
      return new Map<string, string>();
    }

    return new Map(
      Object.entries(snapshot.identities).map(([label, identityId]) => [
        identityId,
        label,
      ]),
    );
  }, [snapshot]);

  const leadEntry = snapshot?.leaderboard.all[0] ?? null;
  const latestReceipt =
    snapshot && snapshot.receiptTimeline.length > 0
      ? snapshot.receiptTimeline[snapshot.receiptTimeline.length - 1]
      : null;
  const totalSlashedLamports = snapshot
    ? Object.values(snapshot.stake).reduce(
        (sum, entry) => sum + Number(entry.slashedLamports),
        0,
      )
    : 0;
  const latestReceiptLabel = latestReceipt
    ? `${latestReceipt.kind} · ${identityLabelsById.get(latestReceipt.actor) ?? truncateMiddle(latestReceipt.actor)}`
    : null;
  const chainLabels = snapshot
    ? snapshot.delegationChain.map((entry) => {
        return `${identityLabelsById.get(entry.delegatorId) ?? truncateMiddle(entry.delegatorId)} -> ${identityLabelsById.get(entry.delegateId) ?? truncateMiddle(entry.delegateId)}`;
      })
    : [];
  const identityProfiles = useMemo(
    () => buildIdentityProfiles(snapshot, identityLabelsById),
    [identityLabelsById, snapshot],
  );

  const headerLinks = [
    {
      href: DEFAULT_SNAPSHOT_URL,
      label: "Snapshot JSON",
      available: true,
    },
    {
      href: studioLinks.studio.href,
      label: "Studio",
      available: studioLinks.studio.available,
    },
    {
      href: studioLinks.accounts.href,
      label: "Accounts",
      available: studioLinks.accounts.available,
    },
    {
      href: studioLinks.scenarios.href,
      label: "Scenarios",
      available: studioLinks.scenarios.available,
    },
  ].filter((link) => link.available) as Array<{
    href: string;
    label: string;
    available: boolean;
  }>;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex max-w-[1480px] flex-col gap-4 px-4 py-4 lg:px-6 lg:py-6">
        <header className="flex flex-col gap-4 border-b border-border/60 pb-4">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="flex min-w-0 flex-1 flex-col gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-foreground/88">
                  Pi Console
                </span>
                {runtimeLabel ? (
                  <Badge variant="outline">{runtimeLabel}</Badge>
                ) : null}
                {surfpoolStatus ? (
                  <Badge
                    variant={
                      surfpoolStatus.status === "online"
                        ? "secondary"
                        : "destructive"
                    }
                  >
                    {surfpoolStatus.status === "online"
                      ? "RPC online"
                      : "RPC offline"}
                  </Badge>
                ) : null}
                {snapshotUpdatedAt ? (
                  <Badge variant="outline">
                    {formatTimestamp(snapshotUpdatedAt)}
                  </Badge>
                ) : null}
              </div>

              <div className="min-w-0">
                <h1 className="truncate text-lg font-medium tracking-tight text-foreground sm:text-xl">
                  {snapshot
                    ? truncateMiddle(snapshot.task, 18, 12)
                    : "Loading task"}
                </h1>
                {snapshotError ? (
                  <p className="mt-1 text-sm text-muted-foreground">
                    Snapshot unavailable. The console will keep retrying.
                  </p>
                ) : null}
              </div>

              {surfpoolStatus?.status === "offline" ? (
                <Alert variant="destructive" className="max-w-2xl">
                  <AlertCircle aria-hidden="true" />
                  <AlertTitle>Surfpool is offline</AlertTitle>
                  <AlertDescription>
                    {surfpoolStatus.errorLabel ?? "The RPC could not be reached."}
                  </AlertDescription>
                </Alert>
              ) : null}
            </div>

            <div className="flex flex-wrap gap-2">
              {headerLinks.map((link) => (
                <Button
                  key={link.label}
                  asChild
                  size="sm"
                  variant="ghost"
                >
                  <a href={link.href} target="_blank" rel="noreferrer">
                    {link.label}
                    <ArrowUpRight data-icon="inline-end" aria-hidden="true" />
                  </a>
                </Button>
              ))}
            </div>
          </div>
        </header>

        <main className="grid gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(320px,392px)]">
          <section className="min-w-0 xl:min-h-[calc(100vh-9rem)]">
            <PiChatSurface
              identityProfiles={identityProfiles}
              mcpServers={runtimeMcpServers}
              runtimeLabel={runtimeLabel}
              slotLabel={surfpoolStatus?.slotLabel ?? null}
              latestReceiptLabel={latestReceiptLabel}
              receiptCount={snapshot?.receiptTimeline.length ?? 0}
              taskLabel={snapshot?.task ?? null}
              rpcLabel={
                surfpoolStatus?.status === "online"
                  ? `${surfpoolStatus.healthLabel} · ${surfpoolStatus.slotLabel}`
                  : surfpoolStatus?.errorLabel ?? null
              }
              delegationLabels={chainLabels}
              onInspectorStateChange={setChatInspector}
            />
          </section>

          <aside className="min-w-0 xl:min-h-[calc(100vh-9rem)]">
            <InspectorPanel
              leadEntry={leadEntry}
              latestReceipt={latestReceipt}
              identityLabelsById={identityLabelsById}
              totalSlashedLamports={totalSlashedLamports}
              snapshot={snapshot}
              surfpoolStatus={surfpoolStatus}
              snapshotUpdatedAt={snapshotUpdatedAt}
              chainLabels={chainLabels}
              snapshotError={snapshotError}
              inspectorState={chatInspector}
              fallbackMcpServers={runtimeMcpServers}
            />
          </aside>
        </main>
      </div>
    </div>
  );
}

function InspectorPanel({
  leadEntry,
  latestReceipt,
  identityLabelsById,
  totalSlashedLamports,
  snapshot,
  surfpoolStatus,
  snapshotUpdatedAt,
  chainLabels,
  snapshotError,
  inspectorState,
  fallbackMcpServers,
}: {
  leadEntry: DashboardSnapshot["leaderboard"]["all"][number] | null;
  latestReceipt: DashboardSnapshot["receiptTimeline"][number] | null;
  identityLabelsById: Map<string, string>;
  totalSlashedLamports: number;
  snapshot: DashboardSnapshot | null;
  surfpoolStatus: SurfpoolStatus | null;
  snapshotUpdatedAt: number | null;
  chainLabels: string[];
  snapshotError: string | null;
  inspectorState: PiChatInspectorState;
  fallbackMcpServers: LocalMcpServer[];
}) {
  const [copiedReceiptId, setCopiedReceiptId] = useState<string | null>(null);
  const mcpServers =
    inspectorState.mcpServers.length > 0
      ? inspectorState.mcpServers
      : fallbackMcpServers;

  const copyReceiptId = async (receiptId: string) => {
    try {
      await navigator.clipboard.writeText(receiptId);
      setCopiedReceiptId(receiptId);
      window.setTimeout(() => {
        setCopiedReceiptId((current) =>
          current === receiptId ? null : current,
        );
      }, 1400);
    } catch {
      setCopiedReceiptId(null);
    }
  };

  return (
    <Card className="h-full min-h-[420px] gap-0 overflow-hidden bg-card/72 supports-[backdrop-filter]:backdrop-blur-xl xl:min-h-0">
      <Tabs defaultValue="run" className="flex h-full flex-col gap-0">
        <CardHeader className="gap-3 border-b border-border/70 bg-background/28">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <CardTitle className="text-base font-medium">Inspector</CardTitle>
              <CardDescription>
                Run state, delegation, receipts, and MCP.
              </CardDescription>
            </div>
            <Badge variant="outline">
              {snapshot
                ? `${snapshot.receiptTimeline.length} receipts`
                : "Waiting"}
            </Badge>
          </div>
          <TabsList
            variant="line"
            className="w-full justify-start overflow-x-auto pb-1"
          >
            <TabsTrigger value="run">Run</TabsTrigger>
            <TabsTrigger value="delegation">Delegation</TabsTrigger>
            <TabsTrigger value="receipts">Receipts</TabsTrigger>
            <TabsTrigger value="mcp">MCP</TabsTrigger>
          </TabsList>
        </CardHeader>
        <CardContent className="min-h-0 flex-1 px-0 pb-0 pt-0">
          <TabsContent value="run" className="mt-0 h-full">
            <InspectorScrollArea>
              {snapshot ? (
                <div className="flex flex-col gap-3 pr-1">
                  <InspectorStatRow
                    icon={<FileText aria-hidden="true" />}
                    label="Task"
                    value={truncateMiddle(snapshot.task, 24, 16)}
                  />
                  <InspectorStatRow
                    icon={<Trophy aria-hidden="true" />}
                    label="Lead"
                    value={
                      leadEntry
                        ? `${identityLabelsById.get(leadEntry.agentId) ?? truncateMiddle(leadEntry.agentId)} · ${leadEntry.score}`
                        : "Unavailable"
                    }
                  />
                  <InspectorStatRow
                    icon={<FileText aria-hidden="true" />}
                    label="Latest receipt"
                    value={
                      latestReceipt
                        ? `${latestReceipt.kind} · ${identityLabelsById.get(latestReceipt.actor) ?? truncateMiddle(latestReceipt.actor)}`
                        : "Unavailable"
                    }
                  />
                  <InspectorStatRow
                    icon={<AlertCircle aria-hidden="true" />}
                    label="Slashed"
                    value={formatLamports(totalSlashedLamports)}
                  />
                  <InspectorStatRow
                    icon={<Activity aria-hidden="true" />}
                    label="RPC"
                    value={
                      surfpoolStatus?.status === "online"
                        ? `${surfpoolStatus.healthLabel} · ${surfpoolStatus.slotLabel}`
                        : surfpoolStatus?.errorLabel ?? "Unavailable"
                    }
                  />
                  <InspectorStatRow
                    icon={<FileText aria-hidden="true" />}
                    label="Snapshot"
                    value={
                      snapshotUpdatedAt
                        ? `Updated ${formatTimestamp(snapshotUpdatedAt)}`
                        : "Waiting for the first poll"
                    }
                  />
                </div>
              ) : snapshotError ? (
                <Alert variant="destructive">
                  <AlertCircle aria-hidden="true" />
                  <AlertTitle>Snapshot unavailable</AlertTitle>
                  <AlertDescription>{snapshotError}</AlertDescription>
                </Alert>
              ) : (
                <div className="flex flex-col gap-3">
                  {Array.from({ length: 6 }).map((_, index) => (
                    <Skeleton key={index} className="h-14 w-full" />
                  ))}
                </div>
              )}
            </InspectorScrollArea>
          </TabsContent>

          <TabsContent value="delegation" className="mt-0 h-full">
            <InspectorScrollArea>
              {chainLabels.length > 0 ? (
                <div className="flex flex-col gap-2 pr-1">
                  {chainLabels.map((entry) => (
                    <div
                      key={entry}
                      className="flex items-start gap-3 rounded-lg border border-border/70 bg-background/32 px-3 py-3"
                    >
                      <Link2 className="mt-0.5 size-4 text-muted-foreground" />
                      <span className="min-w-0 text-sm leading-6 text-foreground">
                        {entry}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <Empty className="border-border/70 bg-background/28 py-10">
                  <EmptyContent>
                    <EmptyMedia variant="icon">
                      <Link2 aria-hidden="true" />
                    </EmptyMedia>
                    <EmptyHeader>
                      <EmptyTitle>No delegation chain</EmptyTitle>
                      <EmptyDescription>
                        Delegation will appear here when the snapshot lands.
                      </EmptyDescription>
                    </EmptyHeader>
                  </EmptyContent>
                </Empty>
              )}
            </InspectorScrollArea>
          </TabsContent>

          <TabsContent value="receipts" className="mt-0 h-full">
            <InspectorScrollArea>
              {snapshot ? (
                <div className="flex flex-col gap-2 pr-1">
                  {snapshot.receiptTimeline.map((entry) => (
                    <div
                      key={entry.receiptId}
                      className="flex items-start justify-between gap-3 rounded-lg border border-border/70 bg-background/32 px-3 py-3"
                    >
                      <div className="min-w-0 space-y-1">
                        <p className="text-sm font-medium text-foreground">
                          {entry.kind}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {identityLabelsById.get(entry.actor) ??
                            truncateMiddle(entry.actor)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          slot {entry.slot}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {entry.receiptId}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => void copyReceiptId(entry.receiptId)}
                      >
                        {copiedReceiptId === entry.receiptId
                          ? "Copied"
                          : "Copy ID"}
                      </Button>
                    </div>
                  ))}
                </div>
              ) : snapshotError ? (
                <Alert variant="destructive">
                  <AlertCircle aria-hidden="true" />
                  <AlertTitle>Snapshot unavailable</AlertTitle>
                  <AlertDescription>{snapshotError}</AlertDescription>
                </Alert>
              ) : (
                <div className="flex flex-col gap-3">
                  {Array.from({ length: 6 }).map((_, index) => (
                    <Skeleton key={index} className="h-16 w-full" />
                  ))}
                </div>
              )}
            </InspectorScrollArea>
          </TabsContent>

          <TabsContent value="mcp" className="mt-0 h-full">
            <InspectorScrollArea>
              <div className="flex flex-col gap-4 pr-1">
                <div className="flex items-center justify-between gap-3 rounded-lg border border-border/70 bg-background/32 px-3 py-3">
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-foreground">
                      Local runtime
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {inspectorState.pendingToolCount > 0
                        ? `${inspectorState.pendingToolCount} tools running`
                        : "Idle"}
                    </p>
                  </div>
                  <Badge variant="outline">
                    {inspectorState.isStreaming ? "live" : "ready"}
                  </Badge>
                </div>

                <Separator />

                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Wrench className="size-4 text-muted-foreground" />
                    <span className="text-sm font-medium text-foreground">
                      Configured MCP servers
                    </span>
                  </div>
                  {mcpServers.length > 0 ? (
                    <div className="flex flex-col gap-2">
                      {mcpServers.map((server) => (
                        <div
                          key={`${server.transport}-${server.name}`}
                          className="rounded-lg border border-border/70 bg-background/32 px-3 py-3"
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-medium text-foreground">
                              {server.name}
                            </span>
                            <Badge variant="outline">{server.transport}</Badge>
                            <Badge
                              variant={
                                server.auth === "OAuth"
                                  ? "secondary"
                                  : "outline"
                              }
                            >
                              {server.auth}
                            </Badge>
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {server.target}
                          </p>
                          <p className="mt-1 text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
                            {server.status}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <Empty className="border-border/70 bg-background/28 py-8">
                      <EmptyContent>
                        <EmptyHeader>
                          <EmptyTitle>No MCP servers</EmptyTitle>
                          <EmptyDescription>
                            Add MCP servers in Codex to surface them here.
                          </EmptyDescription>
                        </EmptyHeader>
                      </EmptyContent>
                    </Empty>
                  )}
                </div>

                <Separator />

                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Activity className="size-4 text-muted-foreground" />
                    <span className="text-sm font-medium text-foreground">
                      Local runtime activity
                    </span>
                  </div>
                  {inspectorState.activities.length > 0 ? (
                    <div className="flex flex-col gap-2">
                      {inspectorState.activities.map((activity) => (
                        <div
                          key={activity.id}
                          className="rounded-lg border border-border/70 bg-background/32 px-3 py-3"
                        >
                          <div className="flex flex-wrap items-center gap-2 text-sm text-foreground">
                            <span>{activity.label}</span>
                            <Badge variant="outline">{activity.source}</Badge>
                            {activity.server ? (
                              <Badge variant="outline">{activity.server}</Badge>
                            ) : null}
                            <Badge
                              variant={
                                activity.isError ? "destructive" : "outline"
                              }
                            >
                              {activity.phase === "start"
                                ? "running"
                                : activity.isError
                                  ? "failed"
                                  : "done"}
                            </Badge>
                          </div>
                          {activity.detail ? (
                            <p className="mt-1 text-xs leading-5 text-muted-foreground">
                              {activity.detail}
                            </p>
                          ) : null}
                          {activity.output ? (
                            <pre className="mt-2 max-h-48 overflow-auto rounded-lg bg-background/65 px-2 py-2 text-[11px] leading-5 whitespace-pre-wrap text-muted-foreground">
                              {activity.output}
                            </pre>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <Empty className="border-border/70 bg-background/28 py-8">
                      <EmptyContent>
                        <EmptyHeader>
                          <EmptyTitle>No tool activity yet</EmptyTitle>
                          <EmptyDescription>
                            MCP and shell activity will stream here during the
                            next turn.
                          </EmptyDescription>
                        </EmptyHeader>
                      </EmptyContent>
                    </Empty>
                  )}
                </div>
              </div>
            </InspectorScrollArea>
          </TabsContent>
        </CardContent>
      </Tabs>
    </Card>
  );
}

function InspectorScrollArea({ children }: { children: ReactNode }) {
  return (
    <ScrollArea className="h-[320px] sm:h-[380px] xl:h-full">
      <div className="px-4 py-4">{children}</div>
    </ScrollArea>
  );
}

function InspectorStatRow({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-border/70 bg-background/32 px-3 py-3">
      <span className="mt-0.5 text-muted-foreground">{icon}</span>
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
          {label}
        </p>
        <p className="mt-1 text-sm text-foreground">{value}</p>
      </div>
    </div>
  );
}

function buildIdentityProfiles(
  snapshot: DashboardSnapshot | null,
  identityLabelsById: Map<string, string>,
): PiIdentityProfile[] {
  if (!snapshot) {
    return [];
  }

  const receiptCountByActor = new Map<string, number>();
  const latestReceiptByActor = new Map<
    string,
    DashboardSnapshot["receiptTimeline"][number]
  >();
  const delegatedFromById = new Map<string, string[]>();
  const delegatedToById = new Map<string, string[]>();
  const scoreById = new Map(
    snapshot.leaderboard.all.map((entry) => [entry.agentId, entry.score]),
  );

  for (const receipt of snapshot.receiptTimeline) {
    receiptCountByActor.set(
      receipt.actor,
      (receiptCountByActor.get(receipt.actor) ?? 0) + 1,
    );
    latestReceiptByActor.set(receipt.actor, receipt);
  }

  for (const delegation of snapshot.delegationChain) {
    delegatedFromById.set(delegation.delegateId, [
      ...(delegatedFromById.get(delegation.delegateId) ?? []),
      delegation.delegatorId,
    ]);
    delegatedToById.set(delegation.delegatorId, [
      ...(delegatedToById.get(delegation.delegatorId) ?? []),
      delegation.delegateId,
    ]);
  }

  return Object.entries(snapshot.identities).map(([slug, identityId]) => {
    const delegatedFromLabels = (delegatedFromById.get(identityId) ?? []).map(
      (value) => identityLabelsById.get(value) ?? truncateMiddle(value),
    );
    const delegatedToLabels = (delegatedToById.get(identityId) ?? []).map(
      (value) => identityLabelsById.get(value) ?? truncateMiddle(value),
    );
    const latestReceipt = latestReceiptByActor.get(identityId) ?? null;

    return {
      id: identityId,
      slug,
      label: formatIdentityLabel(slug),
      roleSummary: describeIdentityRole({
        slug,
        latestReceiptKind: latestReceipt?.kind ?? null,
        delegatedFromCount: delegatedFromLabels.length,
        delegatedToCount: delegatedToLabels.length,
      }),
      promptHint: buildIdentityPromptHint(slug),
      receiptCount: receiptCountByActor.get(identityId) ?? 0,
      latestReceiptKind: latestReceipt?.kind ?? null,
      score: scoreById.get(identityId) ?? null,
      delegatedFromLabels,
      delegatedToLabels,
    } satisfies PiIdentityProfile;
  });
}

function formatIdentityLabel(slug: string) {
  return `${slug.charAt(0).toUpperCase()}${slug.slice(1)} Agent`;
}

function buildIdentityPromptHint(slug: string) {
  if (slug === "planner") {
    return "Ask about assignment, task scope, or the next delegation.";
  }

  if (slug === "reviewer") {
    return "Ask about challenges, disputes, or final attestation.";
  }

  return `Ask ${formatIdentityLabel(slug)} about execution, receipts, or the next move.`;
}

function describeIdentityRole(input: {
  slug: string;
  latestReceiptKind: string | null;
  delegatedFromCount: number;
  delegatedToCount: number;
}) {
  if (input.slug === "reviewer" || input.latestReceiptKind === "attestation") {
    return "Reviews the task, challenges outcomes, and resolves disputes.";
  }

  if (input.delegatedToCount > 0 && input.delegatedFromCount === 0) {
    return "Owns the top-level task plan and delegates execution downstream.";
  }

  if (input.delegatedToCount > 0 && input.delegatedFromCount > 0) {
    return "Executes delegated work and can hand it off to another identity.";
  }

  if (input.delegatedFromCount > 0) {
    return "Executes delegated work and lands receipts on the current task.";
  }

  return "Participates directly in the current Surfpool task.";
}

export default App;
