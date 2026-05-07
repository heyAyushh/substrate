import { homedir } from "node:os";
import { resolve } from "node:path";

export const DEFAULT_RPC_URL = "http://127.0.0.1:8899";
export const DEFAULT_RPC_SUBSCRIPTIONS_URL = "ws://127.0.0.1:8900";
export const DEFAULT_DOMAIN = "general";
export const DEFAULT_IDENTITY_LABEL = "pi-local-agent";
export const DEFAULT_TASK_TITLE = "pi coding session";
export const DEFAULT_BLOB_DIR = ".pi/substrate-blobs";
export const DEFAULT_INDEX_DB_PATH = ".pi/substrate-index.sqlite";
export const DEFAULT_SURFPOOL_STUDIO_URL = "http://127.0.0.1:18488";
export const DEFAULT_RUN_DASHBOARD_URL =
  "http://127.0.0.1:4173/examples/multi_agent/dashboard/index.html";

const DEFAULT_KEYPAIR_SUBPATH = ".config/solana/id.json";
const RPC_SUBSCRIPTIONS_URL_ENV = "SUBSTRATE_RPC_SUBSCRIPTIONS_URL";
const LEGACY_WS_URL_ENV = "SUBSTRATE_WS_URL";

export interface ExtensionConfig {
  readonly rpcUrl: string;
  readonly rpcSubscriptionsUrl: string;
  readonly keypairPath: string;
  readonly domain: string;
  readonly identityLabel: string;
  readonly taskTitle: string;
  readonly blobDir: string;
  readonly indexDbPath: string;
  readonly autoProvisionIdentity: boolean;
  readonly surfpoolStudioUrl: string;
  readonly runDashboardUrl: string;
}

export interface LoadConfigInput {
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly home?: string;
  readonly cwd?: string;
}

const truthy = (value: string | undefined): boolean | undefined => {
  if (value === undefined) return undefined;
  return value === "1" || value.toLowerCase() === "true";
};

export function loadExtensionConfig(
  input: LoadConfigInput = {},
): ExtensionConfig {
  const env = input.env ?? process.env;
  const home = input.home ?? homedir();
  const cwd = input.cwd ?? process.cwd();
  const autoProvisionOverride = truthy(env.SUBSTRATE_AUTO_PROVISION_IDENTITY);
  return {
    rpcUrl: env.SUBSTRATE_RPC_URL ?? DEFAULT_RPC_URL,
    rpcSubscriptionsUrl:
      env[RPC_SUBSCRIPTIONS_URL_ENV] ??
      env[LEGACY_WS_URL_ENV] ??
      DEFAULT_RPC_SUBSCRIPTIONS_URL,
    keypairPath:
      env.SUBSTRATE_KEYPAIR ?? resolve(home, DEFAULT_KEYPAIR_SUBPATH),
    domain: env.SUBSTRATE_DOMAIN ?? DEFAULT_DOMAIN,
    identityLabel: env.SUBSTRATE_IDENTITY_LABEL ?? DEFAULT_IDENTITY_LABEL,
    taskTitle: env.SUBSTRATE_TASK_TITLE ?? DEFAULT_TASK_TITLE,
    blobDir: env.SUBSTRATE_BLOB_DIR ?? resolve(cwd, DEFAULT_BLOB_DIR),
    indexDbPath: env.SUBSTRATE_INDEX_DB ?? resolve(cwd, DEFAULT_INDEX_DB_PATH),
    autoProvisionIdentity: autoProvisionOverride ?? true,
    surfpoolStudioUrl:
      env.SUBSTRATE_SURFPOOL_STUDIO_URL ?? DEFAULT_SURFPOOL_STUDIO_URL,
    runDashboardUrl:
      env.SUBSTRATE_RUN_DASHBOARD_URL ?? DEFAULT_RUN_DASHBOARD_URL,
  };
}
