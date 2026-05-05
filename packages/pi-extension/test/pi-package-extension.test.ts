import test from "node:test";
import { deepStrictEqual, ok, strictEqual } from "node:assert/strict";

import type { Address, TransactionSigner } from "@solana/kit";
import type { BootstrapResult } from "../src/session-bootstrap.js";
import {
  createPiSubstrateExtension,
  type PiExtensionCommandContext,
  type PiExtensionRuntimeApi,
} from "../src/index.js";

interface RegisteredCommand {
  readonly name: string;
  readonly description?: string;
  readonly handler: (
    args: string,
    ctx: PiExtensionCommandContext,
  ) => Promise<void> | void;
}

const buildBootstrap = (): BootstrapResult => {
  const authority = {
    address: "Auth111111111111111111111111111111111111111" as Address,
  } as TransactionSigner;
  return {
    authority,
    identity: {
      identityId: "identity-live",
      authority: authority.address,
      label: "pi-live-agent",
      policyRoot: "0x00",
      historyRoot: "0x00",
    },
    identityAddress: "Idnt111111111111111111111111111111111111111" as Address,
    task: {
      taskId: "task-live",
      identityId: "identity-live",
      title: "live pi session",
      domain: "coding",
      subtasks: [],
    },
    taskAddress: "Task111111111111111111111111111111111111111" as Address,
    domainCatalogAddress:
      "Dcat111111111111111111111111111111111111111" as Address,
    operations: [],
  };
};

test("Pi package extension attaches the live bridge and registers commands", async () => {
  let attached = false;
  const commands: RegisteredCommand[] = [];
  const notifications: Array<{ message: string; type?: string }> = [];

  const extension = createPiSubstrateExtension({
    config: {
      surfpoolStudioUrl: "http://127.0.0.1:18488",
      runDashboardUrl: "http://127.0.0.1:4173/live",
    },
    substrateFactory: () => ({
      attach: () => {
        attached = true;
      },
      ready: Promise.resolve(buildBootstrap()),
    }),
  });

  const pi: PiExtensionRuntimeApi = {
    on: () => undefined,
    registerCommand: (name, options) => {
      commands.push({
        name,
        description: options.description,
        handler: options.handler,
      });
    },
  };

  extension(pi);

  strictEqual(attached, true);
  deepStrictEqual(
    commands.map((command) => command.name),
    [
      "substrate-status",
      "substrate-dashboard",
      "substrate-stake",
      "substrate-challenge",
      "substrate-dispute",
    ],
  );

  await commands
    .find((command) => command.name === "substrate-status")
    ?.handler("", {
      ui: {
        notify: (message, type) => {
          notifications.push({ message, type });
        },
      },
    });

  ok(notifications[0]?.message.includes("pi-live-agent"));
  strictEqual(notifications[0]?.type, "info");
});

test("Pi package extension forwards live stake and challenge commands", async () => {
  const notifications: Array<{ message: string; type?: string }> = [];

  const extension = createPiSubstrateExtension({
    substrateFactory: () => ({
      attach: () => undefined,
      ready: Promise.resolve(buildBootstrap()),
      stake: async (amountLamports) => `stake-${amountLamports.toString()}`,
      challenge: async (receiptId) => `challenge-${receiptId}`,
      dispute: async (receiptId) => `dispute-${receiptId}`,
    }),
  });

  const commands: RegisteredCommand[] = [];
  const pi: PiExtensionRuntimeApi = {
    on: () => undefined,
    registerCommand: (name, options) => {
      commands.push({
        name,
        description: options.description,
        handler: options.handler,
      });
    },
  };

  extension(pi);

  await commands
    .find((command) => command.name === "substrate-stake")
    ?.handler("42", {
      ui: {
        notify: (message, type) => {
          notifications.push({ message, type });
        },
      },
    });
  await commands
    .find((command) => command.name === "substrate-challenge")
    ?.handler("receipt-9", {
      ui: {
        notify: (message, type) => {
          notifications.push({ message, type });
        },
      },
    });

  strictEqual(notifications[0]?.message, "stake deposit submitted: stake-42");
  strictEqual(
    notifications[1]?.message,
    "challenge submitted: challenge-receipt-9",
  );
});
