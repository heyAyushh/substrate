import test from "node:test";
import { deepStrictEqual, ok, strictEqual } from "node:assert/strict";
import {
  A2A_AGENT_CARD_PATH,
  buildTrustSubstrateA2aTask,
  buildTrustSubstrateAgentCard,
  handleTrustSubstrateA2aRequest,
} from "../../packages/a2a-adapter/src/index.js";

test("builds an A2A Agent Card with Trust Substrate proof capabilities", () => {
  const card = buildTrustSubstrateAgentCard({
    baseUrl: "https://agent.example/",
    name: "Trust Agent",
    description: "Agent with Solana-backed receipts.",
    identityAddress: "identity111",
    agentId: "agent-alpha",
    domain: "society",
    mcpEndpoint: "stdio://trust-substrate-mcp",
    mcpWritesEnabled: true,
  });

  strictEqual(card.protocolVersion, "0.3.0");
  strictEqual(card.url, "https://agent.example/a2a");
  strictEqual(card.supportedInterfaces[0]?.transport, "JSONRPC");
  ok(card.metadata.trustSubstrate.capabilities.includes("mcp.read"));
  ok(card.metadata.trustSubstrate.capabilities.includes("mcp.write"));
  strictEqual(card.metadata.trustSubstrate.identityAddress, "identity111");
});

test("does not advertise MCP writes unless enabled", () => {
  const card = buildTrustSubstrateAgentCard({
    baseUrl: "https://agent.example",
    name: "Read Agent",
    description: "Read-only Trust Substrate agent.",
  });

  ok(card.metadata.trustSubstrate.capabilities.includes("mcp.read"));
  ok(!card.metadata.trustSubstrate.capabilities.includes("mcp.write"));
});

test("maps chain evidence into an A2A task artifact", () => {
  const task = buildTrustSubstrateA2aTask({
    taskId: "task-1",
    status: "completed",
    receiptAddress: "receipt111",
    txSignature: "tx111",
    checkpointRoot: "root111",
  });

  strictEqual(task.status.state, "TASK_STATE_COMPLETED");
  strictEqual(
    task.artifacts[0]?.metadata.trustSubstrate.receiptAddress,
    "receipt111",
  );
  strictEqual(task.metadata.trustSubstrate.txSignature, "tx111");
});

test("serves the A2A Agent Card at the well-known path", () => {
  const response = handleTrustSubstrateA2aRequest(
    {
      baseUrl: "https://agent.example",
      name: "Trust Agent",
      description: "Agent with Solana-backed receipts.",
    },
    { method: "GET", url: A2A_AGENT_CARD_PATH },
  );

  strictEqual(response.status, 200);
  deepStrictEqual(response.headers["cache-control"], "no-store");
  strictEqual((response.body as { name: string }).name, "Trust Agent");
});
