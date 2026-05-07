import { createSolanaRpc } from "@solana/kit";

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_SURFPOOL_RPC_PORT = "18999";
const DEFAULT_SURFPOOL_STUDIO_PORT = "18489";
export const LIVE_SNAPSHOT_URL = "/__live/dashboard-data.json";
export const LIVE_SIMULATION_ROUTE = "/__live/simulate";
const SURFPOOL_POLL_INTERVAL_MS = 5_000;
export const SNAPSHOT_POLL_INTERVAL_MS = 5_000;
export const SURFPOOL_STUDIO_LINK_POLL_INTERVAL_MS = 15_000;
const VITE_ENV = (
  import.meta as ImportMeta & {
    env?: Record<string, string | undefined>;
  }
).env;

export const DEFAULT_SNAPSHOT_URL = "/dashboard-data.json";
export const DEFAULT_STUDIO_URL =
  VITE_ENV?.VITE_SURFPOOL_STUDIO_URL ??
  `http://${DEFAULT_HOST}:${DEFAULT_SURFPOOL_STUDIO_PORT}`;
export const DEFAULT_STUDIO_ACCOUNTS_URL = `${DEFAULT_STUDIO_URL}/accounts`;
export const DEFAULT_STUDIO_SCENARIOS_URL = `${DEFAULT_STUDIO_URL}/scenarios`;
export const DEFAULT_SURFPOOL_RPC_URL =
  VITE_ENV?.VITE_SURFPOOL_RPC_URL ??
  `http://${DEFAULT_HOST}:${DEFAULT_SURFPOOL_RPC_PORT}`;

const surfpoolRpc = createSolanaRpc(DEFAULT_SURFPOOL_RPC_URL);

export interface DashboardSnapshot {
  identities: Record<string, string>;
  task: string;
  delegationChain: DelegationRecord[];
  receiptTimeline: ReceiptRecord[];
  leaderboard: {
    all: LeaderboardEntry[];
    attestedOnly: LeaderboardEntry[];
  };
  stake: Record<string, StakeEntry>;
}

export interface LiveSimulationResult {
  runId: string;
  startedAt: number;
  completedAt: number;
  snapshot: DashboardSnapshot;
}

interface DelegationRecord {
  delegatorId: string;
  delegateId: string;
}

interface ReceiptRecord {
  slot: number;
  actor: string;
  kind: string;
  receiptId: string;
}

interface LeaderboardEntry {
  agentId: string;
  score: number;
}

interface StakeEntry {
  identityId: string;
  ownerId?: string;
  slashAuthorityId?: string;
  activeLamports: string;
  pendingUnstakeLamports: string;
  slashedLamports: string;
  slashReceiptIds: string[];
}

export interface DashboardAccountReference {
  key: string;
  label: string;
  kind: "identity" | "owner" | "slash authority";
  value: string;
  href: string;
  detail?: string;
}

export interface SurfpoolStatus {
  status: "online" | "offline";
  healthLabel: string;
  slotLabel: string;
  errorLabel?: string;
  pollIntervalMs: number;
}

export interface SurfpoolStudioLinks {
  studio: SurfpoolStudioLinkTarget;
  accounts: SurfpoolStudioLinkTarget;
  scenarios: SurfpoolStudioLinkTarget;
}

export interface SurfpoolStudioLinkTarget {
  href: string;
  available: boolean;
}

export class LiveDashboardSnapshotUnavailableError extends Error {
  constructor(message = "No local simulation snapshot is available yet.") {
    super(message);
    this.name = "LiveDashboardSnapshotUnavailableError";
  }
}

export function buildStudioAccountsUrl(query?: string): string {
  return appendSearch(DEFAULT_STUDIO_ACCOUNTS_URL, query);
}

export function listDashboardAccountReferences(
  snapshot: DashboardSnapshot,
): DashboardAccountReference[] {
  const references: DashboardAccountReference[] = [];

  for (const [slug, identityId] of Object.entries(snapshot.identities)) {
    const stakeEntry = snapshot.stake[slug];
    const baseLabel = formatSlugLabel(slug);
    const stakeDetail = stakeEntry
      ? `active ${formatLamports(
          Number(stakeEntry.activeLamports),
        )} · pending ${formatLamports(
          Number(stakeEntry.pendingUnstakeLamports),
        )} · slashed ${formatLamports(Number(stakeEntry.slashedLamports))}`
      : undefined;

    references.push({
      key: `${slug}:identity`,
      label: `${baseLabel} identity`,
      kind: "identity",
      value: identityId,
      href: buildStudioAccountsUrl(identityId),
      detail: stakeDetail,
    });

    if (stakeEntry?.ownerId) {
      references.push({
        key: `${slug}:owner`,
        label: `${baseLabel} owner`,
        kind: "owner",
        value: stakeEntry.ownerId,
        href: buildStudioAccountsUrl(stakeEntry.ownerId),
      });
    }

    if (stakeEntry?.slashAuthorityId) {
      references.push({
        key: `${slug}:slash-authority`,
        label: `${baseLabel} slash authority`,
        kind: "slash authority",
        value: stakeEntry.slashAuthorityId,
        href: buildStudioAccountsUrl(stakeEntry.slashAuthorityId),
      });
    }
  }

  return references;
}

export async function loadDashboardSnapshot(
  fetchImpl: typeof fetch = fetch,
): Promise<DashboardSnapshot> {
  const response = await fetchImpl(LIVE_SNAPSHOT_URL, {
    cache: "no-store",
  });
  if (response.status === 404) {
    throw new LiveDashboardSnapshotUnavailableError(
      await readResponseError(
        response,
        "No local simulation snapshot is available yet.",
      ),
    );
  }

  if (!response.ok) {
    throw new Error(
      await readResponseError(
        response,
        `Snapshot request failed with ${response.status}`,
      ),
    );
  }

  return (await response.json()) as DashboardSnapshot;
}

export async function runLiveSimulation(
  fetchImpl: typeof fetch = fetch,
): Promise<LiveSimulationResult> {
  const response = await fetchImpl(LIVE_SIMULATION_ROUTE, {
    method: "POST",
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(
      await readResponseError(
        response,
        `Simulation request failed with ${response.status}`,
      ),
    );
  }

  return (await response.json()) as LiveSimulationResult;
}

export async function loadSurfpoolStatus(): Promise<SurfpoolStatus> {
  try {
    const [health, slot] = await Promise.all([
      surfpoolRpc.getHealth().send(),
      surfpoolRpc.getSlot().send(),
    ]);

    return {
      status: "online",
      healthLabel: String(health),
      slotLabel: `slot ${Number(slot).toLocaleString()}`,
      pollIntervalMs: SURFPOOL_POLL_INTERVAL_MS,
    };
  } catch (error) {
    return {
      status: "offline",
      healthLabel: "unavailable",
      slotLabel: "slot unavailable",
      errorLabel:
        error instanceof Error ? error.message : "Surfpool RPC unavailable",
      pollIntervalMs: SURFPOOL_POLL_INTERVAL_MS,
    };
  }
}

export async function loadSurfpoolStudioLinks(): Promise<SurfpoolStudioLinks> {
  const [studio, accounts, scenarios] = await Promise.all([
    probeBrowsableUrl(DEFAULT_STUDIO_URL),
    probeBrowsableUrl(DEFAULT_STUDIO_ACCOUNTS_URL),
    probeBrowsableUrl(DEFAULT_STUDIO_SCENARIOS_URL),
  ]);

  return {
    studio: {
      href: DEFAULT_STUDIO_URL,
      available: studio,
    },
    accounts: {
      href: DEFAULT_STUDIO_ACCOUNTS_URL,
      available: accounts,
    },
    scenarios: {
      href: DEFAULT_STUDIO_SCENARIOS_URL,
      available: scenarios,
    },
  };
}

// Surfpool Studio account pages accept a `search` query, so the Pi Console can open
// account-filtered views for identities and stake authorities today.
//
// Scenario deep links still need stable Studio IDs such as `studioScenarioId`.

async function probeBrowsableUrl(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, {
      method: "GET",
      mode: "cors",
      cache: "no-store",
    });
    return response.ok;
  } catch {
    return false;
  }
}

function appendSearch(baseUrl: string, query?: string): string {
  const trimmedQuery = query?.trim();
  if (!trimmedQuery) {
    return baseUrl;
  }

  const url = new URL(baseUrl);
  url.searchParams.set("search", trimmedQuery);
  return url.toString();
}

function formatSlugLabel(slug: string): string {
  return `${slug.charAt(0).toUpperCase()}${slug.slice(1)}`;
}

async function readResponseError(
  response: Response,
  fallback: string,
): Promise<string> {
  try {
    const payload = (await response.json()) as {
      error?: string;
      message?: string;
    };
    if (typeof payload.error === "string" && payload.error.trim().length > 0) {
      return payload.error;
    }
    if (
      typeof payload.message === "string" &&
      payload.message.trim().length > 0
    ) {
      return payload.message;
    }
  } catch {
    // Ignore JSON parsing failures and use the fallback.
  }

  return fallback;
}

export function truncateMiddle(
  value: string,
  headLength = 10,
  tailLength = 8,
): string {
  if (value.length <= headLength + tailLength + 1) {
    return value;
  }

  return `${value.slice(0, headLength)}...${value.slice(-tailLength)}`;
}

export function formatLamports(value: number): string {
  return `${value.toLocaleString()} lamports`;
}

export function formatTimestamp(value: number): string {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  }).format(value);
}
