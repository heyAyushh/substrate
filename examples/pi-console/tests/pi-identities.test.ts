import test from "node:test";
import assert from "node:assert/strict";

import {
  createIdentityWorkspace,
  loadIdentityWorkspace,
  persistIdentityWorkspace,
  type PiIdentityProfile,
} from "../src/lib/pi-identities.ts";

const TEST_IDENTITIES: PiIdentityProfile[] = [
  {
    id: "identity-alpha",
    slug: "alpha",
    label: "Alpha Agent",
    roleSummary: "alpha role",
    promptHint: "alpha prompt",
    receiptCount: 2,
    latestReceiptKind: "completion",
    score: 7,
    delegatedFromLabels: ["Planner"],
    delegatedToLabels: ["Beta"],
  },
];

test("loadIdentityWorkspace falls back when localStorage access is blocked", () => {
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
    const workspace = loadIdentityWorkspace(TEST_IDENTITIES);

    assert.deepEqual(workspace, createIdentityWorkspace(TEST_IDENTITIES));
  } finally {
    globalThis.window = originalWindow;
  }
});

test("persistIdentityWorkspace ignores blocked localStorage writes", () => {
  const originalWindow = globalThis.window;
  const workspace = createIdentityWorkspace(TEST_IDENTITIES);

  globalThis.window = {
    localStorage: {
      setItem() {
        throw new Error("storage disabled");
      },
      removeItem() {
        throw new Error("storage disabled");
      },
    },
  } as Window & typeof globalThis;

  try {
    assert.doesNotThrow(() => {
      persistIdentityWorkspace(workspace);
    });
  } finally {
    globalThis.window = originalWindow;
  }
});
