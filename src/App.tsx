import { useEffect, useMemo, useState } from "react";
import { Activity, ArrowUpRight, RefreshCw } from "lucide-react";

import { PiChatSurface } from "@/components/pi-chat-surface";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
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
import {
  getDefaultRuntimeLabel,
  loadLocalRuntimeConfig,
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
  const [runtimeLabel, setRuntimeLabel] = useState<string | null>(null);

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

    const loadRuntime = async () => {
      const runtime = await loadLocalRuntimeConfig();
      if (!isActive) {
        return;
      }
      setRuntimeLabel(getDefaultRuntimeLabel(runtime));
    };

    void loadRuntime();

    return () => {
      isActive = false;
    };
  }, []);

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
    <div className="pi-console-app dark min-h-screen bg-background text-foreground">
      <div className="mx-auto flex h-screen max-w-[1440px] flex-col overflow-hidden">
        <header className="border-b border-border/80">
          <div className="flex flex-col gap-3 px-4 py-3 sm:px-5 md:flex-row md:items-center md:justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-[12px] text-muted-foreground">
                  Pi console
                </span>
                {runtimeLabel ? (
                  <Badge variant="outline" className="h-5 rounded-md px-2">
                    {runtimeLabel}
                  </Badge>
                ) : null}
                {surfpoolStatus ? (
                  <Badge
                    variant={
                      surfpoolStatus.status === "online"
                        ? "secondary"
                        : "destructive"
                    }
                    className="h-5 rounded-md px-2"
                  >
                    {surfpoolStatus.status === "online" ? "RPC online" : "RPC offline"}
                  </Badge>
                ) : null}
              </div>
              <a
                href={DEFAULT_CANVAS_URL}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-sm text-foreground/80 transition-colors hover:text-foreground"
              >
                <span>
                  {snapshot
                    ? truncateMiddle(snapshot.task, 16, 12)
                    : "Loading task"}
                </span>
                <ArrowUpRight className="size-3.5" />
              </a>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {headerLinks.map((link) => (
                <Button key={link.label} asChild variant={link.variant} size="sm">
                  <a href={link.href} target="_blank" rel="noreferrer">
                    {link.label}
                    <ArrowUpRight className="size-4" />
                  </a>
                </Button>
              ))}
            </div>
          </div>
        </header>

        <main className="grid min-h-0 flex-1 md:grid-cols-[minmax(0,1.35fr)_minmax(300px,360px)]">
          <section className="flex min-h-0 flex-col overflow-hidden border-b border-border/80 md:border-r md:border-b-0">
            <div className="flex items-center justify-between gap-3 border-b border-border/80 px-4 py-2.5 sm:px-5">
              <div className="space-y-1">
                <p className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
                  Agent
                </p>
                <p className="text-sm text-foreground/78">
                  Browser Pi surface with local session storage
                </p>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Activity className="size-3.5" />
                {surfpoolStatus?.slotLabel ?? "Checking slot"}
              </div>
            </div>

            <div className="min-h-0 flex-1">
              <PiChatSurface
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
            </div>
          </section>

          <aside className="flex min-h-0 flex-col overflow-y-auto">
            <section className="px-4 py-4 sm:px-5">
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
                      Run
                    </p>
                    <p className="mt-1 text-sm text-foreground/82">
                      {snapshot
                        ? `${snapshot.receiptTimeline.length} receipts landed`
                        : "Waiting for snapshot"}
                    </p>
                  </div>
                  {snapshotUpdatedAt ? (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <RefreshCw className="size-3.5" />
                      {formatTimestamp(snapshotUpdatedAt)}
                    </div>
                  ) : null}
                </div>

                <dl className="space-y-3 text-sm">
                  <FactRow
                    label="Lead"
                    value={
                      leadEntry
                        ? `${identityLabelsById.get(leadEntry.agentId) ?? truncateMiddle(leadEntry.agentId)} · ${leadEntry.score}`
                        : "Unavailable"
                    }
                    href={leadEntry ? buildStudioScenariosUrl(leadEntry.agentId) : null}
                  />
                  <FactRow
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
                  <FactRow
                    label="Slashed"
                    value={snapshot ? formatLamports(totalSlashedLamports) : "Unavailable"}
                    href={DEFAULT_STUDIO_SCENARIOS_URL}
                  />
                  <FactRow
                    label="RPC"
                    value={
                      surfpoolStatus?.status === "online"
                        ? `${surfpoolStatus.healthLabel} · ${surfpoolStatus.slotLabel}`
                        : surfpoolStatus?.errorLabel ?? "Unavailable"
                    }
                    href={DEFAULT_SURFPOOL_RPC_URL}
                  />
                </dl>
              </div>
            </section>

            <Separator />

            <section className="px-4 py-4 sm:px-5">
              <p className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
                Delegation
              </p>
              <div className="mt-3 space-y-2">
                {chainLabels.length > 0 ? (
                  chainLabels.map((entry) => (
                    <a
                      key={entry}
                      href={buildStudioScenariosUrl(entry)}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-sm text-foreground/82 transition-colors hover:text-foreground"
                    >
                      <span>{entry}</span>
                      <ArrowUpRight className="size-3.5" />
                    </a>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">No delegation chain</p>
                )}
              </div>
            </section>

            <Separator />

            <section className="min-h-0 flex-1 overflow-hidden px-4 py-4 sm:px-5">
              <p className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
                Receipt timeline
              </p>
              <div className="mt-3 h-full overflow-y-auto">
                {snapshot ? (
                  <ul className="space-y-0">
                    {snapshot.receiptTimeline.map((entry, index) => (
                      <li key={entry.receiptId} className="py-3">
                        <a
                          href={buildStudioScenariosUrl(entry.receiptId)}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-start justify-between gap-3 transition-colors hover:text-foreground"
                        >
                          <div className="space-y-1">
                            <p className="text-sm text-foreground/84">{entry.kind}</p>
                            <p className="text-xs text-muted-foreground">
                              {identityLabelsById.get(entry.actor) ??
                                truncateMiddle(entry.actor)}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-xs text-muted-foreground">
                              slot {entry.slot}
                            </p>
                            <p className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                              <span>{truncateMiddle(entry.receiptId)}</span>
                              <ArrowUpRight className="size-3.5" />
                            </p>
                          </div>
                        </a>
                        {index < snapshot.receiptTimeline.length - 1 ? (
                          <Separator className="mt-3" />
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : snapshotError ? (
                  <p className="text-sm text-destructive">{snapshotError}</p>
                ) : (
                  <div className="space-y-3">
                    <LoadingLine />
                    <LoadingLine />
                    <LoadingLine />
                  </div>
                )}
              </div>
            </section>
          </aside>
        </main>
      </div>
    </div>
  );
}

function FactRow({
  label,
  value,
  href,
}: {
  label: string;
  value: string;
  href?: string | null;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="max-w-[16rem] text-right text-foreground/82">
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center justify-end gap-1 transition-colors hover:text-foreground"
          >
            <span>{value}</span>
            <ArrowUpRight className="size-3.5" />
          </a>
        ) : (
          value
        )}
      </dd>
    </div>
  );
}

function LoadingLine() {
  return <div className="h-4 w-full rounded bg-muted/60" />;
}

export default App;
