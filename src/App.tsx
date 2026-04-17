import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertCircle,
  ArrowUpRight,
  FileText,
  Link2,
  Trophy,
} from "lucide-react";

import { PiChatSurface } from "@/components/pi-chat-surface";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
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
import { Skeleton } from "@/components/ui/skeleton";
import {
  buildStudioScenariosUrl,
  type DashboardSnapshot,
  DEFAULT_CANVAS_URL,
  DEFAULT_SNAPSHOT_URL,
  DEFAULT_STUDIO_ACCOUNTS_URL,
  DEFAULT_STUDIO_SCENARIOS_URL,
  DEFAULT_SURFPOOL_RPC_URL,
  DEFAULT_STUDIO_URL,
  formatLamports,
  formatTimestamp,
  loadDashboardSnapshot,
  loadSurfpoolStatus,
  SNAPSHOT_POLL_INTERVAL_MS,
  type SurfpoolStatus,
  truncateMiddle,
} from "@/lib/dashboard";
import type { PiIdentityProfile } from "@/lib/pi-identities";
import {
  getDefaultRuntimeLabel,
  loadLocalRuntimeConfig,
  type LocalRuntimeConfig,
} from "@/lib/local-runtime";

function App() {
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(null);
  const [snapshotError, setSnapshotError] = useState<string | null>(null);
  const [snapshotUpdatedAt, setSnapshotUpdatedAt] = useState<number | null>(
    null,
  );
  const [surfpoolStatus, setSurfpoolStatus] = useState<SurfpoolStatus | null>(
    null,
  );
  const [runtime, setRuntime] = useState<LocalRuntimeConfig | null>(null);

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

  const runtimeLabel = runtime ? getDefaultRuntimeLabel(runtime) : null;

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
      href: DEFAULT_STUDIO_URL,
      label: "Surfpool Studio",
      variant: "outline" as const,
    },
    {
      href: DEFAULT_STUDIO_ACCOUNTS_URL,
      label: "Accounts",
      variant: "outline" as const,
    },
    {
      href: DEFAULT_STUDIO_SCENARIOS_URL,
      label: "Scenarios",
      variant: "outline" as const,
    },
    {
      href: DEFAULT_SURFPOOL_RPC_URL,
      label: "RPC",
      variant: "outline" as const,
    },
    {
      href: DEFAULT_CANVAS_URL,
      label: "Run dashboard",
      variant: "outline" as const,
    },
    {
      href: DEFAULT_SNAPSHOT_URL,
      label: "Snapshot JSON",
      variant: "ghost" as const,
    },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex max-w-[1520px] flex-col gap-5 px-4 py-4 lg:px-6 lg:py-6">
        <header className="flex flex-col gap-4 border-b border-border/60 pb-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="flex min-w-0 flex-col gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-foreground/88">
                  Pi console
                </span>
                {runtimeLabel ? (
                  <Badge variant="outline">{runtimeLabel}</Badge>
                ) : null}
                {runtime && runtime.mcpServers.length > 0 ? (
                  <Badge variant="outline">
                    {runtime.mcpServers.length} MCP
                  </Badge>
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
              </div>

              <a
                href={DEFAULT_CANVAS_URL}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-w-0 items-center gap-1 text-base font-normal tracking-tight text-foreground transition-colors hover:text-foreground/80 sm:text-lg"
              >
                <span className="truncate">
                  {snapshot
                    ? truncateMiddle(snapshot.task, 18, 12)
                    : "Loading task"}
                </span>
                <ArrowUpRight className="size-4" aria-hidden="true" />
              </a>

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
                  variant={link.variant}
                  size="sm"
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

        <main className="grid gap-5 xl:grid-cols-[minmax(0,1.65fr)_380px]">
          <section className="xl:min-h-[calc(100vh-9rem)]">
            <PiChatSurface
              identityProfiles={identityProfiles}
              mcpServers={runtime?.mcpServers ?? []}
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
            />
          </section>

          <aside className="flex flex-col gap-4 xl:min-h-[calc(100vh-9rem)]">
            <RunOverviewCard
              leadEntry={leadEntry}
              latestReceipt={latestReceipt}
              identityLabelsById={identityLabelsById}
              totalSlashedLamports={totalSlashedLamports}
              snapshot={snapshot}
              surfpoolStatus={surfpoolStatus}
              snapshotUpdatedAt={snapshotUpdatedAt}
            />

            <DelegationCard chainLabels={chainLabels} />

            <ReceiptTimelineCard
              snapshot={snapshot}
              snapshotError={snapshotError}
              identityLabelsById={identityLabelsById}
            />
          </aside>
        </main>
      </div>
    </div>
  );
}

function RunOverviewCard({
  leadEntry,
  latestReceipt,
  identityLabelsById,
  totalSlashedLamports,
  snapshot,
  surfpoolStatus,
  snapshotUpdatedAt,
}: {
  leadEntry: DashboardSnapshot["leaderboard"]["all"][number] | null;
  latestReceipt: DashboardSnapshot["receiptTimeline"][number] | null;
  identityLabelsById: Map<string, string>;
  totalSlashedLamports: number;
  snapshot: DashboardSnapshot | null;
  surfpoolStatus: SurfpoolStatus | null;
  snapshotUpdatedAt: number | null;
}) {
  return (
    <Card className="gap-0 bg-card/72 supports-[backdrop-filter]:backdrop-blur-xl">
      <CardHeader className="border-b border-border/70 bg-background/28">
        <CardTitle>Run</CardTitle>
        <CardDescription>
          {snapshot
            ? `${snapshot.receiptTimeline.length} receipts landed`
            : "Waiting for live snapshot"}
        </CardDescription>
        {snapshotUpdatedAt ? (
          <CardAction className="text-xs text-muted-foreground">
            {formatTimestamp(snapshotUpdatedAt)}
          </CardAction>
        ) : null}
      </CardHeader>

      <CardContent className="flex flex-col gap-3 pt-4">
        {snapshot ? (
          <>
            <SummaryRow
              icon={<Trophy aria-hidden="true" />}
              label="Lead"
              value={
                leadEntry
                  ? `${identityLabelsById.get(leadEntry.agentId) ?? truncateMiddle(leadEntry.agentId)} · ${leadEntry.score}`
                  : "Unavailable"
              }
              href={leadEntry ? buildStudioScenariosUrl(leadEntry.agentId) : null}
            />
            <SummaryRow
              icon={<FileText aria-hidden="true" />}
              label="Latest"
              value={
                latestReceipt
                  ? `${latestReceipt.kind} · ${identityLabelsById.get(latestReceipt.actor) ?? truncateMiddle(latestReceipt.actor)}`
                  : "Unavailable"
              }
              href={
                latestReceipt
                  ? buildStudioScenariosUrl(latestReceipt.receiptId)
                  : null
              }
            />
            <SummaryRow
              icon={<AlertCircle aria-hidden="true" />}
              label="Slashed"
              value={formatLamports(totalSlashedLamports)}
              href={DEFAULT_STUDIO_SCENARIOS_URL}
            />
            <SummaryRow
              icon={<Activity aria-hidden="true" />}
              label="RPC"
              value={
                surfpoolStatus?.status === "online"
                  ? `${surfpoolStatus.healthLabel} · ${surfpoolStatus.slotLabel}`
                  : surfpoolStatus?.errorLabel ?? "Unavailable"
              }
              href={DEFAULT_SURFPOOL_RPC_URL}
            />
          </>
        ) : (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-11 w-full" />
            <Skeleton className="h-11 w-full" />
            <Skeleton className="h-11 w-full" />
            <Skeleton className="h-11 w-full" />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function DelegationCard({ chainLabels }: { chainLabels: string[] }) {
  return (
    <Card className="gap-0 bg-card/72 supports-[backdrop-filter]:backdrop-blur-xl">
      <CardHeader className="border-b border-border/70 bg-background/28">
        <CardTitle>Delegation</CardTitle>
        <CardDescription>Who handed work to whom.</CardDescription>
      </CardHeader>

      <CardContent className="pt-4">
        {chainLabels.length > 0 ? (
          <div className="flex flex-col gap-2">
            {chainLabels.map((entry) => (
              <a
                key={entry}
                href={buildStudioScenariosUrl(entry)}
                target="_blank"
                rel="noreferrer"
                className="flex items-start justify-between gap-3 rounded-md border border-border/70 bg-background/34 px-3 py-2.5 transition-colors hover:bg-muted/50"
              >
                <div className="flex min-w-0 items-start gap-2">
                  <Link2 className="mt-0.5 size-4 text-muted-foreground" />
                  <span className="min-w-0 truncate text-sm text-foreground">
                    {entry}
                  </span>
                </div>
                <ArrowUpRight className="size-4 shrink-0 text-muted-foreground" />
              </a>
            ))}
          </div>
        ) : (
          <Empty className="border-border/70 bg-background/30 py-8">
            <EmptyContent>
              <EmptyMedia variant="icon">
                <Link2 aria-hidden="true" />
              </EmptyMedia>
              <EmptyHeader>
                <EmptyTitle>No delegation chain</EmptyTitle>
                <EmptyDescription>
                  Delegation links will show here when the snapshot lands.
                </EmptyDescription>
              </EmptyHeader>
            </EmptyContent>
          </Empty>
        )}
      </CardContent>
    </Card>
  );
}

function ReceiptTimelineCard({
  snapshot,
  snapshotError,
  identityLabelsById,
}: {
  snapshot: DashboardSnapshot | null;
  snapshotError: string | null;
  identityLabelsById: Map<string, string>;
}) {
  return (
    <Card className="min-h-0 flex-1 gap-0 bg-card/72 supports-[backdrop-filter]:backdrop-blur-xl">
      <CardHeader className="border-b border-border/70 bg-background/28">
        <CardTitle>Receipt timeline</CardTitle>
        <CardDescription>Latest onchain activity for the active task.</CardDescription>
      </CardHeader>

      <CardContent className="min-h-0 flex-1 px-0 pt-0">
        {snapshot ? (
          <ScrollArea className="h-[320px] sm:h-[380px] xl:h-full">
            <div className="flex flex-col px-4 py-2">
              {snapshot.receiptTimeline.map((entry) => (
                <a
                  key={entry.receiptId}
                  href={buildStudioScenariosUrl(entry.receiptId)}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-start justify-between gap-4 border-b border-border/60 py-3 last:border-b-0"
                >
                  <div className="flex min-w-0 flex-col gap-1">
                    <span className="text-sm font-medium text-foreground">
                      {entry.kind}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {identityLabelsById.get(entry.actor) ??
                        truncateMiddle(entry.actor)}
                    </span>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1 text-right">
                    <span className="text-xs text-muted-foreground">
                      slot {entry.slot}
                    </span>
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <span>{truncateMiddle(entry.receiptId)}</span>
                      <ArrowUpRight className="size-3.5" aria-hidden="true" />
                    </span>
                  </div>
                </a>
              ))}
            </div>
          </ScrollArea>
        ) : snapshotError ? (
          <div className="p-4">
            <Alert variant="destructive">
              <AlertCircle aria-hidden="true" />
              <AlertTitle>Snapshot unavailable</AlertTitle>
              <AlertDescription>{snapshotError}</AlertDescription>
            </Alert>
          </div>
        ) : (
          <div className="flex flex-col gap-3 p-4">
            {Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={index} className="h-14 w-full" />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SummaryRow({
  icon,
  label,
  value,
  href,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  href?: string | null;
}) {
  const content = (
    <>
      <div className="flex min-w-0 items-start gap-2">
        <span className="mt-0.5 text-muted-foreground">{icon}</span>
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-xs uppercase tracking-[0.08em] text-muted-foreground">
            {label}
          </span>
          <span className="text-sm text-foreground">{value}</span>
        </div>
      </div>
      {href ? (
        <ArrowUpRight className="size-4 shrink-0 text-muted-foreground" />
      ) : null}
    </>
  );

  if (!href) {
    return (
      <div className="flex items-start justify-between gap-3 rounded-lg border border-border/70 bg-background/40 px-3 py-2.5">
        {content}
      </div>
    );
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="flex items-start justify-between gap-3 rounded-lg border border-border/70 bg-background/40 px-3 py-2.5 transition-colors hover:bg-muted/50"
    >
      {content}
    </a>
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
