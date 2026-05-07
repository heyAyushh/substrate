import test from "node:test";
import assert from "node:assert/strict";

import {
  createControlPlaneWorkspace,
  launchPresetControlPlaneAgent,
  loadControlPlaneWorkspace,
  markControlPlaneAgentLaunchPromptSent,
  resetControlPlaneWorkspace,
  type ControlPlaneWorkspace,
} from "../src/lib/pi-control-plane.ts";
import type { PiIdentityProfile } from "../src/lib/pi-identities.ts";

const TEST_IDENTITIES: PiIdentityProfile[] = [
  {
    id: "identity-alpha",
    slug: "alpha",
    label: "Alpha Agent",
    roleSummary: "Executes stake and receipt work.",
    promptHint: "Ask Alpha to execute the next onchain step.",
    receiptCount: 3,
    latestReceiptKind: "completion",
    score: 9,
    delegatedFromLabels: ["Planner"],
    delegatedToLabels: ["Verifier"],
  },
  {
    id: "identity-beta",
    slug: "beta",
    label: "Beta Agent",
    roleSummary: "Reviews receipts and flags inconsistencies.",
    promptHint: "Ask Beta to verify the active run.",
    receiptCount: 1,
    latestReceiptKind: "attestation",
    score: 7,
    delegatedFromLabels: ["Alpha"],
    delegatedToLabels: [],
  },
];

test("createControlPlaneWorkspace creates one default operator session", () => {
  const workspace = createControlPlaneWorkspace(TEST_IDENTITIES, 4);

  assert.equal(workspace.order.length, 1);
  assert.equal(workspace.activeAgentId, workspace.order[0]);

  const operatorSession = workspace.agents[workspace.order[0]];
  assert.equal(operatorSession.roleId, "operator");
  assert.equal(operatorSession.identityId, null);
  assert.equal(operatorSession.launchedAtReceiptCount, 4);
  assert.equal(operatorSession.launchPromptSent, false);
});

test("launchPresetControlPlaneAgent appends a unique active session", () => {
  const workspace = createControlPlaneWorkspace(TEST_IDENTITIES, 2);

  const nextWorkspace = launchPresetControlPlaneAgent(
    workspace,
    "executor",
    TEST_IDENTITIES,
    {
      launchedAtReceiptCount: 6,
      preferredIdentityId: "identity-alpha",
      now: 1_720_000_000_000,
    },
  );

  assert.equal(nextWorkspace.order.length, 2);
  assert.equal(nextWorkspace.activeAgentId, nextWorkspace.order[1]);

  const executorSession = nextWorkspace.agents[nextWorkspace.activeAgentId];
  assert.equal(executorSession.roleId, "executor");
  assert.equal(executorSession.identityId, "identity-alpha");
  assert.equal(executorSession.launchedAtReceiptCount, 6);
  assert.equal(executorSession.launchPromptSent, false);
  assert.match(executorSession.label, /executor/i);
});

test("launch prompt is marked sent only after an explicit send", () => {
  const workspace = createControlPlaneWorkspace(TEST_IDENTITIES, 2);
  const operatorSession = workspace.agents[workspace.activeAgentId];

  const nextWorkspace = markControlPlaneAgentLaunchPromptSent(
    workspace,
    operatorSession.id,
  );

  assert.equal(workspace.agents[operatorSession.id].launchPromptSent, false);
  assert.equal(nextWorkspace.agents[operatorSession.id].launchPromptSent, true);
});

test("loadControlPlaneWorkspace falls back when localStorage access is blocked", () => {
  const originalWindow = globalThis.window;

  globalThis.window = {
    localStorage: {
      getItem() {
        throw new Error("storage disabled");
      },
      removeItem() {
        throw new Error("storage disabled");
      },
    },
  } as Window & typeof globalThis;

  try {
    const workspace = loadControlPlaneWorkspace(TEST_IDENTITIES, {
      launchedAtReceiptCount: 5,
    });

    assert.equal(workspace.order.length, 1);
    assert.equal(workspace.activeAgentId, workspace.order[0]);

    const operatorSession = workspace.agents[workspace.activeAgentId];
    assert.equal(operatorSession.roleId, "operator");
    assert.equal(operatorSession.identityId, null);
    assert.equal(operatorSession.launchedAtReceiptCount, 5);
  } finally {
    globalThis.window = originalWindow;
  }
});

test("loadControlPlaneWorkspace migrates legacy identity chats into control plane sessions", () => {
  const originalWindow = globalThis.window;
  const legacyWorkspace = {
    activeIdentityId: "identity-beta",
    chats: {
      "identity-alpha": {
        messages: [],
        preferredModel: null,
        thinkingLevel: "off",
      },
      "identity-beta": {
        messages: [
          {
            role: "user",
            content: [{ type: "text", text: "check the dispute receipt" }],
            timestamp: 123,
          },
        ],
        preferredModel: {
          provider: "openai-codex",
          modelId: "gpt-5.4",
        },
        thinkingLevel: "medium",
      },
    },
  } satisfies Record<string, unknown>;

  globalThis.window = {
    localStorage: {
      getItem(key: string) {
        if (key === "trust-substrate-pi-console-control-plane-v1") {
          return null;
        }

        if (key === "trust-substrate-pi-console-identities-v2") {
          return JSON.stringify(legacyWorkspace);
        }

        return null;
      },
      removeItem() {},
    },
  } as Window & typeof globalThis;

  try {
    const workspace = loadControlPlaneWorkspace(TEST_IDENTITIES, {
      launchedAtReceiptCount: 3,
    });

    assert.equal(workspace.order.length, 1);
    const migratedSession = workspace.agents[workspace.activeAgentId];
    assert.equal(migratedSession.identityId, "identity-beta");
    assert.equal(migratedSession.chat.messages.length, 1);
    assert.equal(migratedSession.chat.thinkingLevel, "medium");
  } finally {
    globalThis.window = originalWindow;
  }
});

test("launchPresetControlPlaneAgent does not mutate the input workspace", () => {
  const workspace = createControlPlaneWorkspace(TEST_IDENTITIES, 1);
  const snapshot = structuredClone(workspace) as ControlPlaneWorkspace;

  void launchPresetControlPlaneAgent(workspace, "planner", TEST_IDENTITIES, {
    launchedAtReceiptCount: 2,
    now: 1_720_000_000_100,
  });

  assert.deepEqual(workspace, snapshot);
});

test("resetControlPlaneWorkspace drops launched sessions and starts a fresh operator run", () => {
  const workspace = launchPresetControlPlaneAgent(
    createControlPlaneWorkspace(TEST_IDENTITIES, 2),
    "executor",
    TEST_IDENTITIES,
    {
      launchedAtReceiptCount: 6,
      preferredIdentityId: "identity-alpha",
      now: 1_720_000_000_000,
    },
  );

  const resetWorkspace = resetControlPlaneWorkspace(TEST_IDENTITIES, 11);

  assert.equal(resetWorkspace.order.length, 1);
  assert.equal(resetWorkspace.activeAgentId, resetWorkspace.order[0]);
  assert.notDeepEqual(resetWorkspace.order, workspace.order);

  const operatorSession = resetWorkspace.agents[resetWorkspace.activeAgentId];
  assert.equal(operatorSession.roleId, "operator");
  assert.equal(operatorSession.identityId, null);
  assert.equal(operatorSession.launchedAtReceiptCount, 11);
});
