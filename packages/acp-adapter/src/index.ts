import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";

export const ACP_SPEC_VERSION = "0.2.3";

export type AcpTrustSubstrateCapability =
  | "identity"
  | "task"
  | "receipt"
  | "reputation"
  | "stake"
  | "checkpoint"
  | "dispute"
  | "mcp.read"
  | "mcp.write";

export interface TrustSubstrateAcpConfig {
  readonly baseUrl: string;
  readonly agentId: string;
  readonly name: string;
  readonly description: string;
  readonly identityAddress?: string;
  readonly domain?: string;
  readonly mcpEndpoint?: string;
  readonly mcpWritesEnabled?: boolean;
  readonly a2aAgentCardUrl?: string;
  readonly societyUrl?: string;
  readonly piConsoleUrl?: string;
}

export interface AcpAgentDescriptor {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly protocol: {
    readonly name: "ACP";
    readonly version: string;
  };
  readonly endpoints: {
    readonly descriptor: string;
    readonly runs: string;
    readonly mcp?: string;
    readonly a2a?: string;
    readonly society?: string;
    readonly piConsole?: string;
  };
  readonly input_modes: readonly string[];
  readonly output_modes: readonly string[];
  readonly capabilities: readonly AcpTrustSubstrateCapability[];
  readonly metadata: {
    readonly trust_substrate: {
      readonly identity_address?: string;
      readonly domain?: string;
      readonly mcp_writes_enabled: boolean;
    };
  };
}

export interface AcpAgentSearchResult {
  readonly agents: readonly AcpAgentDescriptor[];
  readonly total: number;
}

export interface AcpThread {
  readonly id: string;
  readonly agent_id: string;
  readonly status: "created";
  readonly metadata: {
    readonly trust_substrate: {
      readonly task_address?: string;
      readonly receipt_address?: string;
    };
  };
}

export interface JsonHttpResponse {
  readonly status: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: unknown;
}

export function buildTrustSubstrateAcpDescriptor(
  config: TrustSubstrateAcpConfig,
): AcpAgentDescriptor {
  const baseUrl = trimTrailingSlash(config.baseUrl);
  return {
    id: config.agentId,
    name: config.name,
    description: config.description,
    protocol: {
      name: "ACP",
      version: ACP_SPEC_VERSION,
    },
    endpoints: {
      descriptor: `${baseUrl}/agents/${encodeURIComponent(config.agentId)}/descriptor`,
      runs: `${baseUrl}/agents/${encodeURIComponent(config.agentId)}/runs`,
      mcp: config.mcpEndpoint,
      a2a: config.a2aAgentCardUrl,
      society: config.societyUrl,
      piConsole: config.piConsoleUrl,
    },
    input_modes: ["application/json", "text/plain"],
    output_modes: ["application/json", "text/plain"],
    capabilities: buildCapabilities(config.mcpWritesEnabled),
    metadata: {
      trust_substrate: {
        identity_address: config.identityAddress,
        domain: config.domain,
        mcp_writes_enabled: config.mcpWritesEnabled === true,
      },
    },
  };
}

export function buildTrustSubstrateAcpSearchResult(
  config: TrustSubstrateAcpConfig,
): AcpAgentSearchResult {
  return {
    agents: [buildTrustSubstrateAcpDescriptor(config)],
    total: 1,
  };
}

export function buildTrustSubstrateAcpThread(input: {
  readonly threadId: string;
  readonly agentId: string;
  readonly taskAddress?: string;
  readonly receiptAddress?: string;
}): AcpThread {
  return {
    id: input.threadId,
    agent_id: input.agentId,
    status: "created",
    metadata: {
      trust_substrate: {
        task_address: input.taskAddress,
        receipt_address: input.receiptAddress,
      },
    },
  };
}

export function handleTrustSubstrateAcpRequest(
  config: TrustSubstrateAcpConfig,
  request: { readonly method: string; readonly url: string },
): JsonHttpResponse {
  const url = new URL(request.url, config.baseUrl);
  const descriptorPath = `/agents/${encodeURIComponent(config.agentId)}/descriptor`;
  const agentPath = `/agents/${encodeURIComponent(config.agentId)}`;
  if (request.method === "GET" && url.pathname === descriptorPath) {
    return jsonResponse(200, buildTrustSubstrateAcpDescriptor(config));
  }
  if (request.method === "GET" && url.pathname === agentPath) {
    return jsonResponse(200, buildTrustSubstrateAcpDescriptor(config));
  }
  if (request.method === "POST" && url.pathname === "/agents/search") {
    return jsonResponse(200, buildTrustSubstrateAcpSearchResult(config));
  }
  if (request.method === "POST" && url.pathname === "/threads") {
    return jsonResponse(
      202,
      buildTrustSubstrateAcpThread({
        threadId: "trust-substrate-thread",
        agentId: config.agentId,
      }),
    );
  }
  return jsonResponse(404, { error: "not_found" });
}

export function createTrustSubstrateAcpServer(config: TrustSubstrateAcpConfig) {
  return createServer((request: IncomingMessage, response: ServerResponse) => {
    const result = handleTrustSubstrateAcpRequest(config, {
      method: request.method ?? "GET",
      url: request.url ?? "/",
    });
    response.writeHead(result.status, result.headers);
    response.end(JSON.stringify(result.body));
  });
}

function buildCapabilities(
  mcpWritesEnabled: boolean | undefined,
): readonly AcpTrustSubstrateCapability[] {
  const capabilities: AcpTrustSubstrateCapability[] = [
    "identity",
    "task",
    "receipt",
    "reputation",
    "stake",
    "checkpoint",
    "dispute",
    "mcp.read",
  ];
  if (mcpWritesEnabled) capabilities.push("mcp.write");
  return capabilities;
}

function jsonResponse(status: number, body: unknown): JsonHttpResponse {
  return {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
    body,
  };
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}
