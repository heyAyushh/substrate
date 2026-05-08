import test from "node:test";
import { ok, strictEqual } from "node:assert/strict";
import {
  buildTrustSubstrateAcpDescriptor,
  buildTrustSubstrateAcpSearchResult,
  buildTrustSubstrateAcpThread,
  handleTrustSubstrateAcpRequest,
} from "../../packages/acp-adapter/src/index.js";

test("builds an ACP descriptor with Trust Substrate metadata", () => {
  const descriptor = buildTrustSubstrateAcpDescriptor({
    baseUrl: "https://agent.example/",
    agentId: "agent-alpha",
    name: "Trust Agent",
    description: "Agent with Solana-backed receipts.",
    identityAddress: "identity111",
    mcpEndpoint: "stdio://trust-substrate-mcp",
    mcpWritesEnabled: true,
  });

  strictEqual(descriptor.protocol.version, "0.2.3");
  strictEqual(
    descriptor.endpoints.descriptor,
    "https://agent.example/agents/agent-alpha/descriptor",
  );
  strictEqual(
    descriptor.metadata.trust_substrate.identity_address,
    "identity111",
  );
  ok(descriptor.capabilities.includes("mcp.write"));
});

test("keeps MCP write capability opt-in", () => {
  const descriptor = buildTrustSubstrateAcpDescriptor({
    baseUrl: "https://agent.example",
    agentId: "agent-alpha",
    name: "Trust Agent",
    description: "Agent with Solana-backed receipts.",
  });

  ok(descriptor.capabilities.includes("mcp.read"));
  ok(!descriptor.capabilities.includes("mcp.write"));
});

test("builds ACP search and thread responses", () => {
  const search = buildTrustSubstrateAcpSearchResult({
    baseUrl: "https://agent.example",
    agentId: "agent-alpha",
    name: "Trust Agent",
    description: "Agent with Solana-backed receipts.",
  });
  const thread = buildTrustSubstrateAcpThread({
    threadId: "thread-1",
    agentId: "agent-alpha",
    taskAddress: "task111",
  });

  strictEqual(search.total, 1);
  strictEqual(search.agents[0]?.id, "agent-alpha");
  strictEqual(thread.metadata.trust_substrate.task_address, "task111");
});

test("serves descriptor through the ACP routes", () => {
  const response = handleTrustSubstrateAcpRequest(
    {
      baseUrl: "https://agent.example",
      agentId: "agent-alpha",
      name: "Trust Agent",
      description: "Agent with Solana-backed receipts.",
    },
    { method: "GET", url: "/agents/agent-alpha/descriptor" },
  );

  strictEqual(response.status, 200);
  strictEqual((response.body as { id: string }).id, "agent-alpha");
});
