import test from "node:test";
import { match, ok, rejects, strictEqual } from "node:assert/strict";

import {
  buildSocietyPiActionSystemPrompt,
  requestSocietyPiAction,
  type SocietyPiRuntimeClient,
} from "../../examples/multi_agent/society_pi_action_driver.ts";

const makeInput = () => ({
  sessionId: "live_session_1",
  runId: "run_1",
  commitId: "commit_1",
  runtimeUrl: "http://127.0.0.1:5173",
  provider: "openai-codex",
  modelId: "gpt-5.4-mini",
  agent: {
    id: "agent_1",
    name: "Noor Ledger",
    signer: "agent_signer_1",
    identity: "agent_identity_1",
    delegation: "delegation_1",
  },
  event: {
    id: "event_1",
    tick: 7,
    agentId: "agent_1",
    action: "heartbeat",
    receiptKind: "completion",
    tokenDelta: 4,
    cell: { x: 2, y: 3 },
    note: "harvested resources and paid upkeep",
  },
  receipt: {
    receiptId: "receipt_1",
    kind: "completion",
    payloadHash: "payload_hash_1",
  },
  world: {
    beforeReceipt: "previous_receipt_1",
    afterFrame: { tick: 7, liveAgents: 3, receipts: 9 },
  },
});

test("Pi action system prompt carries the exact timed action assignment", () => {
  const prompt = buildSocietyPiActionSystemPrompt(makeInput());

  ok(prompt.includes("event_1"));
  ok(prompt.includes('"tick": 7'));
  ok(prompt.includes('"action": "heartbeat"'));
  ok(
    prompt.includes("Choose exactly one allowed action for the assigned tick"),
  );
  ok(prompt.includes('"allowedActions"'));
  ok(prompt.includes("Return only strict JSON"));
});

test("Pi action request records prompt and response evidence", async () => {
  let capturedSystemPrompt = "";
  const runtimeClient: SocietyPiRuntimeClient = {
    async complete(request) {
      capturedSystemPrompt = request.systemPrompt;
      return JSON.stringify({
        schemaVersion: 1,
        decision: "accepted",
        eventId: "event_1",
        agentId: "agent_1",
        action: "heartbeat",
        selectedActionId: "event_1",
        tick: 7,
        receiptId: "receipt_1",
        note: "Action accepted for this tick.",
      });
    },
  };

  const result = await requestSocietyPiAction(makeInput(), runtimeClient);

  strictEqual(result.decision.decision, "accepted");
  strictEqual(result.decision.eventId, "event_1");
  strictEqual(result.provider, "openai-codex");
  strictEqual(result.modelId, "gpt-5.4-mini");
  match(result.promptHash, /^[a-f0-9]{64}$/);
  match(result.responseHash, /^[a-f0-9]{64}$/);
  ok(capturedSystemPrompt.includes("event_1"));
  ok(capturedSystemPrompt.includes("agent_signer_1"));
});

test("Pi action request allows an explicit selected action id", async () => {
  const runtimeClient: SocietyPiRuntimeClient = {
    async complete() {
      return JSON.stringify({
        schemaVersion: 1,
        decision: "accepted",
        eventId: "event_1",
        agentId: "agent_1",
        selectedActionId: "commit_heartbeat",
        action: "heartbeat",
        tick: 7,
        receiptId: "receipt_1",
      });
    },
  };

  const result = await requestSocietyPiAction(
    {
      ...makeInput(),
      allowedActions: [
        {
          id: "commit_heartbeat",
          action: "heartbeat",
          receiptKind: "completion",
          note: "Commit-ready liveness proof.",
        },
      ],
    },
    runtimeClient,
  );

  strictEqual(result.decision.selectedActionId, "commit_heartbeat");
});

test("Pi action request rejects a response outside the allowed action set", async () => {
  const runtimeClient: SocietyPiRuntimeClient = {
    async complete() {
      return JSON.stringify({
        schemaVersion: 1,
        decision: "accepted",
        eventId: "event_1",
        agentId: "agent_1",
        selectedActionId: "forged_action",
        action: "heartbeat",
        tick: 7,
        receiptId: "receipt_1",
      });
    },
  };

  await rejects(
    requestSocietyPiAction(
      {
        ...makeInput(),
        allowedActions: [{ id: "commit_heartbeat", action: "heartbeat" }],
      },
      runtimeClient,
    ),
    /outside the allowed set/,
  );
});

test("Pi action request rejects a response for the wrong action", async () => {
  const runtimeClient: SocietyPiRuntimeClient = {
    async complete() {
      return JSON.stringify({
        schemaVersion: 1,
        decision: "accepted",
        eventId: "event_1",
        agentId: "agent_1",
        action: "birth",
        tick: 7,
        receiptId: "receipt_1",
      });
    },
  };

  await rejects(
    requestSocietyPiAction(makeInput(), runtimeClient),
    /outside the allowed set/,
  );
});
