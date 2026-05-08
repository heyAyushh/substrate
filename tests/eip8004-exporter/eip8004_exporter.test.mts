import test from "node:test";
import { ok, strictEqual } from "node:assert/strict";
import {
  EIP8004_REGISTRATION_TYPE,
  buildEip8004FeedbackFile,
  buildEip8004RegistrationFile,
  buildEip8004ValidationFile,
} from "../../packages/eip8004-exporter/src/index.js";

test("builds an ERC-8004 registration file with Trust Substrate services", () => {
  const file = buildEip8004RegistrationFile({
    name: "Trust Agent",
    description: "Agent with Solana-backed receipts.",
    agentRegistry: "eip155:1:0xregistry",
    agentId: 22,
    identityAddress: "identity111",
    domain: "society",
    a2aAgentCardUrl: "https://agent.example/.well-known/agent-card.json",
    mcpEndpoint: "stdio://trust-substrate-mcp",
    mcpWritesEnabled: true,
  });

  strictEqual(file.type, EIP8004_REGISTRATION_TYPE);
  strictEqual(file.registrations[0]?.agentId, 22);
  strictEqual(file.trustSubstrate.identityAddress, "identity111");
  strictEqual(file.trustSubstrate.note, "metadata-export-only");
  ok(file.services.some((service) => service.name === "A2A"));
  ok(file.services.some((service) => service.name === "MCP"));
  ok(file.supportedTrust.includes("reputation"));
});

test("keeps write support as metadata, not an EVM deployment claim", () => {
  const file = buildEip8004RegistrationFile({
    name: "Trust Agent",
    description: "Agent with Solana-backed receipts.",
    agentRegistry: "eip155:1:0xregistry",
    agentId: "agent-1",
    identityAddress: "identity111",
  });

  strictEqual(file.trustSubstrate.mcpWritesEnabled, false);
  ok(
    file.services.some((service) => service.endpoint === "solana:identity111"),
  );
});

test("exports feedback and validation evidence with chain bindings", () => {
  const feedback = buildEip8004FeedbackFile({
    agentRegistry: "eip155:1:0xregistry",
    agentId: 22,
    clientAddress: "eip155:1:0xclient",
    createdAt: "2026-05-08T00:00:00.000Z",
    value: 100,
    receiptAddress: "receipt111",
    txSignature: "tx111",
    taskId: "task-1",
  });
  const validation = buildEip8004ValidationFile({
    agentRegistry: "eip155:1:0xregistry",
    agentId: 22,
    validatorAddress: "solana:validator111",
    createdAt: "2026-05-08T00:00:00.000Z",
    outcome: "accepted",
    verdictAddress: "verdict111",
  });

  strictEqual(feedback.trustSubstrate.receiptAddress, "receipt111");
  strictEqual(feedback.a2a?.taskId, "task-1");
  strictEqual(validation.trustSubstrate.verdictAddress, "verdict111");
});
