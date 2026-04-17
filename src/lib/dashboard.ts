import { createSolanaRpc } from "@solana/kit";

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_SURFPOOL_RPC_PORT = "18999";
const DEFAULT_SURFPOOL_STUDIO_PORT = "18489";
const DEFAULT_CANVAS_PORT = "4173";
const LIVE_SNAPSHOT_URL = "/__live/dashboard-data.json";
const SURFPOOL_POLL_INTERVAL_MS = 5_000;
export const SNAPSHOT_POLL_INTERVAL_MS = 5_000;

export const DEFAULT_SNAPSHOT_URL = "/dashboard-data.json";
export const DEFAULT_STUDIO_URL =
  import.meta.env.VITE_SURFPOOL_STUDIO_URL ??
  `http://${DEFAULT_HOST}:${DEFAULT_SURFPOOL_STUDIO_PORT}`;
export const DEFAULT_CANVAS_URL =
  import.meta.env.VITE_RUN_CANVAS_URL ??
  `http://${DEFAULT_HOST}:${DEFAULT_CANVAS_PORT}/examples/multi_agent/dashboard/index.html`;
const DEFAULT_SURFPOOL_RPC_URL = `http://${DEFAULT_HOST}:${DEFAULT_SURFPOOL_RPC_PORT}`;

const surfpoolRpc = createSolanaRpc(
  import.meta.env.VITE_SURFPOOL_RPC_URL ?? DEFAULT_SURFPOOL_RPC_URL,
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
