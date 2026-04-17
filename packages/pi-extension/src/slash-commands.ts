import {
  DEFAULT_RUN_DASHBOARD_URL,
  DEFAULT_SURFPOOL_STUDIO_URL,
} from "./config.js";
import type { BootstrapResult } from "./session-bootstrap.js";

export interface SubstrateCommandContext {
  readonly args: ReadonlyArray<string>;
  readonly raw: string;
}

export interface SubstrateCommandResult {
  readonly output: string;
  readonly blocked?: boolean;
}

export type SubstrateCommandHandler = (
  ctx: SubstrateCommandContext
) => SubstrateCommandResult | Promise<SubstrateCommandResult>;

export interface SubstrateCommandDefinition {
  readonly name: string;
  readonly description: string;
  readonly handler: SubstrateCommandHandler;
}

export interface SubstrateCommandHost {
  registerCommand(definition: SubstrateCommandDefinition): void;
}

export interface SlashCommandDeps {
  readonly getBootstrap: () => Promise<BootstrapResult>;
  readonly stake?: (amountLamports: bigint) => Promise<string>;
  readonly challenge?: (receiptId: string) => Promise<string>;
  readonly dispute?: (receiptId: string) => Promise<string>;
  readonly getDashboardLinks?: () => {
    readonly studioUrl: string;
    readonly runDashboardUrl: string;
  };
}

const NOT_WIRED = "This command is not wired in the current session.";

const formatStatus = (bootstrap: BootstrapResult): string => {
  const lines = [
    `identity: ${bootstrap.identity.identityId} (${bootstrap.identity.label})`,
    `authority: ${bootstrap.authority.address}`,
    `task: ${bootstrap.task.taskId} — ${bootstrap.task.title}`,
    `domain: ${bootstrap.task.domain}`,
    `identityAddress: ${bootstrap.identityAddress}`,
    `taskAddress: ${bootstrap.taskAddress}`,
    `domainCatalog: ${bootstrap.domainCatalogAddress}`,
  ];
  return lines.join("\n");
};

const parseAmount = (raw: string | undefined): bigint => {
  if (!raw) {
    throw new Error("amount is required (in lamports)");
  }
  const cleaned = raw.trim();
  if (!/^[0-9]+$/.test(cleaned)) {
    throw new Error(`invalid lamport amount: ${raw}`);
  }
  return BigInt(cleaned);
};

const formatDashboardLinks = (
  links: ReturnType<NonNullable<SlashCommandDeps["getDashboardLinks"]>>
): string => {
  const lines = [
    `studio: ${links.studioUrl}`,
    `runDashboard: ${links.runDashboardUrl}`,
  ];
  return lines.join("\n");
};

export const buildSubstrateCommandDefinitions = (
  deps: SlashCommandDeps
): ReadonlyArray<SubstrateCommandDefinition> => [
  {
    name: "substrate-status",
    description: "Print the bound identity, task, and program PDAs.",
    handler: async () => {
      const bootstrap = await deps.getBootstrap();
      return { output: formatStatus(bootstrap) };
    },
  },
  {
    name: "substrate-dashboard",
    description: "Print the local Surfpool Studio and run dashboard links.",
    handler: async () => {
      const links = deps.getDashboardLinks?.() ?? {
        studioUrl: DEFAULT_SURFPOOL_STUDIO_URL,
        runDashboardUrl: DEFAULT_RUN_DASHBOARD_URL,
      };
      return { output: formatDashboardLinks(links) };
    },
  },
  {
    name: "substrate-stake",
    description: "Deposit lamports into the agent stake PDA.",
    handler: async (ctx) => {
      if (!deps.stake) return { output: NOT_WIRED, blocked: true };
      const amount = parseAmount(ctx.args[0]);
      const signature = await deps.stake(amount);
      return { output: `stake deposit submitted: ${signature}` };
    },
  },
  {
    name: "substrate-challenge",
    description: "Raise a challenge receipt against a prior receipt.",
    handler: async (ctx) => {
      if (!deps.challenge) return { output: NOT_WIRED, blocked: true };
      const receiptId = ctx.args[0];
      if (!receiptId) {
        return { output: "usage: /substrate-challenge <receiptId>", blocked: true };
      }
      const signature = await deps.challenge(receiptId);
      return { output: `challenge submitted: ${signature}` };
    },
  },
  {
    name: "substrate-dispute",
    description: "Open a dispute receipt against a prior receipt.",
    handler: async (ctx) => {
      if (!deps.dispute) return { output: NOT_WIRED, blocked: true };
      const receiptId = ctx.args[0];
      if (!receiptId) {
        return { output: "usage: /substrate-dispute <receiptId>", blocked: true };
      }
      const signature = await deps.dispute(receiptId);
      return { output: `dispute submitted: ${signature}` };
    },
  },
];

export const registerSubstrateCommands = (
  host: SubstrateCommandHost,
  deps: SlashCommandDeps
): void => {
  for (const definition of buildSubstrateCommandDefinitions(deps)) {
    host.registerCommand(definition);
  }
};
