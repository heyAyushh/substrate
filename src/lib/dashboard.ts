import { createSolanaRpc } from "@solana/kit";

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_SURFPOOL_RPC_PORT = "18999";
const DEFAULT_SURFPOOL_STUDIO_PORT = "18489";
const LIVE_SNAPSHOT_URL = "/__live/dashboard-data.json";
const SURFPOOL_POLL_INTERVAL_MS = 5_000;
export const SNAPSHOT_POLL_INTERVAL_MS = 5_000;
export const SURFPOOL_STUDIO_LINK_POLL_INTERVAL_MS = 15_000;

export const DEFAULT_SNAPSHOT_URL = "/dashboard-data.json";
export const DEFAULT_STUDIO_URL =
  import.meta.env.VITE_SURFPOOL_STUDIO_URL ??
  `http://${DEFAULT_HOST}:${DEFAULT_SURFPOOL_STUDIO_PORT}`;
export const DEFAULT_STUDIO_ACCOUNTS_URL = `${DEFAULT_STUDIO_URL}/accounts`;
export const DEFAULT_STUDIO_SCENARIOS_URL = `${DEFAULT_STUDIO_URL}/scenarios`;
export const DEFAULT_SURFPOOL_RPC_URL =
  import.meta.env.VITE_SURFPOOL_RPC_URL ??
  `http://${DEFAULT_HOST}:${DEFAULT_SURFPOOL_RPC_PORT}`;

const surfpoolRpc = createSolanaRpc(
  DEFAULT_SURFPOOL_RPC_URL,
);

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
  slashedLamports: string;
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

export async function loadDashboardSnapshot(): Promise<DashboardSnapshot> {
  const liveSnapshot = await tryLoadSnapshot(LIVE_SNAPSHOT_URL);
  if (liveSnapshot) {
    return liveSnapshot;
  }

  const response = await fetch(DEFAULT_SNAPSHOT_URL, {
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`Snapshot request failed with ${response.status}`);
  }

  return (await response.json()) as DashboardSnapshot;
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

// Surfpool Studio supports real scenario deep links like `/scenarios?id=<scenarioId>&tab=<tab>`.
// The Pi Console snapshot only includes internal `receipt_*` and `identity_*` values today, so
// row-level deep links stay disabled until the snapshot provides stable Studio IDs such as
// `studioScenarioId` or `studioAccountAddress`.

async function tryLoadSnapshot(
  url: string,
): Promise<DashboardSnapshot | null> {
  try {
    const response = await fetch(url, {
      cache: "no-store",
    });
    if (!response.ok) {
      return null;
    }

    return (await response.json()) as DashboardSnapshot;
  } catch {
    return null;
  }
}

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
