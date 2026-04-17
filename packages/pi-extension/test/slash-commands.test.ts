import test from "node:test";
import { deepStrictEqual, match, strictEqual } from "node:assert/strict";

import type { Address, TransactionSigner } from "@solana/kit";
import type {
  IdentityRecord,
  TaskRecord,
} from "@trust-substrate/sdk";

import {
  buildSubstrateCommandDefinitions,
  registerSubstrateCommands,
  type SubstrateCommandDefinition,
  type SubstrateCommandHost,
} from "../src/slash-commands.js";
import type { BootstrapResult } from "../src/session-bootstrap.js";

const fakeBootstrap = (): BootstrapResult => {
  const authority = {
    address: "AAA11111111111111111111111111111111111111111" as Address,
  } as TransactionSigner;
  const identity: IdentityRecord = {
    identityId: "identity-xyz",
    authority: "AAA11111111111111111111111111111111111111111",
    label: "pi-local-agent",
    policyRoot: "0x00",
    historyRoot: "0x00",
  };
  const task: TaskRecord = {
    taskId: "task-xyz",
    identityId: "identity-xyz",
    title: "pi coding session",
    domain: "general",
    subtasks: [],
  };
  return {
    authority,
    identity,
    identityAddress: "IDN11111111111111111111111111111111111111111" as Address,
    task,
    taskAddress: "TSK11111111111111111111111111111111111111111" as Address,
    domainCatalogAddress:
      "DMC11111111111111111111111111111111111111111" as Address,
    operations: [],
  };
};

test("substrate-status prints identity/task/PDA summary", async () => {
  const bootstrap = fakeBootstrap();
  const defs = buildSubstrateCommandDefinitions({
    getBootstrap: async () => bootstrap,
  });
  const status = defs.find((d) => d.name === "substrate-status");
  strictEqual(status !== undefined, true);
  const result = await status!.handler({ args: [], raw: "" });
  match(result.output, /identity-xyz/);
  match(result.output, /task-xyz/);
  match(result.output, /domainCatalog/);
});

test("substrate-stake submits parsed lamport amount via deps.stake", async () => {
  const stakes: bigint[] = [];
  const defs = buildSubstrateCommandDefinitions({
    getBootstrap: async () => fakeBootstrap(),
    stake: async (amount) => {
      stakes.push(amount);
      return "sig-deadbeef";
    },
  });
  const cmd = defs.find((d) => d.name === "substrate-stake")!;
  const result = await cmd.handler({ args: ["1000000"], raw: "1000000" });
  deepStrictEqual(stakes, [1000000n]);
  match(result.output, /sig-deadbeef/);
});

test("substrate-stake reports NOT_WIRED when stake dep missing", async () => {
  const defs = buildSubstrateCommandDefinitions({
    getBootstrap: async () => fakeBootstrap(),
  });
  const cmd = defs.find((d) => d.name === "substrate-stake")!;
  const result = await cmd.handler({ args: ["1"], raw: "1" });
  strictEqual(result.blocked, true);
  match(result.output, /not wired/i);
});

test("substrate-challenge requires receiptId argument", async () => {
  const defs = buildSubstrateCommandDefinitions({
    getBootstrap: async () => fakeBootstrap(),
    challenge: async (id) => `challenge-sig-${id}`,
  });
  const cmd = defs.find((d) => d.name === "substrate-challenge")!;
  const missing = await cmd.handler({ args: [], raw: "" });
  strictEqual(missing.blocked, true);
  const ok = await cmd.handler({ args: ["rcpt-42"], raw: "rcpt-42" });
  match(ok.output, /challenge-sig-rcpt-42/);
});

test("substrate-dashboard returns default dashboard links", async () => {
  const defs = buildSubstrateCommandDefinitions({
    getBootstrap: async () => fakeBootstrap(),
  });
  const cmd = defs.find((d) => d.name === "substrate-dashboard");
  strictEqual(cmd !== undefined, true);
  const result = await cmd!.handler({ args: [], raw: "" });
  match(result.output, /studio: http:\/\/127\.0\.0\.1:18489/);
  match(
    result.output,
    /runDashboard: http:\/\/127\.0\.0\.1:4173\/examples\/multi_agent\/dashboard\/index\.html/,
  );
});

test("registerSubstrateCommands forwards every definition to the host", () => {
  const registered: SubstrateCommandDefinition[] = [];
  const host: SubstrateCommandHost = {
    registerCommand(def) {
      registered.push(def);
    },
  };
  registerSubstrateCommands(host, {
    getBootstrap: async () => fakeBootstrap(),
  });
  const names = registered.map((d) => d.name).sort();
  deepStrictEqual(names, [
    "substrate-challenge",
    "substrate-dashboard",
    "substrate-dispute",
    "substrate-stake",
    "substrate-status",
  ]);
});
