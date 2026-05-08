import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, isAbsolute, join, relative, resolve } from "node:path";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { sign as signBytes, randomUUID, type KeyObject } from "node:crypto";
import type { KeyPairSigner } from "@solana/kit";

import {
  TrustSubstrateOnchainClient,
  createIdentity,
  createKitTransactionDispatcher,
  createReceipt,
  createTask,
  RECEIPT_SCOPE_BITS,
  type OnchainTaskRecord,
  type ReceiptRecord,
} from "@trust-substrate/sdk";
import { hashCanonical } from "@trust-substrate/sdk/canonical";

import { loadKeyPairSignerFromFile } from "../../packages/pi-extension/src/keypair.ts";
import { loadOrCreateSocietyAgentIdentity } from "./society_agent_identities.ts";
import {
  buildAgentActionEnvelopeForSignedSocietyAction,
  buildProgramWiringPlan,
  buildSocietyActionTranscript,
  selectCommitBatches,
  writeCommitProofArtifact,
  type CommitProofChainEvidence,
  type CommitProofReference,
  type ProgramWiringPlan,
  type SocietyActionSignature,
  type SocietyActionTranscript,
} from "./society_commit_artifacts.ts";
import {
  requestSocietyPiAction,
  type SocietyPiActionEvidence,
  type SocietyPiProvider,
} from "./society_pi_action_driver.ts";
import {
  buildProtocolEvidenceGraph,
  type ProtocolEvidenceGraph,
} from "./society_protocol_evidence.ts";
import {
  shouldApplyLiveReputation,
  shouldSyncLiveTaskStatus,
} from "./society_chain_kinds.ts";
import { createSocietyLiveManager } from "./society_live.ts";

const require = createRequire(import.meta.url);
const { finalizeLiveSocietySession, packOnchainSocietyWorldState } =
  require("./society_core.js") as {
    finalizeLiveSocietySession: (session: unknown) => SocietyRunPayload;
    packOnchainSocietyWorldState: (session: unknown) => Uint8Array;
  };

interface SocietyCompressedReceipt {
  readonly receiptId: string;
  readonly kind: string;
  readonly actorId: string;
  readonly payloadHash: string;
}

interface SocietyCompressedTx {
  readonly batchId: string;
  readonly eventRoot: string;
  readonly receipts: ReadonlyArray<SocietyCompressedReceipt>;
}

interface SocietyTokenizedAgent {
  readonly agentId: string;
  readonly agentName?: string;
  readonly agentIdentityId?: string;
  readonly sourceEventId?: string;
  readonly sourceReceiptId?: string;
  readonly tick?: number;
  readonly cell?: {
    readonly x: number;
    readonly y: number;
  };
  readonly startingTokens: number | string;
  readonly tokenProgram?: string;
}

interface SocietyEvent {
  readonly id: string;
  readonly tick?: number;
  readonly agentId: string;
  readonly agentName?: string;
  readonly actorIdentityId?: string;
  readonly action: string;
  readonly receiptKind?: string;
  readonly tokenDelta: number | string;
  readonly cell?: {
    readonly x: number;
    readonly y: number;
  };
  readonly payloadExtras?: Record<string, unknown>;
}

interface SocietyRunPayload {
  readonly runId: string;
  readonly config?: {
    readonly agents?: number;
    readonly ticks?: number;
  };
  readonly events?: ReadonlyArray<SocietyEvent>;
  readonly receipts?: ReadonlyArray<unknown>;
  readonly tokenizedAgents?: ReadonlyArray<SocietyTokenizedAgent>;
  readonly compressedTxs: ReadonlyArray<SocietyCompressedTx>;
  readonly graph?: unknown;
  readonly leaderboard?: unknown;
  readonly metrics?: unknown;
}

interface SocietyLiveEvent {
  readonly id: string;
  readonly tick: number;
  readonly agentId: string;
  readonly agentName?: string;
  readonly actorIdentityId?: string;
  readonly action: string;
  readonly receiptKind?: string;
  readonly tokenDelta?: number | string;
  readonly cell: {
    readonly x: number;
    readonly y: number;
  };
  readonly payloadExtras?: Record<string, unknown>;
}

interface SocietyLiveReceiptPayload {
  readonly [key: string]: unknown;
}

interface SocietyLiveReceipt {
  readonly receiptId: string;
  readonly sequence: number;
  readonly actorId: string;
  readonly actorName?: string;
  readonly taskId: string;
  readonly kind: string;
  readonly domain: string;
  readonly previousReceiptId?: string;
  readonly payloadHash: string;
  readonly payload: SocietyLiveReceiptPayload;
}

interface SocietyLiveResult extends SocietyRunPayload {
  readonly receipts?: ReadonlyArray<SocietyLiveReceipt>;
  readonly events?: ReadonlyArray<SocietyLiveEvent>;
}

interface SocietyLiveFrame {
  readonly tick: number;
  readonly [key: string]: unknown;
}

interface SocietyLiveSimulationSession {
  readonly config: SocietyLiveResult["config"];
  readonly events: ReadonlyArray<SocietyLiveEvent>;
  readonly receipts: ReadonlyArray<SocietyLiveReceipt>;
  readonly timeline: ReadonlyArray<SocietyLiveFrame>;
  readonly currentTick: number;
  readonly sequence: number;
  readonly previousReceiptId?: string;
  readonly [key: string]: unknown;
}

interface SocietyLiveAgentAccount {
  readonly agentId: string;
  readonly agentName?: string;
  readonly authority: {
    readonly address: string;
    readonly identityDirectory: string;
    readonly keypairPath: string;
    readonly created: boolean;
  };
  readonly startingTokens: string;
  readonly tokenProgram: string;
  readonly identity: {
    readonly id: string;
    readonly address: string;
    readonly signature?: string;
  };
  readonly task: {
    readonly id: string;
    readonly address: string;
    readonly signature?: string;
  };
  readonly delegation: {
    readonly address: string;
    readonly delegate: string;
    readonly signature?: string;
  };
  readonly stake: {
    readonly address: string;
    readonly signature?: string;
    readonly slot?: number;
  };
  readonly reputation: {
    readonly address: string;
    readonly domain: string;
    readonly signature?: string;
  };
  readonly funding?: {
    readonly lamports: string;
    readonly signature?: string;
  };
}

interface SocietyLiveAgentRuntime {
  readonly agentId: string;
  readonly signer: KeyPairSigner;
  readonly actionSigningKey: KeyObject;
  readonly account: SocietyLiveAgentAccount;
}

interface SocietyAgentTaskReceiptChain {
  sequence: number;
  previousReceiptId?: string;
}

interface SocietyLiveChainSession {
  readonly sessionId: string;
  readonly runId: string;
  readonly commitId: string;
  readonly createdAt: string;
  readonly rpcUrl: string;
  readonly studioUrl: string;
  readonly authority: Awaited<ReturnType<typeof loadKeyPairSignerFromFile>>;
  readonly client: TrustSubstrateOnchainClient;
  readonly domainCatalogAddress: string;
  readonly identity: {
    readonly id: string;
    readonly address: string;
    readonly bond: string;
    readonly attester: string;
  };
  readonly task: {
    readonly id: string;
    readonly address: string;
  };
  readonly reputation: {
    readonly address: string;
    readonly domain: string;
  };
  readonly checkpoint: {
    readonly address: string;
    readonly latestCheckpoint: string;
    readonly epoch: string;
  };
  readonly adjudicator: {
    readonly address: string;
    readonly adjudicator: string;
    readonly treasuryVault: string;
  };
  readonly world: {
    readonly address: string;
  };
  readonly operations: unknown[];
  readonly agentAccounts: SocietyLiveAgentAccount[];
  readonly agentAccountsById: Map<string, SocietyLiveAgentAccount>;
  readonly agentRuntimesById: Map<string, SocietyLiveAgentRuntime>;
  readonly agentTaskReceiptChainsById: Map<
    string,
    SocietyAgentTaskReceiptChain
  >;
  readonly piActionsByEventId: Map<string, SocietyPiActionEvidence>;
  readonly committedReceipts: unknown[];
  programPlan: ProgramWiringPlan;
  worldStatus: number;
  receiptSequence: number;
  previousReceiptId?: string;
  dispute?: {
    readonly receipt: string;
    readonly verdict: string;
    readonly verdictSignature: string;
  };
}

interface SocietyLiveSetupStatus {
  readonly stakeAsset: string;
  readonly requestedAgentCount: number;
  readonly readyAgentCount: number;
  readonly fundedAgentCount: number;
  readonly identityAccountCount: number;
  readonly delegationAccountCount: number;
  readonly solStakeAccountCount: number;
  readonly protocolOperationCount: number;
  readonly worldReady: boolean;
}

interface SocietyLiveSessionAccountSnapshot {
  readonly sessionId: string;
  readonly rpcUrl: string;
  readonly studioUrl: string;
  readonly identity: SocietyLiveChainSession["identity"];
  readonly task: SocietyLiveChainSession["task"];
  readonly reputation: SocietyLiveChainSession["reputation"];
  readonly checkpoint: SocietyLiveChainSession["checkpoint"];
  readonly adjudicator: SocietyLiveChainSession["adjudicator"];
  readonly world: {
    readonly address: string;
    readonly status: number;
  };
  readonly setup: SocietyLiveSetupStatus;
  readonly agentAccounts: ReadonlyArray<SocietyLiveAgentAccount>;
  readonly programPlan: ProgramWiringPlan;
  readonly protocolEvidence: ProtocolEvidenceGraph;
}

const REPO_ROOT = resolve(join(import.meta.dirname, "../.."));
const EXAMPLE_ROOT = resolve(join(import.meta.dirname));
const DEFAULT_PORT = 4173;
const MAX_PORT_ATTEMPTS = 20;
const MAX_BODY_BYTES = 64 * 1024 * 1024;
const COMMIT_ID_HEX_LENGTH = 12;
const TRUST_MODE_VERDICT = 0;
const SOCIETY_ATTESTER_CATEGORY = "society-simulation";
const SOCIETY_ATTESTER_TIER = 1;
const SOCIETY_CHECKPOINT_EPOCH = 0n;
const AGENT_LOST_OUTCOME = 1;
const NO_FAULT_OUTCOME = 2;
const VERDICT_CLASS_SAFETY = 0;
const SOCIETY_EXAMPLE_DEATH_DISPUTE_SLASH_LAMPORTS = 1n;
const SOCIETY_EXAMPLE_DEATH_DISPUTE_TASK_TITLE =
  "Society example death dispute";
const SOCIETY_EXAMPLE_DEATH_DISPUTE_TASK_DESCRIPTION =
  "Example adapter task that maps a Society death event into generic dispute, verdict, reputation, and stake operations.";
const DEFAULT_RPC_URL = "http://127.0.0.1:8898";
const DEFAULT_RPC_SUBSCRIPTIONS_URL = "ws://127.0.0.1:8897";
const DEFAULT_SURFPOOL_STUDIO_URL = "http://127.0.0.1:18488";
const SOCIETY_PORT_ENV = "SUBSTRATE_SOCIETY_PORT";
const FALLBACK_PORT_ENV = "PORT";
const LOCAL_RPC_URL_ENV = "SUBSTRATE_RPC_URL";
const LOCAL_RPC_SUBSCRIPTIONS_URL_ENV = "SUBSTRATE_WS_URL";
const LEGACY_LOCAL_RPC_SUBSCRIPTIONS_URL_ENV =
  "SUBSTRATE_RPC_SUBSCRIPTIONS_URL";
const LOCAL_SURFPOOL_STUDIO_URL_ENV = "SUBSTRATE_SURFPOOL_STUDIO_URL";
const PUBLIC_SOCIETY_URL_ENV = "SUBSTRATE_PUBLIC_SOCIETY_URL";
const PUBLIC_RPC_URL_ENV = "SUBSTRATE_PUBLIC_RPC_URL";
const PUBLIC_SURFPOOL_STUDIO_URL_ENV = "SUBSTRATE_PUBLIC_SURFPOOL_STUDIO_URL";
const REMOTE_RPC_ALLOW_ENV = "SUBSTRATE_ALLOW_REMOTE_RPC";
const PUBLIC_LIVE_MUTATION_ALLOW_ENV = "SUBSTRATE_ALLOW_PUBLIC_LIVE_MUTATION";
const KEYPAIR_ENV = "SUBSTRATE_KEYPAIR";
const SOCIETY_AGENT_IDENTITY_DIR_ENV = "SUBSTRATE_SOCIETY_AGENT_IDENTITY_DIR";
const SOCIETY_AGENT_AIRDROP_LAMPORTS_ENV =
  "SUBSTRATE_SOCIETY_AGENT_AIRDROP_LAMPORTS";
const SOCIETY_PI_ACTIONS_ENABLED_ENV = "SUBSTRATE_SOCIETY_PI_ACTIONS";
const SOCIETY_PI_RUNTIME_URL_ENV = "SUBSTRATE_SOCIETY_PI_RUNTIME_URL";
const SOCIETY_PI_PROVIDER_ENV = "SUBSTRATE_SOCIETY_PI_PROVIDER";
const SOCIETY_PI_MODEL_ENV = "SUBSTRATE_SOCIETY_PI_MODEL";
const DEFAULT_KEYPAIR_PATH = join(homedir(), ".config/solana/id.json");
const DEFAULT_AGENT_IDENTITY_DIR = join(EXAMPLE_ROOT, ".society-identities");
const DEFAULT_AGENT_AIRDROP_LAMPORTS = 2_000_000_000n;
const DEFAULT_PI_RUNTIME_URL = "http://127.0.0.1:5173";
const DEFAULT_PI_PROVIDER: SocietyPiProvider = "openai-codex";
const DEFAULT_PI_MODEL_ID = "gpt-5.4-mini";
const SOCIETY_DOMAIN = "society";
const ZERO_ADDRESS = "11111111111111111111111111111111";
const FIRST_RECEIPT_SEQUENCE = 1;
const SOCIETY_WORLD_STATUS_ACTIVE = 0;
const SOCIETY_WORLD_READ_RETRY_ATTEMPTS = 20;
const SOCIETY_WORLD_READ_RETRY_DELAY_MS = 250;
const AIRDROP_CONFIRMATION_ATTEMPTS = 40;
const AIRDROP_CONFIRMATION_DELAY_MS = 250;
const LOOPBACK_REMOTE_ADDRESSES = new Set([
  "127.0.0.1",
  "::1",
  "::ffff:127.0.0.1",
]);
const LEGACY_SOCIETY_PAGE_PATH = "/examples/multi_agent/dashboard/society.html";
const REMOVED_OFFLINE_COMMIT_MESSAGE =
  "Offline society commit has been removed. Start a Surfpool live session at /society instead.";
const SOCIETY_WORLD_STATUS_COMPLETE = 1;
const TOKEN_PROGRAM_AGENT_STAKE = "agent_stake";
const SOL_STAKE_ASSET_LABEL = "SOL";
const SOCIETY_APP_PATH = "/dashboard/society-app/index.html";
const LEGACY_SOCIETY_PAGE_PATHS = new Set([
  LEGACY_SOCIETY_PAGE_PATH,
  "/dashboard/society.html",
  "/society.html",
]);
const PROOF_DIRECTORY = resolve(join(EXAMPLE_ROOT, "dashboard/proofs"));
const PROOF_ROUTE_PREFIX = "/examples/multi_agent/dashboard/proofs";
const JSON_CONTENT_TYPE = "application/json; charset=utf-8";
const BASE58_IDENTIFIER = /^[1-9A-HJ-NP-Za-km-z]{32,120}$/;
const RPC_HEALTH_REQUEST = {
  jsonrpc: "2.0",
  id: 1,
  method: "getLatestBlockhash",
};
const RPC_SIGNATURE_STATUS_COMMITMENT = "processed";
const DELEGATION_FULL_SCOPE = Object.values(RECEIPT_SCOPE_BITS).reduce(
  (mask, bit) => mask | bit,
  0,
);

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
};

const jsonReplacer = (_key: string, value: unknown): unknown =>
  typeof value === "bigint" ? value.toString() : value;

const wait = (milliseconds: number): Promise<void> =>
  new Promise((resolveWait) => {
    setTimeout(resolveWait, milliseconds);
  });

const writeJson = (
  response: ServerResponse,
  statusCode: number,
  payload: unknown,
) => {
  response.writeHead(statusCode, { "content-type": JSON_CONTENT_TYPE });
  response.end(JSON.stringify(payload, jsonReplacer, 2));
};

const isInside = (parent: string, child: string): boolean => {
  const path = relative(parent, child);
  return path === "" || (!path.startsWith("..") && !isAbsolute(path));
};

const readRequestBody = (request: IncomingMessage): Promise<string> =>
  new Promise((resolveBody, rejectBody) => {
    const chunks: Buffer[] = [];
    let totalBytes = 0;

    request.on("data", (chunk: Buffer) => {
      totalBytes += chunk.length;
      if (totalBytes > MAX_BODY_BYTES) {
        rejectBody(new Error("Request body is too large"));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });

    request.on("end", () =>
      resolveBody(Buffer.concat(chunks).toString("utf8")),
    );
    request.on("error", rejectBody);
  });

const parseJsonBody = async (request: IncomingMessage): Promise<unknown> => {
  const body = await readRequestBody(request);
  return body.length === 0 ? undefined : JSON.parse(body);
};

const readOptionalEnv = (name: string): string | undefined => {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
};

const readConfiguredPort = (): number => {
  const requestedPort = Number.parseInt(
    readOptionalEnv(SOCIETY_PORT_ENV) ??
      readOptionalEnv(FALLBACK_PORT_ENV) ??
      "",
    10,
  );
  return Number.isFinite(requestedPort) ? requestedPort : DEFAULT_PORT;
};

const readLocalRpcUrl = (): string =>
  readOptionalEnv(LOCAL_RPC_URL_ENV) ?? DEFAULT_RPC_URL;

const readLocalRpcSubscriptionsUrl = (): string =>
  readOptionalEnv(LOCAL_RPC_SUBSCRIPTIONS_URL_ENV) ??
  readOptionalEnv(LEGACY_LOCAL_RPC_SUBSCRIPTIONS_URL_ENV) ??
  DEFAULT_RPC_SUBSCRIPTIONS_URL;

const readLocalSurfpoolStudioUrl = (): string =>
  readOptionalEnv(LOCAL_SURFPOOL_STUDIO_URL_ENV) ?? DEFAULT_SURFPOOL_STUDIO_URL;

const readKeypairPath = (): string =>
  readOptionalEnv(KEYPAIR_ENV) ?? DEFAULT_KEYPAIR_PATH;

const readSocietyAgentIdentityRoot = (): string =>
  readOptionalEnv(SOCIETY_AGENT_IDENTITY_DIR_ENV) ?? DEFAULT_AGENT_IDENTITY_DIR;

const readSocietyAgentAirdropLamports = (): bigint => {
  const configured = readOptionalEnv(SOCIETY_AGENT_AIRDROP_LAMPORTS_ENV);
  if (!configured) return DEFAULT_AGENT_AIRDROP_LAMPORTS;
  if (!/^[0-9]+$/.test(configured)) {
    throw new Error(
      `${SOCIETY_AGENT_AIRDROP_LAMPORTS_ENV} must be a non-negative lamport amount`,
    );
  }
  return BigInt(configured);
};

const readSocietyPiActionsEnabled = (): boolean =>
  readOptionalEnv(SOCIETY_PI_ACTIONS_ENABLED_ENV) === "1";

const readSocietyPiProvider = (): SocietyPiProvider => {
  const configured = readOptionalEnv(SOCIETY_PI_PROVIDER_ENV);
  if (!configured) return DEFAULT_PI_PROVIDER;
  if (configured === "openai-codex" || configured === "anthropic") {
    return configured;
  }
  throw new Error(
    `${SOCIETY_PI_PROVIDER_ENV} must be openai-codex or anthropic`,
  );
};

const readSocietyPiActionConfig = () => ({
  enabled: readSocietyPiActionsEnabled(),
  runtimeUrl:
    readOptionalEnv(SOCIETY_PI_RUNTIME_URL_ENV) ?? DEFAULT_PI_RUNTIME_URL,
  provider: readSocietyPiProvider(),
  modelId: readOptionalEnv(SOCIETY_PI_MODEL_ENV) ?? DEFAULT_PI_MODEL_ID,
});

const stripTrailingSlash = (value: string): string => value.replace(/\/+$/, "");

const normalizeSocietyUrl = (url: string): string => {
  const normalized = stripTrailingSlash(url);
  return normalized.endsWith("/society") ? normalized : `${normalized}/society`;
};

const readHeaderValue = (
  value: string | string[] | undefined,
): string | undefined => (Array.isArray(value) ? value[0] : value);

const buildRequestSocietyUrl = (
  request: IncomingMessage,
): string | undefined => {
  const host =
    readHeaderValue(request.headers["x-forwarded-host"]) ??
    readHeaderValue(request.headers.host);
  if (!host) return undefined;
  const protocol =
    readHeaderValue(request.headers["x-forwarded-proto"]) ?? "http";
  return normalizeSocietyUrl(`${protocol}://${host}`);
};

const isLocalHostname = (hostname: string): boolean =>
  hostname === "127.0.0.1" || hostname === "localhost" || hostname === "::1";

const isLoopbackRemoteAddress = (remoteAddress: string | undefined): boolean =>
  remoteAddress !== undefined && LOOPBACK_REMOTE_ADDRESSES.has(remoteAddress);

const readRequestHost = (request: IncomingMessage): string | undefined =>
  readHeaderValue(request.headers["x-forwarded-host"]) ??
  readHeaderValue(request.headers.host);

const isLocalRequestHost = (request: IncomingMessage): boolean => {
  const host = readRequestHost(request);
  if (!host) return false;

  try {
    return isLocalHostname(new URL(`http://${host}`).hostname);
  } catch {
    return false;
  }
};

const isLiveMutationRequest = (
  request: IncomingMessage,
  requestUrl: URL,
): boolean => {
  if (request.method !== "POST") return false;
  if (requestUrl.pathname === "/api/society/live/start") return true;
  return /^\/api\/society\/live\/[^/]+\/(?:play|pause|step)$/.test(
    requestUrl.pathname,
  );
};

const canAcceptLiveMutationRequest = (request: IncomingMessage): boolean =>
  (isLoopbackRemoteAddress(request.socket.remoteAddress) &&
    isLocalRequestHost(request)) ||
  readOptionalEnv(PUBLIC_LIVE_MUTATION_ALLOW_ENV) === "1";

const requireLocalRpc = (rpcUrl: string): void => {
  if (readOptionalEnv(REMOTE_RPC_ALLOW_ENV) === "1") return;
  const url = new URL(rpcUrl);
  const isLocalhost =
    url.hostname === "127.0.0.1" || url.hostname === "localhost";
  if (!isLocalhost) {
    throw new Error(
      "Refusing to commit from this demo server to a non-local RPC. Set SUBSTRATE_ALLOW_REMOTE_RPC=1 only if you know exactly what you are doing.",
    );
  }
};

const assertRpcReady = async (rpcUrl: string): Promise<void> => {
  try {
    const response = await fetch(rpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(RPC_HEALTH_REQUEST),
    });
    const payload = (await response.json()) as { result?: unknown };
    if (!response.ok || !payload.result) {
      throw new Error(`RPC returned ${response.status}`);
    }
  } catch (error) {
    throw new Error(
      `Surfpool RPC is not reachable at ${rpcUrl}. Start Surfpool on the configured local RPC port before committing.`,
    );
  }
};

const postRpc = async <TResult>(
  rpcUrl: string,
  method: string,
  params: ReadonlyArray<unknown>,
): Promise<TResult> => {
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method,
      params,
    }),
  });
  const payload = (await response.json()) as {
    result?: TResult;
    error?: { message?: string };
  };
  if (!response.ok || payload.error || payload.result === undefined) {
    throw new Error(
      payload.error?.message ?? `RPC ${method} returned ${response.status}`,
    );
  }
  return payload.result;
};

const requestAgentAirdrop = async (
  rpcUrl: string,
  agentAddress: string,
  lamports: bigint,
): Promise<string | undefined> => {
  if (lamports === 0n) return undefined;
  if (lamports > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error("Agent airdrop amount exceeds safe JSON-RPC integer range");
  }
  const signature = await postRpc<string>(rpcUrl, "requestAirdrop", [
    agentAddress,
    Number(lamports),
  ]);
  for (let attempt = 0; attempt < AIRDROP_CONFIRMATION_ATTEMPTS; attempt += 1) {
    const status = await postRpc<{
      value?: ReadonlyArray<{ confirmationStatus?: string | null } | null>;
    }>(rpcUrl, "getSignatureStatuses", [[signature]]);
    const confirmationStatus = status.value?.[0]?.confirmationStatus ?? null;
    if (
      confirmationStatus === RPC_SIGNATURE_STATUS_COMMITMENT ||
      confirmationStatus === "confirmed" ||
      confirmationStatus === "finalized"
    ) {
      return signature;
    }
    await wait(AIRDROP_CONFIRMATION_DELAY_MS);
  }
  return signature;
};

const displayRpcUrl = (rpcUrl: string): string =>
  readOptionalEnv(PUBLIC_RPC_URL_ENV) ?? rpcUrl;

const displayStudioUrl = (studioUrl: string): string =>
  readOptionalEnv(PUBLIC_SURFPOOL_STUDIO_URL_ENV) ?? studioUrl;

const displaySocietyUrl = (societyUrl: string): string =>
  normalizeSocietyUrl(readOptionalEnv(PUBLIC_SOCIETY_URL_ENV) ?? societyUrl);

const buildPublicLinkConfig = (societyUrl = "/society") => {
  const rpcUrl = readLocalRpcUrl();
  const studioUrl = readLocalSurfpoolStudioUrl();
  return {
    societyUrl: displaySocietyUrl(societyUrl),
    rpcUrl: displayRpcUrl(rpcUrl),
    studioUrl: displayStudioUrl(studioUrl),
  };
};

const callLocalRpc = async (method: string, params: unknown[]) => {
  const rpcUrl = readLocalRpcUrl();
  requireLocalRpc(rpcUrl);
  await assertRpcReady(rpcUrl);

  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": JSON_CONTENT_TYPE },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: randomUUID(),
      method,
      params,
    }),
  });

  if (!response.ok) {
    throw new Error(`Surfpool RPC returned ${response.status}`);
  }

  return response.json();
};

const assertBase58Identifier = (value: string): void => {
  if (!BASE58_IDENTIFIER.test(value)) {
    throw new Error("Invalid local Surfpool identifier");
  }
};

const readSurfpoolAccount = async (address: string) => {
  assertBase58Identifier(address);
  return callLocalRpc("getAccountInfo", [
    address,
    {
      commitment: "processed",
      encoding: "base64",
    },
  ]);
};

const readSurfpoolTransaction = async (signature: string) => {
  assertBase58Identifier(signature);
  return callLocalRpc("getTransaction", [
    signature,
    {
      commitment: "processed",
      encoding: "json",
      maxSupportedTransactionVersion: 0,
    },
  ]);
};

const createCommitId = (): string =>
  `commit_${Date.now().toString(36)}_${randomUUID()
    .replaceAll("-", "")
    .slice(0, COMMIT_ID_HEX_LENGTH)}`;

const parsePositiveTokenAmount = (
  value: number | string | undefined,
): bigint | undefined => {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value > 0 ? BigInt(value) : undefined;
  }
  if (typeof value === "string" && /^[0-9]+$/.test(value)) {
    const parsed = BigInt(value);
    return parsed > 0n ? parsed : undefined;
  }
  return undefined;
};

const normalizeTokenizedAgents = (
  run: SocietyRunPayload,
): SocietyTokenizedAgent[] => {
  const source =
    run.tokenizedAgents && run.tokenizedAgents.length > 0
      ? run.tokenizedAgents
      : (run.events ?? [])
          .filter(
            (event) =>
              (event.action === "genesis" || event.action === "birth") &&
              event.tokenDelta > 0,
          )
          .map((event) => ({
            agentId: event.agentId,
            agentName: event.agentName,
            sourceEventId: event.id,
            tick: event.tick,
            startingTokens: event.tokenDelta,
            tokenProgram: TOKEN_PROGRAM_AGENT_STAKE,
          }));

  const seen = new Set<string>();
  const tokenizedAgents: SocietyTokenizedAgent[] = [];
  for (const agent of source) {
    if (!agent.agentId || seen.has(agent.agentId)) continue;
    if (!parsePositiveTokenAmount(agent.startingTokens)) continue;
    seen.add(agent.agentId);
    tokenizedAgents.push({
      ...agent,
      tokenProgram: agent.tokenProgram || TOKEN_PROGRAM_AGENT_STAKE,
    });
  }
  return tokenizedAgents;
};

const selectInitialLiveAgentSetupEvents = (
  run: SocietyRunPayload,
): SocietyLiveEvent[] => {
  const events = run.events ?? [];
  return normalizeTokenizedAgents(run).map((agent) => {
    const sourceEvent =
      events.find((event) => event.id === agent.sourceEventId) ??
      events.find(
        (event) =>
          event.agentId === agent.agentId &&
          (event.action === "genesis" || event.action === "birth"),
      );
    if (!sourceEvent) {
      throw new Error(
        `Missing genesis or birth event for initial agent ${agent.agentId}`,
      );
    }
    if (!sourceEvent.cell) {
      throw new Error(`Missing source cell for initial agent ${agent.agentId}`);
    }
    if (!sourceEvent.actorIdentityId) {
      throw new Error(
        `Missing actor identity for initial agent ${agent.agentId}`,
      );
    }
    return {
      id: sourceEvent.id,
      tick: sourceEvent.tick,
      agentId: agent.agentId,
      agentName: sourceEvent.agentName ?? agent.agentName ?? agent.agentId,
      actorIdentityId: sourceEvent.actorIdentityId,
      action: sourceEvent.action,
      receiptKind: sourceEvent.receiptKind,
      tokenDelta: agent.startingTokens,
      cell: sourceEvent.cell,
      payloadExtras: sourceEvent.payloadExtras,
    };
  });
};

const prepareInitialLiveAgentAccounts = async (
  chainSession: SocietyLiveChainSession,
  run: SocietyRunPayload,
): Promise<void> => {
  const setupEvents = selectInitialLiveAgentSetupEvents(run);
  for (const event of setupEvents) {
    await ensureLiveAgentAccount(chainSession, event);
  }
};

const buildLiveSetupStatus = (
  chainSession: SocietyLiveChainSession,
): SocietyLiveSetupStatus => {
  const agentAccounts = chainSession.agentAccounts;
  const requestedAgentCount = Math.max(
    chainSession.programPlan.summary.tokenizedAgents,
    agentAccounts.length,
  );
  return {
    stakeAsset: SOL_STAKE_ASSET_LABEL,
    requestedAgentCount,
    readyAgentCount: agentAccounts.filter(
      (account) =>
        account.authority.address &&
        account.identity.address &&
        account.delegation.address &&
        account.stake.address,
    ).length,
    fundedAgentCount: agentAccounts.filter(
      (account) => account.funding?.signature,
    ).length,
    identityAccountCount: agentAccounts.filter(
      (account) => account.identity.address,
    ).length,
    delegationAccountCount: agentAccounts.filter(
      (account) => account.delegation.address,
    ).length,
    solStakeAccountCount: agentAccounts.filter(
      (account) => account.stake.address,
    ).length,
    protocolOperationCount: chainSession.operations.length,
    worldReady: Boolean(chainSession.world.address),
  };
};

const buildBatchReceipt = (
  run: SocietyRunPayload,
  batch: SocietyCompressedTx,
  commitId: string,
  sequence: number,
  previousReceiptId: string | undefined,
  actorId: string,
  taskId: string,
  proof: CommitProofReference,
  totalBatches: number,
): ReceiptRecord => {
  const payload = {
    domain: SOCIETY_DOMAIN,
    runId: run.runId,
    commitId,
    offlineProofHash: proof.hash,
    offlineProofUrl: proof.url,
    batchId: batch.batchId,
    eventRoot: batch.eventRoot,
    compressedBatchSequence: sequence,
    totalCompressedBatches: totalBatches,
    compressedReceiptCount: batch.receipts.length,
    sourceReceiptIds: batch.receipts.map((receipt) => receipt.receiptId),
  };
  return createReceipt({
    actorId,
    kind: "completion",
    taskId,
    sequence,
    previousReceiptId,
    payload: {
      ...payload,
      payloadHash: hashCanonical(payload),
    },
  });
};

const buildDisputeAuditReceipt = (
  run: SocietyRunPayload,
  commitId: string,
  sequence: number,
  previousReceiptId: string | undefined,
  actorId: string,
  taskId: string,
  proof: CommitProofReference,
  totalBatches: number,
): ReceiptRecord => {
  const payload = {
    domain: SOCIETY_DOMAIN,
    runId: run.runId,
    commitId,
    offlineProofHash: proof.hash,
    offlineProofUrl: proof.url,
    audit: "society-run-complete",
    compressedBatchCount: totalBatches,
  };
  return createReceipt({
    actorId,
    kind: "dispute",
    taskId,
    sequence,
    previousReceiptId,
    payload: {
      ...payload,
      payloadHash: hashCanonical(payload),
    },
  });
};

const describeError = (error: unknown): string => {
  if (!(error instanceof Error)) return String(error);
  const details = [
    error.message,
    (error as Error & { cause?: { message?: string } }).cause?.message,
    Array.isArray((error as Error & { logs?: string[] }).logs)
      ? (error as Error & { logs: string[] }).logs.join(" | ")
      : undefined,
  ].filter(Boolean);
  return details.join(" :: ");
};

const withLiveOperationContext = async <T>(
  label: string,
  operation: Promise<T>,
): Promise<T> => {
  try {
    return await operation;
  } catch (error) {
    throw new Error(`${label}: ${describeError(error)}`);
  }
};

const requireTransactionSignature = (
  value: { readonly signature?: string },
  context: string,
): string => {
  if (!value.signature) {
    throw new Error(`${context} did not return a transaction signature`);
  }
  return value.signature;
};

const requireReceiptPayloadHash = (receipt: ReceiptRecord): string => {
  const payloadHash = receipt.payload.payloadHash;
  if (typeof payloadHash !== "string" || payloadHash.length === 0) {
    throw new Error(`Receipt ${receipt.receiptId} is missing payloadHash`);
  }
  return payloadHash;
};

const isZeroAddress = (value: string | undefined): boolean =>
  !value || value === ZERO_ADDRESS;

const nextReceiptSequenceFromTask = (
  task: OnchainTaskRecord | undefined,
): number => {
  const nextSequence = (task?.lastSequence ?? 0n) + 1n;
  if (nextSequence > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error(`Receipt sequence ${nextSequence.toString()} is too large`);
  }
  return Number(nextSequence);
};

const lastReceiptSequenceFromTask = (
  task: OnchainTaskRecord | undefined,
): number => {
  const lastSequence = task?.lastSequence ?? 0n;
  if (lastSequence > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error(`Receipt sequence ${lastSequence.toString()} is too large`);
  }
  return Number(lastSequence);
};

const receiptChainFromTask = (
  task: OnchainTaskRecord | undefined,
): SocietyAgentTaskReceiptChain => ({
  sequence: lastReceiptSequenceFromTask(task),
  previousReceiptId: isZeroAddress(task?.lastReceipt)
    ? undefined
    : task?.lastReceipt,
});

const advanceBoardReceiptChain = (
  chainSession: SocietyLiveChainSession,
  receiptAddress: string,
): void => {
  chainSession.previousReceiptId = receiptAddress;
  chainSession.receiptSequence += 1;
};

const boardLastReceiptSequence = (
  chainSession: SocietyLiveChainSession,
): number => chainSession.receiptSequence - 1;

const nextAgentTaskReceiptChain = (
  chainSession: SocietyLiveChainSession,
  agentId: string,
): SocietyAgentTaskReceiptChain => {
  const current = chainSession.agentTaskReceiptChainsById.get(agentId);
  if (!current) return { sequence: FIRST_RECEIPT_SEQUENCE };
  return {
    sequence: current.sequence + 1,
    previousReceiptId: current.previousReceiptId,
  };
};

const advanceAgentTaskReceiptChain = (
  chainSession: SocietyLiveChainSession,
  agentId: string,
  receiptAddress: string,
): void => {
  const current = chainSession.agentTaskReceiptChainsById.get(agentId);
  chainSession.agentTaskReceiptChainsById.set(agentId, {
    sequence: (current?.sequence ?? 0) + 1,
    previousReceiptId: receiptAddress,
  });
};

const commitSocietyRun = async (run: SocietyRunPayload) => {
  if (!run.runId) {
    throw new Error("Run payload must include runId and compressedTxs");
  }

  const batches = selectCommitBatches(run);
  const rpcUrl = readLocalRpcUrl();
  const rpcSubscriptionsUrl = readLocalRpcSubscriptionsUrl();
  const studioUrl = readLocalSurfpoolStudioUrl();
  const keypairPath = readKeypairPath();
  const commitId = createCommitId();
  const createdAt = new Date().toISOString();
  const tokenizedAgents = normalizeTokenizedAgents(run);
  const programPlan = buildProgramWiringPlan({
    ...run,
    tokenizedAgents,
  });
  const operations: unknown[] = [];
  const agentAccounts: unknown[] = [];
  const committedReceipts: unknown[] = [];
  let chainIdentity: unknown;
  let chainTask: unknown;
  let chainReputation: unknown;
  let chainCheckpoint: unknown;
  let chainAdjudicator: unknown;
  let chainDispute: unknown;

  const buildChainEvidence = (): CommitProofChainEvidence => {
    const chain = {
      rpcUrl,
      studioUrl,
      programPlan,
      identity: chainIdentity,
      task: chainTask,
      reputation: chainReputation,
      checkpoint: chainCheckpoint,
      adjudicator: chainAdjudicator,
      dispute: chainDispute,
      agentAccounts,
      committedReceipts,
      operations,
      totalBatches: batches.length,
      committedBatchCount: committedReceipts.length,
    } satisfies CommitProofChainEvidence;

    return {
      ...chain,
      protocolEvidence: buildProtocolEvidenceGraph({
        programPlan,
        chain,
        generatedAt: createdAt,
      }),
    };
  };

  const { artifact: preparedArtifact, reference: preparedProof } =
    await writeCommitProofArtifact({
      proofDirectory: PROOF_DIRECTORY,
      routePrefix: PROOF_ROUTE_PREFIX,
      run,
      commitId,
      status: "prepared",
      createdAt,
    });

  try {
    requireLocalRpc(rpcUrl);

    if (!existsSync(keypairPath)) {
      throw new Error(`Keypair not found at ${keypairPath}`);
    }

    await assertRpcReady(rpcUrl);

    const authority = await loadKeyPairSignerFromFile(keypairPath);
    const dispatcher = createKitTransactionDispatcher({
      rpcUrl,
      rpcSubscriptionsUrl,
      commitment: "processed",
    });
    const client = new TrustSubstrateOnchainClient(dispatcher);
    const identity = createIdentity({
      authority: authority.address,
      label: `society-${run.runId}-${commitId}`,
    });
    const task = createTask({
      identityId: identity.identityId,
      title: `Agent society ${run.runId} ${commitId}`,
      domain: SOCIETY_DOMAIN,
      description: `${run.config?.agents ?? "n"} initial agents over ${
        run.config?.ticks ?? "n"
      } ticks`,
    });
    const domainCatalogAddress = await client.getDomainCatalogAddress();

    operations.push(await client.ensureDomainCatalog({ curator: authority }));
    operations.push(
      await client.ensureDomainRegistered({
        curator: authority,
        domainCatalog: domainCatalogAddress,
        taskOrDomain: SOCIETY_DOMAIN,
      }),
    );
    operations.push(await client.ensureCpiAuthority({ payer: authority }));
    operations.push(
      await client.ensureAttesterRegistry({ curator: authority }),
    );
    operations.push(await client.ensureHistoryUpdater({ payer: authority }));
    const adjudicatorCommit = await client.ensureAdjudicator({
      governance: authority,
      adjudicator: authority.address,
    });
    operations.push(adjudicatorCommit);
    chainAdjudicator = {
      address: adjudicatorCommit.address,
      adjudicator: adjudicatorCommit.adjudicator,
      treasuryVault: adjudicatorCommit.treasuryVault,
    };

    const identityCommit = await client.ensureIdentity({
      authority,
      identity,
    });
    operations.push(identityCommit);
    operations.push(
      await client.ensureIdentityBond({
        authority,
        identity: identityCommit.address,
      }),
    );
    const attesterCommit = await client.ensureAttester({
      authority,
      identity: identityCommit.address,
      category: SOCIETY_ATTESTER_CATEGORY,
      selfDeclaredTier: SOCIETY_ATTESTER_TIER,
    });
    operations.push(attesterCommit);
    chainIdentity = {
      id: identity.identityId,
      address: identityCommit.address,
      bond: attesterCommit.identityBond,
      attester: attesterCommit.address,
    };

    const taskCommit = await client.ensureTask({
      authority,
      identity: identityCommit.address,
      task,
    });
    operations.push(taskCommit);
    chainTask = {
      id: task.taskId,
      address: taskCommit.address,
    };

    const reputationCommit = await client.ensureReputationDomain({
      authority,
      identity: identityCommit.address,
      domainCatalog: domainCatalogAddress,
      taskOrDomain: SOCIETY_DOMAIN,
      completionWeight: 1n,
      disputeWeight: 1n,
      disputeResolvedWeight: 1n,
    });
    operations.push(reputationCommit);
    chainReputation = {
      address: reputationCommit.address,
      domain: SOCIETY_DOMAIN,
    };

    const checkpointCommit = await client.ensureHistoryCheckpoint({
      authority,
      identity: identityCommit.address,
      epoch: SOCIETY_CHECKPOINT_EPOCH,
    });
    operations.push(checkpointCommit);
    chainCheckpoint = {
      address: checkpointCommit.address,
      latestCheckpoint: checkpointCommit.latestCheckpoint,
      epoch: checkpointCommit.epoch.toString(),
    };

    const delegatedAgentAddresses = new Set<string>();
    for (const tokenizedAgent of tokenizedAgents) {
      const amount = parsePositiveTokenAmount(tokenizedAgent.startingTokens);
      if (!amount) continue;

      const agentIdentity = createIdentity({
        authority: authority.address,
        label: `society-agent-${run.runId}-${commitId}-${tokenizedAgent.agentId}`,
      });
      const agentIdentityCommit = await client.ensureIdentity({
        authority,
        identity: agentIdentity,
      });
      operations.push({
        ...agentIdentityCommit,
        agentId: tokenizedAgent.agentId,
        tokenProgram: TOKEN_PROGRAM_AGENT_STAKE,
        tokenAmount: amount.toString(),
      });
      const delegationCommit = await client.ensureDelegation({
        authority,
        identity: identityCommit.address,
        delegate: agentIdentityCommit.address,
        allowedActions: DELEGATION_FULL_SCOPE,
      });
      operations.push({
        ...delegationCommit,
        agentId: tokenizedAgent.agentId,
      });
      delegatedAgentAddresses.add(agentIdentityCommit.address);

      const stakeInit = await client.ensureStake({
        owner: authority,
        identity: agentIdentityCommit.address,
        slashAuthority: authority.address,
        trustMode: TRUST_MODE_VERDICT,
      });
      operations.push({
        ...stakeInit,
        agentId: tokenizedAgent.agentId,
        tokenProgram: TOKEN_PROGRAM_AGENT_STAKE,
        tokenAmount: amount.toString(),
      });

      const stakeDeposit = await client.stake({
        owner: authority,
        identity: agentIdentityCommit.address,
        amount,
      });
      operations.push({
        ...stakeDeposit,
        agentId: tokenizedAgent.agentId,
        tokenProgram: TOKEN_PROGRAM_AGENT_STAKE,
        tokenAmount: amount.toString(),
      });

      agentAccounts.push({
        agentId: tokenizedAgent.agentId,
        agentName: tokenizedAgent.agentName ?? tokenizedAgent.agentId,
        sourceEventId: tokenizedAgent.sourceEventId,
        sourceReceiptId: tokenizedAgent.sourceReceiptId,
        startingTokens: amount.toString(),
        tokenProgram: TOKEN_PROGRAM_AGENT_STAKE,
        identity: {
          id: agentIdentity.identityId,
          address: agentIdentityCommit.address,
          signature: agentIdentityCommit.signature,
        },
        delegation: {
          address: delegationCommit.address,
          delegate: delegationCommit.delegate,
          signature: delegationCommit.signature,
        },
        stake: {
          address: stakeDeposit.address,
          signature: stakeDeposit.signature,
          slot: stakeDeposit.slot,
        },
      });
    }

    if (delegatedAgentAddresses.size === 0) {
      operations.push(
        await client.ensureDelegation({
          authority,
          identity: identityCommit.address,
          delegate: authority.address,
          allowedActions: DELEGATION_FULL_SCOPE,
        }),
      );
    }

    let previousReceiptId: string | undefined;

    for (const [index, batch] of batches.entries()) {
      const receipt = buildBatchReceipt(
        run,
        batch,
        commitId,
        index + 1,
        previousReceiptId,
        identity.identityId,
        task.taskId,
        preparedProof,
        batches.length,
      );
      let committedReceipt;
      try {
        committedReceipt = await client.emitReceipt({
          authority,
          identity: identityCommit.address,
          task: taskCommit.address,
          domainCatalog: domainCatalogAddress,
          receipt,
        });
      } catch (error) {
        throw new Error(
          `Failed to emit ${batch.batchId}: ${describeError(error)}`,
        );
      }
      operations.push(committedReceipt);
      let checkpointAppend;
      try {
        checkpointAppend = await client.appendReceiptToCheckpoint({
          feePayer: authority,
          identity: identityCommit.address,
          checkpoint: checkpointCommit.address,
          latestCheckpoint: checkpointCommit.latestCheckpoint,
          receipt: committedReceipt.address,
        });
        operations.push(checkpointAppend);
      } catch (error) {
        throw new Error(
          `Failed to checkpoint ${batch.batchId}: ${describeError(error)}`,
        );
      }
      try {
        operations.push(
          await client.syncTaskStatus({
            authority,
            identity: identityCommit.address,
            task: taskCommit.address,
            receipt: committedReceipt.address,
          }),
        );
      } catch (error) {
        throw new Error(
          `Failed to sync ${batch.batchId}: ${describeError(error)}`,
        );
      }
      let reputationApply;
      try {
        reputationApply = await client.applyReputationReceipt({
          authority,
          identity: identityCommit.address,
          receipt: committedReceipt.address,
          reputation: reputationCommit.address,
        });
        operations.push(reputationApply);
      } catch (error) {
        throw new Error(
          `Failed to apply reputation for ${batch.batchId}: ${describeError(
            error,
          )}`,
        );
      }
      committedReceipts.push({
        batchId: batch.batchId,
        receiptId: receipt.receiptId,
        sourceReceiptCount: batch.receipts.length,
        address: committedReceipt.address,
        signature: committedReceipt.signature,
        slot: committedReceipt.slot,
        checkpoint: {
          address: checkpointCommit.address,
          signature: checkpointAppend.signature,
        },
        reputation: {
          address: reputationCommit.address,
          signature: reputationApply.signature,
        },
      });
      previousReceiptId = committedReceipt.address;
    }

    const disputeReceipt = buildDisputeAuditReceipt(
      run,
      commitId,
      batches.length + 1,
      previousReceiptId,
      identity.identityId,
      task.taskId,
      preparedProof,
      batches.length,
    );
    let committedDisputeReceipt;
    try {
      committedDisputeReceipt = await client.emitReceipt({
        authority,
        identity: identityCommit.address,
        task: taskCommit.address,
        domainCatalog: domainCatalogAddress,
        receipt: disputeReceipt,
      });
      operations.push(committedDisputeReceipt);
    } catch (error) {
      throw new Error(
        `Failed to emit dispute audit receipt: ${describeError(error)}`,
      );
    }
    let disputeCheckpointAppend;
    try {
      disputeCheckpointAppend = await client.appendReceiptToCheckpoint({
        feePayer: authority,
        identity: identityCommit.address,
        checkpoint: checkpointCommit.address,
        latestCheckpoint: checkpointCommit.latestCheckpoint,
        receipt: committedDisputeReceipt.address,
      });
      operations.push(disputeCheckpointAppend);
    } catch (error) {
      throw new Error(
        `Failed to checkpoint dispute audit receipt: ${describeError(error)}`,
      );
    }
    try {
      operations.push(
        await client.syncTaskStatus({
          authority,
          identity: identityCommit.address,
          task: taskCommit.address,
          receipt: committedDisputeReceipt.address,
        }),
      );
    } catch (error) {
      throw new Error(
        `Failed to sync dispute audit receipt: ${describeError(error)}`,
      );
    }
    const verdictCommit = await client.ensureVerdict({
      adjudicator: authority,
      disputeReceipt: committedDisputeReceipt.address,
      outcome: NO_FAULT_OUTCOME,
      slashAmount: 0n,
      class: VERDICT_CLASS_SAFETY,
      staleAfterSlot: 0n,
    });
    operations.push(verdictCommit);
    chainDispute = {
      receipt: committedDisputeReceipt.address,
      verdict: verdictCommit.address,
      verdictSignature: verdictCommit.signature,
    };
    committedReceipts.push({
      batchId: "dispute_audit",
      receiptId: disputeReceipt.receiptId,
      sourceReceiptCount: 0,
      address: committedDisputeReceipt.address,
      signature: committedDisputeReceipt.signature,
      slot: committedDisputeReceipt.slot,
      checkpoint: {
        address: checkpointCommit.address,
        signature: disputeCheckpointAppend.signature,
      },
      verdict: {
        address: verdictCommit.address,
        signature: verdictCommit.signature,
      },
    });
    previousReceiptId = committedDisputeReceipt.address;

    const finalChainEvidence = buildChainEvidence();
    const { reference: committedProof } = await writeCommitProofArtifact({
      proofDirectory: PROOF_DIRECTORY,
      routePrefix: PROOF_ROUTE_PREFIX,
      run,
      commitId,
      status: "committed",
      createdAt,
      preparedProofHash: preparedArtifact.proofHash,
      chain: finalChainEvidence,
    });

    return {
      runId: run.runId,
      commitId,
      rpcUrl,
      studioUrl,
      programPlan,
      identity: chainIdentity,
      task: chainTask,
      reputation: chainReputation,
      checkpoint: chainCheckpoint,
      adjudicator: chainAdjudicator,
      dispute: chainDispute,
      agentAccounts,
      committedReceipts,
      operations,
      totalBatches: batches.length,
      proof: committedProof,
    };
  } catch (error) {
    const message = describeError(error);
    const { reference: failedProof } = await writeCommitProofArtifact({
      proofDirectory: PROOF_DIRECTORY,
      routePrefix: PROOF_ROUTE_PREFIX,
      run,
      commitId,
      status: "failed",
      createdAt,
      preparedProofHash: preparedArtifact.proofHash,
      chain: buildChainEvidence(),
      error: message,
    });
    const wrapped = new Error(
      `Commit failed; offline proof written to ${failedProof.url}: ${message}`,
    ) as Error & { proof?: CommitProofReference };
    wrapped.proof = failedProof;
    throw wrapped;
  }
};

const buildLiveChainEvidence = (
  chainSession: SocietyLiveChainSession,
  run: SocietyRunPayload,
): CommitProofChainEvidence => {
  const programPlan = buildProgramWiringPlan(run);
  const chain = {
    rpcUrl: chainSession.rpcUrl,
    studioUrl: chainSession.studioUrl,
    programPlan,
    identity: chainSession.identity,
    task: chainSession.task,
    world: {
      address: chainSession.world.address,
      status: chainSession.worldStatus,
    },
    reputation: chainSession.reputation,
    checkpoint: chainSession.checkpoint,
    adjudicator: chainSession.adjudicator,
    dispute: chainSession.dispute,
    agentAccounts: chainSession.agentAccounts,
    committedReceipts: chainSession.committedReceipts,
    operations: chainSession.operations,
    totalBatches: chainSession.committedReceipts.length,
    committedBatchCount: chainSession.committedReceipts.length,
  } satisfies CommitProofChainEvidence;

  return {
    ...chain,
    protocolEvidence: buildProtocolEvidenceGraph({
      programPlan,
      chain,
      generatedAt: chainSession.createdAt,
    }),
  };
};

const buildSignedLiveActionTranscript = (
  chainSession: SocietyLiveChainSession,
  run: SocietyRunPayload,
  options: {
    readonly afterActionFrame?: unknown;
  } = {},
): SocietyActionTranscript => {
  const runWithId = {
    ...run,
    runId: typeof run.runId === "string" ? run.runId : chainSession.runId,
  };
  return buildSocietyActionTranscript(runWithId, {
    source: {
      kind: "pi-agent",
      driver: "pi-agent-delegated-submitter",
      runtimeSessionId: chainSession.sessionId,
      note: "Each action is signed by the acting agent keypair before it is submitted. The board only reads committed Surfpool state; model launch is explicit and no Pi/LLM prompt is sent automatically.",
    },
    resolveStateCommitments: (context) => {
      const runEvents = Array.isArray(run.events) ? run.events : [];
      const latestEvent = runEvents[runEvents.length - 1];
      const latestEventId =
        latestEvent && typeof latestEvent.id === "string"
          ? latestEvent.id
          : undefined;
      if (!options.afterActionFrame || context.eventId !== latestEventId) {
        return {};
      }

      return {
        afterStateHash: hashCanonical({
          phase: "after-action",
          liveSessionId: chainSession.sessionId,
          runId: context.runId,
          eventId: context.eventId,
          sequence: context.sequence,
          receiptHash: context.receiptHash,
          frameHash: hashCanonical(options.afterActionFrame),
        }),
      };
    },
    resolveRuntimeEvidence: (context) => {
      const evidence = chainSession.piActionsByEventId.get(context.eventId);
      if (!evidence) return undefined;
      return {
        kind: "pi-action",
        provider: evidence.provider,
        modelId: evidence.modelId,
        promptHash: evidence.promptHash,
        responseHash: evidence.responseHash,
        decisionHash: evidence.decisionHash,
        decision: evidence.decision,
      };
    },
    signAction: (actionHash, action): SocietyActionSignature => {
      const runtime = chainSession.agentRuntimesById.get(action.agentId);
      if (!runtime) {
        throw new Error(
          `Missing local agent identity keypair for ${action.agentId}`,
        );
      }
      return {
        scheme: "ed25519/solana-agent-keypair",
        signer: runtime.signer.address,
        value: signBytes(
          null,
          Buffer.from(actionHash, "hex"),
          runtime.actionSigningKey,
        ).toString("hex"),
      };
    },
  });
};

const shouldRequestPiAction = (event: SocietyLiveEvent): boolean =>
  event.action !== "genesis";

const maybeRequestPiAction = async ({
  chainSession,
  event,
  receipt,
  frame,
  agentRuntime,
}: {
  readonly chainSession: SocietyLiveChainSession;
  readonly event: SocietyLiveEvent;
  readonly receipt: SocietyLiveReceipt;
  readonly frame?: SocietyLiveFrame;
  readonly agentRuntime: SocietyLiveAgentRuntime;
}): Promise<SocietyPiActionEvidence | undefined> => {
  const config = readSocietyPiActionConfig();
  if (!config.enabled || !shouldRequestPiAction(event)) return undefined;

  const existing = chainSession.piActionsByEventId.get(event.id);
  if (existing) return existing;

  const evidence = await requestSocietyPiAction({
    sessionId: chainSession.sessionId,
    runId: chainSession.runId,
    commitId: chainSession.commitId,
    runtimeUrl: config.runtimeUrl,
    provider: config.provider,
    modelId: config.modelId,
    agent: {
      id: event.agentId,
      name: event.agentName,
      signer: agentRuntime.signer.address,
      identity: agentRuntime.account.identity.address,
      delegation: agentRuntime.account.delegation.address,
    },
    event: {
      id: event.id,
      tick: event.tick,
      agentId: event.agentId,
      action: event.action,
      receiptKind: event.receiptKind,
      tokenDelta: event.tokenDelta,
      cell: event.cell,
      note:
        typeof event.payloadExtras?.note === "string"
          ? event.payloadExtras.note
          : undefined,
    },
    allowedActions: [
      {
        id: event.id,
        action: event.action,
        receiptKind: event.receiptKind,
        tokenDelta: event.tokenDelta,
        cell: event.cell,
        note:
          typeof event.payloadExtras?.note === "string"
            ? event.payloadExtras.note
            : event.note,
      },
    ],
    receipt: {
      receiptId: receipt.receiptId,
      kind: receipt.kind,
      payloadHash: receipt.payloadHash,
    },
    world: {
      beforeReceipt: chainSession.previousReceiptId,
      afterFrame: frame,
    },
  });
  chainSession.piActionsByEventId.set(event.id, evidence);
  chainSession.operations.push({
    kind: "pi_action_decision",
    eventId: event.id,
    agentId: event.agentId,
    provider: evidence.provider,
    modelId: evidence.modelId,
    promptHash: evidence.promptHash,
    responseHash: evidence.responseHash,
    decisionHash: evidence.decisionHash,
  });
  return evidence;
};

const buildCommittedPrefixRun = (
  run: SocietyRunPayload,
  eventId: string,
): SocietyRunPayload => {
  const events = Array.isArray(run.events) ? run.events : [];
  const eventIndex = events.findIndex((event) => event.id === eventId);
  if (eventIndex === -1) {
    throw new Error(
      `Cannot build transcript prefix for unknown event ${eventId}`,
    );
  }
  return {
    ...run,
    events: events.slice(0, eventIndex + 1),
    receipts: Array.isArray(run.receipts)
      ? run.receipts.slice(0, eventIndex + 1)
      : run.receipts,
  };
};

const initializeSocietyLiveChainSession = async (
  sessionId: string,
  run: SocietyRunPayload,
): Promise<SocietyLiveChainSession> => {
  const rpcUrl = readLocalRpcUrl();
  const rpcSubscriptionsUrl = readLocalRpcSubscriptionsUrl();
  const studioUrl = readLocalSurfpoolStudioUrl();
  const keypairPath = readKeypairPath();
  const commitId = createCommitId();
  const createdAt = new Date().toISOString();

  requireLocalRpc(rpcUrl);
  if (!existsSync(keypairPath)) {
    throw new Error(`Keypair not found at ${keypairPath}`);
  }
  await assertRpcReady(rpcUrl);

  const authority = await loadKeyPairSignerFromFile(keypairPath);
  const dispatcher = createKitTransactionDispatcher({
    rpcUrl,
    rpcSubscriptionsUrl,
    commitment: "processed",
  });
  const client = new TrustSubstrateOnchainClient(dispatcher);
  const identity = createIdentity({
    authority: authority.address,
    label: `society-live-${sessionId}`,
  });
  const task = createTask({
    identityId: identity.identityId,
    title: `Agent society live ${sessionId}`,
    domain: SOCIETY_DOMAIN,
    description: `${run.config?.agents ?? "n"} initial agents over ${
      run.config?.ticks ?? "n"
    } ticks`,
  });
  const domainCatalogAddress = await client.getDomainCatalogAddress();
  const operations: unknown[] = [];
  const agentAccounts: SocietyLiveAgentAccount[] = [];
  const agentAccountsById = new Map<string, SocietyLiveAgentAccount>();
  const agentRuntimesById = new Map<string, SocietyLiveAgentRuntime>();
  const agentTaskReceiptChainsById = new Map<
    string,
    SocietyAgentTaskReceiptChain
  >();
  const piActionsByEventId = new Map<string, SocietyPiActionEvidence>();
  const committedReceipts: unknown[] = [];
  const programPlan = buildProgramWiringPlan(run);

  operations.push(await client.ensureDomainCatalog({ curator: authority }));
  operations.push(
    await client.ensureDomainRegistered({
      curator: authority,
      domainCatalog: domainCatalogAddress,
      taskOrDomain: SOCIETY_DOMAIN,
    }),
  );
  operations.push(await client.ensureCpiAuthority({ payer: authority }));
  operations.push(await client.ensureAttesterRegistry({ curator: authority }));
  operations.push(await client.ensureHistoryUpdater({ payer: authority }));
  const adjudicatorCommit = await client.ensureAdjudicator({
    governance: authority,
    adjudicator: authority.address,
  });
  operations.push(adjudicatorCommit);

  const identityCommit = await client.ensureIdentity({
    authority,
    identity,
  });
  operations.push(identityCommit);
  operations.push(
    await client.ensureIdentityBond({
      authority,
      identity: identityCommit.address,
    }),
  );
  const attesterCommit = await client.ensureAttester({
    authority,
    identity: identityCommit.address,
    category: SOCIETY_ATTESTER_CATEGORY,
    selfDeclaredTier: SOCIETY_ATTESTER_TIER,
  });
  operations.push(attesterCommit);

  const taskCommit = await client.ensureTask({
    authority,
    identity: identityCommit.address,
    task,
  });
  operations.push(taskCommit);
  const boardTaskRecord = await client.fetchMaybeTask({
    task: taskCommit.address,
  });

  const reputationCommit = await client.ensureReputationDomain({
    authority,
    identity: identityCommit.address,
    domainCatalog: domainCatalogAddress,
    taskOrDomain: SOCIETY_DOMAIN,
    completionWeight: 1n,
    disputeWeight: 1n,
    disputeResolvedWeight: 1n,
  });
  operations.push(reputationCommit);

  const checkpointCommit = await client.ensureHistoryCheckpoint({
    authority,
    identity: identityCommit.address,
    epoch: SOCIETY_CHECKPOINT_EPOCH,
  });
  operations.push(checkpointCommit);
  const worldBinding = await client.bindSocietyWorld({
    task: taskCommit.address,
  });

  const chainSession: SocietyLiveChainSession = {
    sessionId,
    runId: run.runId,
    commitId,
    createdAt,
    rpcUrl,
    studioUrl,
    authority,
    client,
    domainCatalogAddress,
    identity: {
      id: identity.identityId,
      address: identityCommit.address,
      bond: attesterCommit.identityBond,
      attester: attesterCommit.address,
    },
    task: {
      id: task.taskId,
      address: taskCommit.address,
    },
    reputation: {
      address: reputationCommit.address,
      domain: SOCIETY_DOMAIN,
    },
    checkpoint: {
      address: checkpointCommit.address,
      latestCheckpoint: checkpointCommit.latestCheckpoint,
      epoch: checkpointCommit.epoch.toString(),
    },
    adjudicator: {
      address: adjudicatorCommit.address,
      adjudicator: adjudicatorCommit.adjudicator,
      treasuryVault: adjudicatorCommit.treasuryVault,
    },
    world: {
      address: worldBinding.address,
    },
    operations,
    agentAccounts,
    agentAccountsById,
    agentRuntimesById,
    agentTaskReceiptChainsById,
    piActionsByEventId,
    committedReceipts,
    programPlan,
    worldStatus: SOCIETY_WORLD_STATUS_ACTIVE,
    receiptSequence: nextReceiptSequenceFromTask(boardTaskRecord),
    previousReceiptId: isZeroAddress(boardTaskRecord?.lastReceipt)
      ? undefined
      : boardTaskRecord?.lastReceipt,
  };

  await prepareInitialLiveAgentAccounts(chainSession, run);
  return chainSession;
};

const syncSocietyWorldState = async ({
  chainSession,
  simulation,
  completed,
}: {
  chainSession: SocietyLiveChainSession;
  simulation: SocietyLiveSimulationSession;
  completed: boolean;
}): Promise<SocietyLiveSimulationSession> => {
  const packedState = packOnchainSocietyWorldState(simulation);
  const status = completed
    ? SOCIETY_WORLD_STATUS_COMPLETE
    : SOCIETY_WORLD_STATUS_ACTIVE;
  const lastReceipt = (chainSession.previousReceiptId ??
    ZERO_ADDRESS) as string;
  const lastSequence = boardLastReceiptSequence(chainSession);
  const existingWorld = await chainSession.client.fetchMaybeSocietyWorld({
    task: chainSession.task.address,
  });
  const worldCommit = existingWorld
    ? await chainSession.client.updateSocietyWorld({
        authority: chainSession.authority,
        identity: chainSession.identity.address,
        task: chainSession.task.address,
        currentTick: simulation.currentTick,
        lastSequence,
        lastReceipt,
        status,
        state: packedState,
      })
    : await chainSession.client.createSocietyWorld({
        authority: chainSession.authority,
        identity: chainSession.identity.address,
        task: chainSession.task.address,
        currentTick: simulation.currentTick,
        lastSequence,
        lastReceipt,
        status,
        state: packedState,
      });
  chainSession.operations.push(worldCommit);

  let world = await chainSession.client.fetchMaybeSocietyWorld({
    task: chainSession.task.address,
  });
  for (
    let attempt = 0;
    !world && attempt < SOCIETY_WORLD_READ_RETRY_ATTEMPTS;
    attempt += 1
  ) {
    await wait(SOCIETY_WORLD_READ_RETRY_DELAY_MS);
    world = await chainSession.client.fetchMaybeSocietyWorld({
      task: chainSession.task.address,
    });
  }
  if (!world) {
    const signature =
      typeof worldCommit.signature === "string"
        ? worldCommit.signature
        : "unknown signature";
    const kind =
      typeof worldCommit.kind === "string" ? worldCommit.kind : "societyWorld";
    throw new Error(
      `Society world ${chainSession.task.address} did not appear after ${kind} (${signature})`,
    );
  }
  chainSession.worldStatus = world.status;
  chainSession.programPlan = buildProgramWiringPlan(
    finalizeLiveSocietySession(simulation),
  );
  return simulation;
};

const ensureLiveAgentAccount = async (
  chainSession: SocietyLiveChainSession,
  event: SocietyLiveEvent,
): Promise<SocietyLiveAgentRuntime> => {
  const existing = chainSession.agentRuntimesById.get(event.agentId);
  if (existing) return existing;

  const amount = parsePositiveTokenAmount(event.tokenDelta);
  if (!amount) {
    throw new Error(`Missing starting token amount for ${event.agentId}`);
  }
  const identityMaterial = await loadOrCreateSocietyAgentIdentity({
    rootDirectory: readSocietyAgentIdentityRoot(),
    sessionId: chainSession.sessionId,
    agentId: event.agentId,
    agentName: event.agentName,
  });
  const airdropLamports = readSocietyAgentAirdropLamports();
  const fundingSignature = await requestAgentAirdrop(
    chainSession.rpcUrl,
    identityMaterial.signer.address,
    airdropLamports,
  );
  if (fundingSignature) {
    chainSession.operations.push({
      kind: "fund_agent_identity",
      agentId: event.agentId,
      address: identityMaterial.signer.address,
      signature: fundingSignature,
      lamports: airdropLamports.toString(),
    });
  }

  const agentIdentityLabel = [
    "society-live",
    chainSession.sessionId,
    event.agentName ?? event.agentId,
    event.actorIdentityId ?? event.agentId,
  ].join("-");
  const agentIdentity = createIdentity({
    authority: identityMaterial.signer.address,
    label: agentIdentityLabel,
  });
  const agentIdentityCommit = await chainSession.client.ensureIdentity({
    authority: identityMaterial.signer,
    identity: agentIdentity,
  });
  chainSession.operations.push({
    ...agentIdentityCommit,
    agentId: event.agentId,
    tokenProgram: TOKEN_PROGRAM_AGENT_STAKE,
    tokenAmount: amount.toString(),
  });
  const agentTask = createTask({
    identityId: agentIdentity.identityId,
    title: `Society agent actions: ${event.agentName ?? event.agentId}`,
    domain: SOCIETY_DOMAIN,
    description:
      "Agent-owned task for reputation receipts derived from Society actions.",
    subtasks: [`agent:${event.agentId}`],
  });
  const agentTaskCommit = await chainSession.client.ensureTask({
    authority: identityMaterial.signer,
    identity: agentIdentityCommit.address,
    task: agentTask,
  });
  chainSession.operations.push({
    ...agentTaskCommit,
    agentId: event.agentId,
  });
  const agentTaskRecord = await chainSession.client.fetchMaybeTask({
    task: agentTaskCommit.address,
  });
  chainSession.agentTaskReceiptChainsById.set(
    event.agentId,
    receiptChainFromTask(agentTaskRecord),
  );
  const delegationCommit = await chainSession.client.ensureDelegation({
    authority: chainSession.authority,
    identity: chainSession.identity.address,
    delegate: identityMaterial.signer.address,
    allowedActions: DELEGATION_FULL_SCOPE,
  });
  chainSession.operations.push({
    ...delegationCommit,
    agentId: event.agentId,
  });
  const stakeInit = await chainSession.client.ensureStake({
    owner: identityMaterial.signer,
    identity: agentIdentityCommit.address,
    slashAuthority: chainSession.authority.address,
    trustMode: TRUST_MODE_VERDICT,
  });
  chainSession.operations.push({
    ...stakeInit,
    agentId: event.agentId,
    tokenProgram: TOKEN_PROGRAM_AGENT_STAKE,
    tokenAmount: amount.toString(),
  });
  const stakeDeposit = await chainSession.client.stake({
    owner: identityMaterial.signer,
    identity: agentIdentityCommit.address,
    amount,
  });
  chainSession.operations.push({
    ...stakeDeposit,
    agentId: event.agentId,
    tokenProgram: TOKEN_PROGRAM_AGENT_STAKE,
    tokenAmount: amount.toString(),
  });
  const reputationCommit = await chainSession.client.ensureReputationDomain({
    authority: identityMaterial.signer,
    identity: agentIdentityCommit.address,
    domainCatalog: chainSession.domainCatalogAddress,
    taskOrDomain: SOCIETY_DOMAIN,
    completionWeight: 1n,
    disputeWeight: 1n,
    disputeResolvedWeight: 1n,
  });
  chainSession.operations.push({
    ...reputationCommit,
    agentId: event.agentId,
  });

  const account: SocietyLiveAgentAccount = {
    agentId: event.agentId,
    agentName: event.agentName ?? event.agentId,
    authority: {
      address: identityMaterial.signer.address,
      identityDirectory: identityMaterial.directory,
      keypairPath: identityMaterial.keypairPath,
      created: identityMaterial.created,
    },
    startingTokens: amount.toString(),
    tokenProgram: TOKEN_PROGRAM_AGENT_STAKE,
    identity: {
      id: event.actorIdentityId ?? agentIdentity.identityId,
      address: agentIdentityCommit.address,
      signature: agentIdentityCommit.signature,
    },
    task: {
      id: agentTask.taskId,
      address: agentTaskCommit.address,
      signature: agentTaskCommit.signature,
    },
    delegation: {
      address: delegationCommit.address,
      delegate: delegationCommit.delegate,
      signature: delegationCommit.signature,
    },
    stake: {
      address: stakeDeposit.address,
      signature: stakeDeposit.signature,
      slot: stakeDeposit.slot,
    },
    reputation: {
      address: reputationCommit.address,
      domain: SOCIETY_DOMAIN,
      signature: reputationCommit.signature,
    },
    ...(fundingSignature
      ? {
          funding: {
            lamports: airdropLamports.toString(),
            signature: fundingSignature,
          },
        }
      : {}),
  };
  const runtime: SocietyLiveAgentRuntime = {
    agentId: event.agentId,
    signer: identityMaterial.signer,
    actionSigningKey: identityMaterial.actionSigningKey,
    account,
  };
  chainSession.agentAccounts.push(account);
  chainSession.agentAccountsById.set(event.agentId, account);
  chainSession.agentRuntimesById.set(event.agentId, runtime);
  return runtime;
};

const buildLiveChainReceipt = (
  chainSession: SocietyLiveChainSession,
  event: SocietyLiveEvent,
  receipt: SocietyLiveReceipt,
  actionTranscript: SocietyActionTranscript,
  agentRuntime: SocietyLiveAgentRuntime,
  piAction?: SocietyPiActionEvidence,
): ReceiptRecord => {
  const signedAction = actionTranscript.actions.find(
    (action) => action.eventId === event.id,
  );
  if (!signedAction) {
    throw new Error(`Missing signed action transcript entry for ${event.id}`);
  }
  const payload = {
    ...(receipt.payload ?? {}),
    liveSessionId: chainSession.sessionId,
    commitId: chainSession.commitId,
    offlineReceiptId: receipt.receiptId,
    offlinePayloadHash: receipt.payloadHash,
    actionTranscriptRoot: actionTranscript.root,
    signedAction,
    ...(piAction ? { piAction } : {}),
    logicalAgentId: event.agentId,
    logicalActorIdentityId: event.actorIdentityId ?? null,
  };
  return createReceipt({
    actorId: agentRuntime.signer.address,
    kind: receipt.kind ?? event.receiptKind ?? "completion",
    taskId: chainSession.task.id,
    sequence: chainSession.receiptSequence,
    previousReceiptId: chainSession.previousReceiptId,
    payload: {
      ...payload,
      payloadHash: hashCanonical(payload),
    },
  });
};

const applyAgentActionReputation = async ({
  chainSession,
  event,
  agentRuntime,
  sourceReceipt,
  committedKind,
}: {
  readonly chainSession: SocietyLiveChainSession;
  readonly event: SocietyLiveEvent;
  readonly agentRuntime: SocietyLiveAgentRuntime;
  readonly sourceReceipt: {
    readonly address: string;
    readonly signature?: string;
    readonly slot: number;
  };
  readonly committedKind: string;
}) => {
  if (
    !shouldApplyLiveReputation({
      action: event.action,
      kind: committedKind,
    })
  ) {
    return undefined;
  }

  const payload = {
    domain: SOCIETY_DOMAIN,
    action: "society_agent_action_reputation",
    sourceAction: event.action,
    sourceEventId: event.id,
    sourceReceipt: sourceReceipt.address,
    sourceReceiptSignature: sourceReceipt.signature,
    agentId: event.agentId,
    agentIdentity: agentRuntime.account.identity.address,
    boardIdentity: chainSession.identity.address,
    boardTask: chainSession.task.address,
  };
  const agentTaskReceiptChain = nextAgentTaskReceiptChain(
    chainSession,
    event.agentId,
  );
  const receipt = createReceipt({
    actorId: agentRuntime.signer.address,
    kind: committedKind,
    taskId: agentRuntime.account.task.id,
    sequence: agentTaskReceiptChain.sequence,
    previousReceiptId: agentTaskReceiptChain.previousReceiptId,
    payload: {
      ...payload,
      payloadHash: hashCanonical(payload),
    },
  });
  const committedReceipt = await withLiveOperationContext(
    `emit agent reputation receipt for ${event.id}`,
    chainSession.client.emitReceipt({
      authority: agentRuntime.signer,
      identity: agentRuntime.account.identity.address,
      task: agentRuntime.account.task.address,
      domainCatalog: chainSession.domainCatalogAddress,
      receipt,
    }),
  );
  chainSession.operations.push({
    ...committedReceipt,
    agentId: event.agentId,
    sourceEventId: event.id,
  });
  advanceAgentTaskReceiptChain(
    chainSession,
    event.agentId,
    committedReceipt.address,
  );
  const reputationApply = await withLiveOperationContext(
    `apply agent reputation for ${event.id}`,
    chainSession.client.applyReputationReceipt({
      authority: agentRuntime.signer,
      identity: agentRuntime.account.identity.address,
      receipt: committedReceipt.address,
      reputation: agentRuntime.account.reputation.address,
      evidenceAccounts: [{ address: agentRuntime.account.stake.address }],
    }),
  );
  chainSession.operations.push({
    ...reputationApply,
    agentId: event.agentId,
    sourceEventId: event.id,
  });

  return {
    receiptId: receipt.receiptId,
    address: committedReceipt.address,
    signature: committedReceipt.signature,
    slot: committedReceipt.slot,
    reputation: {
      address: agentRuntime.account.reputation.address,
      signature: reputationApply.signature,
    },
  };
};

const readSocietyDeathDisputeReason = (event: SocietyLiveEvent): string => {
  const reason = event.payloadExtras?.reason;
  return typeof reason === "string" && reason.length > 0
    ? reason
    : "society death rule";
};

const maybeApplySocietyDeathDisputeAdapter = async ({
  chainSession,
  event,
  agentRuntime,
  sourceReceipt,
  committedKind,
}: {
  chainSession: SocietyLiveChainSession;
  event: SocietyLiveEvent;
  agentRuntime: SocietyLiveAgentRuntime;
  sourceReceipt: {
    readonly address: string;
    readonly signature?: string;
    readonly slot: number;
  };
  committedKind: string;
}) => {
  if (event.action !== "death") return undefined;
  if (committedKind !== "dispute") {
    throw new Error(
      `Death event ${event.id} must commit a dispute receipt before slashing`,
    );
  }

  const reason = readSocietyDeathDisputeReason(event);
  const agentDisputeTask = createTask({
    identityId: agentRuntime.account.identity.id,
    title: `${SOCIETY_EXAMPLE_DEATH_DISPUTE_TASK_TITLE}: ${event.id}`,
    domain: SOCIETY_DOMAIN,
    description: SOCIETY_EXAMPLE_DEATH_DISPUTE_TASK_DESCRIPTION,
    subtasks: [`death:${event.id}`, `reason:${reason}`],
  });
  const taskCommit = await chainSession.client.ensureTask({
    authority: agentRuntime.signer,
    identity: agentRuntime.account.identity.address,
    task: agentDisputeTask,
  });
  chainSession.operations.push({
    ...taskCommit,
    agentId: event.agentId,
    sourceEventId: event.id,
  });
  const disputeTaskRecord = await chainSession.client.fetchMaybeTask({
    task: taskCommit.address,
  });
  const disputeTaskChain = receiptChainFromTask(disputeTaskRecord);

  const payload = {
    domain: SOCIETY_DOMAIN,
    action: "society_example_death_dispute",
    sourceAction: event.action,
    sourceEventId: event.id,
    sourceReceipt: sourceReceipt.address,
    sourceReceiptSignature: sourceReceipt.signature,
    reason,
    slashAmountLamports:
      SOCIETY_EXAMPLE_DEATH_DISPUTE_SLASH_LAMPORTS.toString(),
    agentId: event.agentId,
    agentIdentity: agentRuntime.account.identity.address,
    stake: agentRuntime.account.stake.address,
    boardIdentity: chainSession.identity.address,
    boardTask: chainSession.task.address,
  };
  const disputeReceipt = createReceipt({
    actorId: agentRuntime.signer.address,
    kind: "dispute",
    taskId: agentDisputeTask.taskId,
    sequence: disputeTaskChain.sequence + 1,
    previousReceiptId: disputeTaskChain.previousReceiptId,
    payload: {
      ...payload,
      payloadHash: hashCanonical(payload),
    },
  });
  const committedDisputeReceipt = await chainSession.client.emitReceipt({
    authority: agentRuntime.signer,
    identity: agentRuntime.account.identity.address,
    task: taskCommit.address,
    domainCatalog: chainSession.domainCatalogAddress,
    receipt: disputeReceipt,
  });
  chainSession.operations.push({
    ...committedDisputeReceipt,
    agentId: event.agentId,
    sourceEventId: event.id,
  });
  const taskSync = await chainSession.client.syncTaskStatus({
    authority: agentRuntime.signer,
    identity: agentRuntime.account.identity.address,
    task: taskCommit.address,
    receipt: committedDisputeReceipt.address,
  });
  chainSession.operations.push({
    ...taskSync,
    agentId: event.agentId,
    sourceEventId: event.id,
  });
  const verdictCommit = await chainSession.client.ensureVerdict({
    adjudicator: chainSession.authority,
    disputeReceipt: committedDisputeReceipt.address,
    outcome: AGENT_LOST_OUTCOME,
    slashAmount: SOCIETY_EXAMPLE_DEATH_DISPUTE_SLASH_LAMPORTS,
    class: VERDICT_CLASS_SAFETY,
    staleAfterSlot: 0n,
  });
  chainSession.operations.push({
    ...verdictCommit,
    agentId: event.agentId,
    sourceEventId: event.id,
  });
  const reputationApply = await chainSession.client.applyReputationReceipt({
    authority: agentRuntime.signer,
    identity: agentRuntime.account.identity.address,
    receipt: committedDisputeReceipt.address,
    reputation: agentRuntime.account.reputation.address,
    evidenceAccounts: [
      { address: verdictCommit.address },
      { address: agentRuntime.account.stake.address },
    ],
  });
  chainSession.operations.push({
    ...reputationApply,
    agentId: event.agentId,
    sourceEventId: event.id,
  });
  const slashCommit = await chainSession.client.slashWithVerdict({
    adjudicator: chainSession.authority,
    identity: agentRuntime.account.identity.address,
    stake: agentRuntime.account.stake.address,
    disputeReceipt: committedDisputeReceipt.address,
    verdict: verdictCommit.address,
    treasuryVault: chainSession.adjudicator.treasuryVault,
  });
  chainSession.operations.push({
    ...slashCommit,
    agentId: event.agentId,
    sourceEventId: event.id,
  });

  const exampleDeathDispute = {
    batchId: `society_death_dispute_${event.id}`,
    receiptId: disputeReceipt.receiptId,
    sourceReceiptCount: 1,
    address: committedDisputeReceipt.address,
    actor: agentRuntime.signer.address,
    signature: committedDisputeReceipt.signature,
    slot: committedDisputeReceipt.slot,
    task: {
      address: taskCommit.address,
      signature: taskCommit.signature,
    },
    verdict: {
      address: verdictCommit.address,
      signature: verdictCommit.signature,
    },
    reputation: {
      address: agentRuntime.account.reputation.address,
      signature: reputationApply.signature,
    },
    slash: {
      address: slashCommit.address,
      signature: slashCommit.signature,
      stake: agentRuntime.account.stake.address,
      amount: SOCIETY_EXAMPLE_DEATH_DISPUTE_SLASH_LAMPORTS.toString(),
      disputeReceipt: committedDisputeReceipt.address,
    },
    source: {
      eventId: event.id,
      receiptAddress: sourceReceipt.address,
      reason,
    },
  };
  chainSession.committedReceipts.push(exampleDeathDispute);
  return exampleDeathDispute;
};

const commitLiveActionReceipt = async ({
  chainSession,
  event,
  receipt,
  frame,
  simulation,
  committedLabel,
  sourceReceiptCount,
}: {
  chainSession: SocietyLiveChainSession;
  event: SocietyLiveEvent;
  receipt: SocietyLiveReceipt;
  frame?: SocietyLiveFrame;
  simulation: SocietyRunPayload;
  committedLabel: string;
  sourceReceiptCount: number;
}) => {
  const agentRuntime =
    chainSession.agentRuntimesById.get(event.agentId) ??
    (await ensureLiveAgentAccount(chainSession, event));
  const piAction = await maybeRequestPiAction({
    chainSession,
    event,
    receipt,
    frame,
    agentRuntime,
  });

  const actionTranscript = buildSignedLiveActionTranscript(
    chainSession,
    buildCommittedPrefixRun(simulation, event.id),
    frame ? { afterActionFrame: frame } : {},
  );
  const signedAction = actionTranscript.actions.find(
    (action) => action.eventId === event.id,
  );
  if (!signedAction) {
    throw new Error(`Missing signed action transcript entry for ${event.id}`);
  }
  const chainReceipt = buildLiveChainReceipt(
    chainSession,
    event,
    receipt,
    actionTranscript,
    agentRuntime,
    piAction,
  );
  const committedKind = receipt.kind ?? event.receiptKind ?? "completion";
  const committedReceipt = await withLiveOperationContext(
    `emit delegated receipt for ${event.id}`,
    chainSession.client.emitDelegatedReceipt({
      delegate: agentRuntime.signer,
      identity: chainSession.identity.address,
      delegation: agentRuntime.account.delegation.address,
      task: chainSession.task.address,
      domainCatalog: chainSession.domainCatalogAddress,
      receipt: chainReceipt,
    }),
  );
  chainSession.operations.push(committedReceipt);
  const checkpointAppend = await withLiveOperationContext(
    `append checkpoint for ${event.id}`,
    chainSession.client.appendReceiptToCheckpoint({
      feePayer: agentRuntime.signer,
      identity: chainSession.identity.address,
      checkpoint: chainSession.checkpoint.address,
      latestCheckpoint: chainSession.checkpoint.latestCheckpoint,
      receipt: committedReceipt.address,
    }),
  );
  chainSession.operations.push(checkpointAppend);
  const taskSync = shouldSyncLiveTaskStatus({
    action: event.action,
    kind: committedKind,
  })
    ? await withLiveOperationContext(
        `sync task status for ${event.id}`,
        chainSession.client.syncTaskStatus({
          authority: chainSession.authority,
          identity: chainSession.identity.address,
          task: chainSession.task.address,
          receipt: committedReceipt.address,
        }),
      )
    : undefined;
  if (taskSync) {
    chainSession.operations.push(taskSync);
  }
  const agentReputation = await applyAgentActionReputation({
    chainSession,
    event,
    agentRuntime,
    sourceReceipt: committedReceipt,
    committedKind,
  });
  const exampleDeathDispute = await maybeApplySocietyDeathDisputeAdapter({
    chainSession,
    event,
    agentRuntime,
    sourceReceipt: committedReceipt,
    committedKind,
  });
  const actionEnvelope = buildAgentActionEnvelopeForSignedSocietyAction({
    signedAction,
    identityAddress: chainSession.identity.address,
    taskAddress: chainSession.task.address,
    receiptAddress: committedReceipt.address,
    receiptPayloadHash: requireReceiptPayloadHash(chainReceipt),
    txSignature: requireTransactionSignature(
      committedReceipt,
      "emit delegated receipt",
    ),
    slot: committedReceipt.slot,
    transcriptRoot: actionTranscript.root,
    args: {
      committedKind,
      eventId: event.id,
      receiptId: receipt.receiptId,
      sourceReceiptCount,
    },
  });
  const actionProof = {
    transcriptRoot: actionTranscript.root,
    leafHash: signedAction.leafHash,
    signer: signedAction.signature.signer,
    signature: signedAction.signature.value,
    scheme: signedAction.signature.scheme,
    beforeStateHash: signedAction.beforeState.stateHash,
    beforeStateSignature: signedAction.beforeState.signature.value,
    beforeStateScheme: signedAction.beforeState.signature.scheme,
    afterStateHash: signedAction.afterState.stateHash,
    afterStateSignature: signedAction.afterState.signature.value,
    afterStateScheme: signedAction.afterState.signature.scheme,
    runtimeEvidence: signedAction.runtimeEvidence,
    submitter: agentRuntime.signer.address,
    delegation: agentRuntime.account.delegation.address,
    actionEnvelope,
  };
  chainSession.committedReceipts.push({
    batchId: committedLabel,
    receiptId: receipt.receiptId,
    sourceReceiptCount,
    address: committedReceipt.address,
    actor: agentRuntime.signer.address,
    delegation: agentRuntime.account.delegation.address,
    signature: committedReceipt.signature,
    slot: committedReceipt.slot,
    checkpoint: {
      address: chainSession.checkpoint.address,
      signature: checkpointAppend.signature,
    },
    actionProof,
    ...(agentReputation ? { agentReputation } : {}),
  });
  advanceBoardReceiptChain(chainSession, committedReceipt.address);
  return {
    ...committedReceipt,
    actionProof,
    ...(agentReputation ? { agentReputation } : {}),
    ...(exampleDeathDispute ? { exampleDeathDispute } : {}),
  };
};

const finalizeSocietyLiveChainSession = async (
  chainSession: SocietyLiveChainSession,
  run: SocietyRunPayload,
) => {
  const actionTranscript = buildSignedLiveActionTranscript(chainSession, run);
  const { artifact: preparedArtifact, reference: preparedProof } =
    await writeCommitProofArtifact({
      proofDirectory: PROOF_DIRECTORY,
      routePrefix: PROOF_ROUTE_PREFIX,
      run,
      commitId: chainSession.commitId,
      status: "prepared",
      createdAt: chainSession.createdAt,
      actionTranscript,
      chain: buildLiveChainEvidence(chainSession, run),
    });

  const disputeReceipt = buildDisputeAuditReceipt(
    run,
    chainSession.commitId,
    chainSession.receiptSequence,
    chainSession.previousReceiptId,
    chainSession.identity.id,
    chainSession.task.id,
    preparedProof,
    chainSession.committedReceipts.length,
  );
  const committedDisputeReceipt = await withLiveOperationContext(
    "emit final audit receipt",
    chainSession.client.emitReceipt({
      authority: chainSession.authority,
      identity: chainSession.identity.address,
      task: chainSession.task.address,
      domainCatalog: chainSession.domainCatalogAddress,
      receipt: disputeReceipt,
    }),
  );
  chainSession.operations.push(committedDisputeReceipt);
  const disputeCheckpointAppend = await withLiveOperationContext(
    "append final audit checkpoint",
    chainSession.client.appendReceiptToCheckpoint({
      feePayer: chainSession.authority,
      identity: chainSession.identity.address,
      checkpoint: chainSession.checkpoint.address,
      latestCheckpoint: chainSession.checkpoint.latestCheckpoint,
      receipt: committedDisputeReceipt.address,
    }),
  );
  chainSession.operations.push(disputeCheckpointAppend);
  chainSession.operations.push(
    await withLiveOperationContext(
      "sync final audit task status",
      chainSession.client.syncTaskStatus({
        authority: chainSession.authority,
        identity: chainSession.identity.address,
        task: chainSession.task.address,
        receipt: committedDisputeReceipt.address,
      }),
    ),
  );
  const verdictCommit = await withLiveOperationContext(
    "record final audit verdict",
    chainSession.client.ensureVerdict({
      adjudicator: chainSession.authority,
      disputeReceipt: committedDisputeReceipt.address,
      outcome: NO_FAULT_OUTCOME,
      slashAmount: 0n,
      class: VERDICT_CLASS_SAFETY,
      staleAfterSlot: 0n,
    }),
  );
  chainSession.operations.push(verdictCommit);
  chainSession.dispute = {
    receipt: committedDisputeReceipt.address,
    verdict: verdictCommit.address,
    verdictSignature: verdictCommit.signature,
  };
  chainSession.committedReceipts.push({
    batchId: "dispute_audit",
    receiptId: disputeReceipt.receiptId,
    sourceReceiptCount: 0,
    address: committedDisputeReceipt.address,
    signature: committedDisputeReceipt.signature,
    slot: committedDisputeReceipt.slot,
    checkpoint: {
      address: chainSession.checkpoint.address,
      signature: disputeCheckpointAppend.signature,
    },
    verdict: {
      address: verdictCommit.address,
      signature: verdictCommit.signature,
    },
  });
  advanceBoardReceiptChain(chainSession, committedDisputeReceipt.address);

  const { reference: committedProof } = await writeCommitProofArtifact({
    proofDirectory: PROOF_DIRECTORY,
    routePrefix: PROOF_ROUTE_PREFIX,
    run,
    commitId: chainSession.commitId,
    status: "committed",
    createdAt: chainSession.createdAt,
    preparedProofHash: preparedArtifact.proofHash,
    actionTranscript,
    chain: buildLiveChainEvidence(chainSession, run),
  });

  return {
    proof: committedProof,
    audit: {
      address: committedDisputeReceipt.address,
      signature: committedDisputeReceipt.signature,
      slot: committedDisputeReceipt.slot,
    },
  };
};

const societyLiveManager = createSocietyLiveManager({
  createChainSession: async ({ sessionId, simulation }) =>
    initializeSocietyLiveChainSession(sessionId, simulation),
  syncChainSessionState: async ({ chainSession, simulation, completed }) =>
    syncSocietyWorldState({
      chainSession,
      simulation: simulation as SocietyLiveSimulationSession,
      completed,
    }),
  commitGenesisAction: async ({ chainSession, event, receipt, simulation }) =>
    commitLiveActionReceipt({
      chainSession,
      event,
      receipt,
      simulation,
      committedLabel: event.id,
      sourceReceiptCount: 1,
    }),
  commitLiveAction: async ({
    chainSession,
    event,
    receipt,
    frame,
    simulation,
  }) =>
    commitLiveActionReceipt({
      chainSession,
      event,
      receipt,
      frame,
      simulation,
      committedLabel: event.id,
      sourceReceiptCount: 1,
    }),
  finalizeChainSession: async ({ chainSession, simulation }) =>
    finalizeSocietyLiveChainSession(chainSession, simulation),
  stepDelayMs: 150,
});

const liveSessionPathMatch = (
  pathname: string,
  suffix = "",
): string | undefined => {
  if (!pathname.startsWith("/api/society/live/")) return undefined;
  const remainder = pathname.slice("/api/society/live/".length);
  if (!remainder) return undefined;
  if (!suffix) {
    return remainder.includes("/") ? undefined : decodeURIComponent(remainder);
  }
  if (!remainder.endsWith(suffix)) return undefined;
  const sessionId = remainder.slice(0, -suffix.length);
  return sessionId.includes("/") ? undefined : decodeURIComponent(sessionId);
};

const writeSseMessage = (response: ServerResponse, payload: unknown) => {
  response.write(`data: ${JSON.stringify(payload, jsonReplacer)}\n\n`);
};

const buildLiveSessionAccountSnapshot = (
  session: ReturnType<typeof societyLiveManager.getSession>,
): SocietyLiveSessionAccountSnapshot => {
  const run = finalizeLiveSocietySession(
    session.simulation as SocietyLiveSimulationSession,
  );
  const chainEvidence = buildLiveChainEvidence(session.chainSession, run);
  if (!chainEvidence.protocolEvidence) {
    throw new Error("Live protocol evidence graph was not built");
  }

  return {
    sessionId: session.id,
    rpcUrl: displayRpcUrl(session.chainSession.rpcUrl),
    studioUrl: displayStudioUrl(session.chainSession.studioUrl),
    identity: session.chainSession.identity,
    task: session.chainSession.task,
    reputation: session.chainSession.reputation,
    checkpoint: session.chainSession.checkpoint,
    adjudicator: session.chainSession.adjudicator,
    world: {
      address: session.chainSession.world.address,
      status: session.chainSession.worldStatus,
    },
    setup: buildLiveSetupStatus(session.chainSession),
    agentAccounts: session.chainSession.agentAccounts,
    programPlan: session.chainSession.programPlan,
    protocolEvidence: chainEvidence.protocolEvidence,
  };
};

const serveStatic = async (
  request: IncomingMessage,
  response: ServerResponse,
) => {
  const requestUrl = new URL(request.url ?? "/", "http://localhost");
  if (LEGACY_SOCIETY_PAGE_PATHS.has(requestUrl.pathname)) {
    response.writeHead(302, { location: "/society" });
    response.end();
    return;
  }
  const pathname =
    requestUrl.pathname === "/" || requestUrl.pathname === "/society"
      ? SOCIETY_APP_PATH
      : decodeURIComponent(requestUrl.pathname);
  const normalizedPath = pathname.replace(/^\/examples\/multi_agent\//, "/");
  const filePath = resolve(join(EXAMPLE_ROOT, normalizedPath));

  if (!isInside(EXAMPLE_ROOT, filePath)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  try {
    const body = await readFile(filePath);
    const contentType =
      CONTENT_TYPES[extname(filePath)] ?? "application/octet-stream";
    response.writeHead(200, { "content-type": contentType });
    response.end(body);
  } catch {
    response.writeHead(404);
    response.end("Not found");
  }
};

const handleRequest = async (
  request: IncomingMessage,
  response: ServerResponse,
) => {
  try {
    const requestUrl = new URL(request.url ?? "/", "http://localhost");
    if (
      isLiveMutationRequest(request, requestUrl) &&
      !canAcceptLiveMutationRequest(request)
    ) {
      writeJson(response, 403, {
        error:
          "Public live mutation is disabled. Use the local loopback URL or set SUBSTRATE_ALLOW_PUBLIC_LIVE_MUTATION=1 for an intentional public demo.",
      });
      return;
    }

    if (request.method === "GET" && requestUrl.pathname === "/api/health") {
      writeJson(response, 200, {
        ok: true,
        root: REPO_ROOT,
        page: SOCIETY_APP_PATH,
      });
      return;
    }

    if (
      request.method === "GET" &&
      requestUrl.pathname === "/api/society/public-links"
    ) {
      writeJson(
        response,
        200,
        buildPublicLinkConfig(buildRequestSocietyUrl(request)),
      );
      return;
    }

    if (
      request.method === "POST" &&
      requestUrl.pathname === "/api/society/live/start"
    ) {
      try {
        writeJson(
          response,
          200,
          await societyLiveManager.startSession(await parseJsonBody(request)),
        );
      } catch (error) {
        writeJson(response, 500, { error: describeError(error) });
      }
      return;
    }

    if (
      request.method === "GET" &&
      requestUrl.pathname === "/api/society/live/latest"
    ) {
      const snapshot = societyLiveManager.getLatestSessionSnapshot();
      if (!snapshot) {
        writeJson(response, 404, {
          error: "Live session snapshot does not exist",
        });
        return;
      }
      writeJson(response, 200, snapshot);
      return;
    }

    const liveSnapshotSessionId = liveSessionPathMatch(requestUrl.pathname);
    if (request.method === "GET" && liveSnapshotSessionId) {
      try {
        writeJson(
          response,
          200,
          societyLiveManager.getSessionSnapshot(liveSnapshotSessionId),
        );
      } catch (error) {
        writeJson(response, 404, { error: describeError(error) });
      }
      return;
    }

    const liveEventStreamSessionId = liveSessionPathMatch(
      requestUrl.pathname,
      "/events",
    );
    if (request.method === "GET" && liveEventStreamSessionId) {
      try {
        societyLiveManager.getSession(liveEventStreamSessionId);
        response.writeHead(200, {
          "content-type": "text/event-stream; charset=utf-8",
          "cache-control": "no-cache, no-transform",
          connection: "keep-alive",
        });
        const unsubscribe = societyLiveManager.subscribe(
          liveEventStreamSessionId,
          (message) => {
            writeSseMessage(response, message);
          },
        );
        request.on("close", unsubscribe);
      } catch (error) {
        if (response.headersSent) {
          response.end();
        } else {
          writeJson(response, 404, { error: describeError(error) });
        }
      }
      return;
    }

    const liveAccountSessionId = liveSessionPathMatch(
      requestUrl.pathname,
      "/accounts",
    );
    if (request.method === "GET" && liveAccountSessionId) {
      try {
        writeJson(
          response,
          200,
          buildLiveSessionAccountSnapshot(
            societyLiveManager.getSession(liveAccountSessionId),
          ),
        );
      } catch (error) {
        writeJson(response, 404, { error: describeError(error) });
      }
      return;
    }

    const livePlaySessionId = liveSessionPathMatch(
      requestUrl.pathname,
      "/play",
    );
    if (request.method === "POST" && livePlaySessionId) {
      try {
        writeJson(
          response,
          200,
          await societyLiveManager.playSession(livePlaySessionId),
        );
      } catch (error) {
        writeJson(response, 404, { error: describeError(error) });
      }
      return;
    }

    const livePauseSessionId = liveSessionPathMatch(
      requestUrl.pathname,
      "/pause",
    );
    if (request.method === "POST" && livePauseSessionId) {
      try {
        writeJson(
          response,
          200,
          societyLiveManager.pauseSession(livePauseSessionId),
        );
      } catch (error) {
        writeJson(response, 404, { error: describeError(error) });
      }
      return;
    }

    const liveStepSessionId = liveSessionPathMatch(
      requestUrl.pathname,
      "/step",
    );
    if (request.method === "POST" && liveStepSessionId) {
      try {
        const progressed =
          await societyLiveManager.stepSession(liveStepSessionId);
        writeJson(response, 200, {
          progressed,
          snapshot: societyLiveManager.getSessionSnapshot(liveStepSessionId),
        });
      } catch (error) {
        writeJson(response, 500, { error: describeError(error) });
      }
      return;
    }

    if (
      request.method === "GET" &&
      requestUrl.pathname.startsWith("/api/society/account/")
    ) {
      const address = decodeURIComponent(
        requestUrl.pathname.replace("/api/society/account/", ""),
      );
      writeJson(response, 200, await readSurfpoolAccount(address));
      return;
    }

    if (
      request.method === "GET" &&
      requestUrl.pathname.startsWith("/api/society/transaction/")
    ) {
      const signature = decodeURIComponent(
        requestUrl.pathname.replace("/api/society/transaction/", ""),
      );
      writeJson(response, 200, await readSurfpoolTransaction(signature));
      return;
    }

    if (
      request.method === "POST" &&
      requestUrl.pathname === "/api/society/commit"
    ) {
      writeJson(response, 410, {
        error: REMOVED_OFFLINE_COMMIT_MESSAGE,
      });
      return;
    }

    if (request.method !== "GET") {
      writeJson(response, 405, { error: "Method not allowed" });
      return;
    }

    await serveStatic(request, response);
  } catch (error) {
    if (response.headersSent) {
      response.end();
      return;
    }
    writeJson(response, 500, { error: (error as Error).message });
  }
};

const listen = (
  server: ReturnType<typeof createServer>,
  port: number,
  attempt = 0,
) => {
  server.once("error", (error: NodeJS.ErrnoException) => {
    if (error.code === "EADDRINUSE" && attempt < MAX_PORT_ATTEMPTS) {
      listen(server, port + 1, attempt + 1);
      return;
    }
    throw error;
  });

  server.listen(port, "127.0.0.1", () => {
    const address = server.address();
    const actualPort =
      typeof address === "object" && address ? address.port : port;
    const localSocietyUrl = `http://127.0.0.1:${actualPort}/society`;
    console.log(
      JSON.stringify({
        url: `http://127.0.0.1:${actualPort}/examples/multi_agent/dashboard/society-app/index.html`,
        shortUrl: `http://127.0.0.1:${actualPort}/`,
        societyUrl: localSocietyUrl,
        health: `http://127.0.0.1:${actualPort}/api/health`,
        publicLinks: buildPublicLinkConfig(localSocietyUrl),
      }),
    );
  });
};

listen(createServer(handleRequest), readConfiguredPort());
