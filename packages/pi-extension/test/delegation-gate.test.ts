import test from "node:test";
import { strictEqual, match } from "node:assert/strict";

import { createDelegation } from "@trust-substrate/sdk";

import { evaluateDelegationGate, gateToolCall } from "../src/delegation-gate.js";

const DELEGATOR = "agent-alpha";
const DELEGATE = "agent-beta";

test("evaluateDelegationGate passes when action is within scope", () => {
  const delegation = createDelegation({
    delegatorId: DELEGATOR,
    delegateId: DELEGATE,
    allowedActions: ["completion", "handoff"],
    taskIds: ["task-1"],
  });
  const decision = evaluateDelegationGate({
    delegation,
    action: "completion",
    taskId: "task-1",
  });
  strictEqual(decision.block, false);
});

test("evaluateDelegationGate blocks when action is outside scope", () => {
  const delegation = createDelegation({
    delegatorId: DELEGATOR,
    delegateId: DELEGATE,
    allowedActions: ["handoff"],
  });
  const decision = evaluateDelegationGate({
    delegation,
    action: "completion",
  });
  strictEqual(decision.block, true);
  match(String(decision.reason), /action not allowed/i);
});

test("evaluateDelegationGate blocks when delegation revoked", () => {
  const delegation = createDelegation({
    delegatorId: DELEGATOR,
    delegateId: DELEGATE,
    allowedActions: ["completion"],
    revoked: true,
  });
  const decision = evaluateDelegationGate({
    delegation,
    action: "completion",
  });
  strictEqual(decision.block, true);
  match(String(decision.reason), /revoked/i);
});

test("gateToolCall passes through when no delegation supplied", () => {
  const decision = gateToolCall({ toolName: "bash" });
  strictEqual(decision.block, false);
});

test("gateToolCall defaults action to completion", () => {
  const delegation = createDelegation({
    delegatorId: DELEGATOR,
    delegateId: DELEGATE,
    allowedActions: ["handoff"],
  });
  const decision = gateToolCall({ toolName: "bash", delegation });
  strictEqual(decision.block, true);
});
