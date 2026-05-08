import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";

export const A2A_PROTOCOL_VERSION = "0.3.0";
export const A2A_AGENT_CARD_PATH = "/.well-known/agent-card.json";
export const A2A_RPC_PATH = "/a2a";

export type TrustSubstrateCapability =
  | "identity"
  | "tasks"
  | "receipts"
  | "reputation"
  | "stake"
  | "checkpoints"
  | "disputes"
  | "mcp.read"
  | "mcp.write";

export interface TrustSubstrateAgentSkill {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly tags?: readonly string[];
  readonly examples?: readonly string[];
}

export interface TrustSubstrateA2aConfig {
  readonly baseUrl: string;
  readonly name: string;
  readonly description: string;
  readonly identityAddress?: string;
  readonly agentId?: string;
  readonly domain?: string;
  readonly providerName?: string;
  readonly providerUrl?: string;
  readonly documentationUrl?: string;
  readonly mcpEndpoint?: string;
  readonly mcpWritesEnabled?: boolean;
  readonly societyUrl?: string;
  readonly piConsoleUrl?: string;
  readonly skills?: readonly TrustSubstrateAgentSkill[];
}

export interface A2aSupportedInterface {
  readonly transport: "JSONRPC";
  readonly url: string;
}

export interface A2aAgentCard {
  readonly protocolVersion: string;
  readonly name: string;
  readonly description: string;
  readonly url: string;
  readonly preferredTransport: "JSONRPC";
  readonly supportedInterfaces: readonly A2aSupportedInterface[];
  readonly defaultInputModes: readonly string[];
  readonly defaultOutputModes: readonly string[];
  readonly capabilities: {
    readonly streaming: boolean;
    readonly pushNotifications: boolean;
    readonly stateTransitionHistory: boolean;
    readonly extensions: readonly string[];
  };
  readonly skills: readonly TrustSubstrateAgentSkill[];
  readonly provider?: {
    readonly organization: string;
    readonly url?: string;
  };
  readonly documentationUrl?: string;
  readonly metadata: {
    readonly trustSubstrate: {
      readonly identityAddress?: string;
      readonly agentId?: string;
      readonly domain?: string;
      readonly capabilities: readonly TrustSubstrateCapability[];
      readonly mcpEndpoint?: string;
      readonly societyUrl?: string;
      readonly piConsoleUrl?: string;
    };
  };
}

export interface A2aTaskArtifact {
  readonly artifactId: string;
  readonly name: string;
  readonly parts: ReadonlyArray<{
    readonly kind: "text";
    readonly text: string;
  }>;
  readonly metadata: {
    readonly trustSubstrate: {
      readonly taskAddress?: string;
      readonly receiptAddress?: string;
      readonly receiptHash?: string;
      readonly txSignature?: string;
      readonly checkpointRoot?: string;
    };
  };
}

export interface TrustSubstrateA2aTaskInput {
  readonly taskId: string;
  readonly contextId?: string;
  readonly status?: "submitted" | "working" | "completed" | "failed";
  readonly taskAddress?: string;
  readonly receiptAddress?: string;
  readonly receiptHash?: string;
  readonly txSignature?: string;
  readonly checkpointRoot?: string;
  readonly summary?: string;
}

export interface A2aTask {
  readonly id: string;
  readonly contextId?: string;
  readonly status: {
    readonly state:
      | "TASK_STATE_SUBMITTED"
      | "TASK_STATE_WORKING"
      | "TASK_STATE_COMPLETED"
      | "TASK_STATE_FAILED";
  };
  readonly artifacts: readonly A2aTaskArtifact[];
  readonly metadata: {
    readonly trustSubstrate: {
      readonly taskAddress?: string;
      readonly receiptAddress?: string;
      readonly receiptHash?: string;
      readonly txSignature?: string;
      readonly checkpointRoot?: string;
    };
  };
}

export interface JsonHttpResponse {
  readonly status: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: unknown;
}

const DEFAULT_SKILLS: readonly TrustSubstrateAgentSkill[] = [
  {
    id: "trust-substrate.identity",
    name: "Trust Substrate identity",
    description: "Expose Solana-backed agent identity and delegation evidence.",
    tags: ["solana", "identity", "trust-substrate"],
  },
  {
    id: "trust-substrate.receipts",
    name: "Trust Substrate receipts",
    description:
      "Publish and inspect signed task receipts, checkpoints, and replay roots.",
    tags: ["receipts", "proofs", "merkle"],
  },
  {
    id: "trust-substrate.reputation",
    name: "Trust Substrate reputation",
    description:
      "Read program-backed weighted reputation, stake, disputes, and validation evidence.",
    tags: ["reputation", "stake", "disputes"],
  },
];

export function buildTrustSubstrateAgentCard(
  config: TrustSubstrateA2aConfig,
): A2aAgentCard {
  const baseUrl = trimTrailingSlash(config.baseUrl);
  const capabilities = buildCapabilities(config.mcpWritesEnabled);
  return {
    protocolVersion: A2A_PROTOCOL_VERSION,
    name: config.name,
    description: config.description,
    url: `${baseUrl}${A2A_RPC_PATH}`,
    preferredTransport: "JSONRPC",
    supportedInterfaces: [
      {
        transport: "JSONRPC",
        url: `${baseUrl}${A2A_RPC_PATH}`,
      },
    ],
    defaultInputModes: ["application/json", "text/plain"],
    defaultOutputModes: ["application/json", "text/plain"],
    capabilities: {
      streaming: false,
      pushNotifications: false,
      stateTransitionHistory: true,
      extensions: [
        "https://trustsubstrate.dev/a2a/extensions/proof-carrying-task/v1",
      ],
    },
    skills: config.skills ?? DEFAULT_SKILLS,
    provider: config.providerName
      ? {
          organization: config.providerName,
          url: config.providerUrl,
        }
      : undefined,
    documentationUrl: config.documentationUrl,
    metadata: {
      trustSubstrate: {
        identityAddress: config.identityAddress,
        agentId: config.agentId,
        domain: config.domain,
        capabilities,
        mcpEndpoint: config.mcpEndpoint,
        societyUrl: config.societyUrl,
        piConsoleUrl: config.piConsoleUrl,
      },
    },
  };
}

export function buildTrustSubstrateA2aTask(
  input: TrustSubstrateA2aTaskInput,
): A2aTask {
  const trustSubstrate = {
    taskAddress: input.taskAddress,
    receiptAddress: input.receiptAddress,
    receiptHash: input.receiptHash,
    txSignature: input.txSignature,
    checkpointRoot: input.checkpointRoot,
  };
  return {
    id: input.taskId,
    contextId: input.contextId,
    status: { state: toA2aTaskState(input.status ?? "submitted") },
    artifacts: [
      {
        artifactId: `${input.taskId}:trust-substrate-proof`,
        name: "Trust Substrate proof evidence",
        parts: [
          {
            kind: "text",
            text:
              input.summary ??
              "Trust Substrate task evidence is attached as chain-bound metadata.",
          },
        ],
        metadata: { trustSubstrate },
      },
    ],
    metadata: { trustSubstrate },
  };
}

export function handleTrustSubstrateA2aRequest(
  config: TrustSubstrateA2aConfig,
  request: { readonly method: string; readonly url: string },
): JsonHttpResponse {
  const url = new URL(request.url, config.baseUrl);
  if (request.method === "GET" && url.pathname === A2A_AGENT_CARD_PATH) {
    return jsonResponse(200, buildTrustSubstrateAgentCard(config));
  }
  if (request.method === "POST" && url.pathname === A2A_RPC_PATH) {
    return jsonResponse(202, {
      jsonrpc: "2.0",
      result: {
        accepted: true,
        message:
          "Trust Substrate A2A adapter accepted the request envelope; task execution must be submitted through protocol tools.",
      },
    });
  }
  return jsonResponse(404, { error: "not_found" });
}

export function createTrustSubstrateA2aServer(config: TrustSubstrateA2aConfig) {
  return createServer((request: IncomingMessage, response: ServerResponse) => {
    const result = handleTrustSubstrateA2aRequest(config, {
      method: request.method ?? "GET",
      url: request.url ?? "/",
    });
    response.writeHead(result.status, result.headers);
    response.end(JSON.stringify(result.body));
  });
}

function buildCapabilities(
  mcpWritesEnabled: boolean | undefined,
): readonly TrustSubstrateCapability[] {
  const capabilities: TrustSubstrateCapability[] = [
    "identity",
    "tasks",
    "receipts",
    "reputation",
    "stake",
    "checkpoints",
    "disputes",
    "mcp.read",
  ];
  if (mcpWritesEnabled) capabilities.push("mcp.write");
  return capabilities;
}

function toA2aTaskState(
  status: NonNullable<TrustSubstrateA2aTaskInput["status"]>,
): A2aTask["status"]["state"] {
  switch (status) {
    case "working":
      return "TASK_STATE_WORKING";
    case "completed":
      return "TASK_STATE_COMPLETED";
    case "failed":
      return "TASK_STATE_FAILED";
    case "submitted":
      return "TASK_STATE_SUBMITTED";
  }
}

function jsonResponse(status: number, body: unknown): JsonHttpResponse {
  return {
    status,
    headers: {
      "content-type": "application/a2a+json; charset=utf-8",
      "cache-control": "no-store",
    },
    body,
  };
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}
