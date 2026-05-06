import type { PiExtensionHost } from "./extension.js";
import { loadExtensionConfig, type ExtensionConfig } from "./config.js";
import {
  buildSubstrateCommandDefinitions,
  type SubstrateCommandResult,
} from "./slash-commands.js";
import {
  createSubstrateExtension,
  type SubstrateExtensionHandle,
  type SubstrateExtensionOptions,
} from "./substrate-extension.js";

export type PiNotificationType = "info" | "warning" | "error";

export interface PiExtensionCommandContext {
  readonly ui?: {
    readonly notify?: (
      message: string,
      type?: PiNotificationType,
    ) => void | Promise<void>;
  };
}

export interface PiRuntimeCommandOptions {
  readonly description?: string;
  readonly handler: (
    args: string,
    ctx: PiExtensionCommandContext,
  ) => void | Promise<void>;
}

export interface PiExtensionRuntimeApi extends PiExtensionHost {
  registerCommand(name: string, options: PiRuntimeCommandOptions): void;
}

export interface PiSubstrateExtensionOptions extends SubstrateExtensionOptions {
  readonly substrateFactory?: (
    options: SubstrateExtensionOptions,
  ) => SubstrateExtensionHandle;
}

const COMMAND_ARG_SEPARATOR = /\s+/;

const parseCommandArgs = (raw: string): ReadonlyArray<string> => {
  const trimmed = raw.trim();
  return trimmed.length === 0 ? [] : trimmed.split(COMMAND_ARG_SEPARATOR);
};

const resolveConfig = (options: SubstrateExtensionOptions): ExtensionConfig => {
  const base = loadExtensionConfig({ env: options.env });
  return { ...base, ...(options.config ?? {}) };
};

const notifyCommandResult = async (
  ctx: PiExtensionCommandContext,
  result: SubstrateCommandResult,
): Promise<void> => {
  const type: PiNotificationType = result.blocked ? "warning" : "info";
  await ctx.ui?.notify?.(result.output, type);
};

export const createPiSubstrateExtension = (
  options: PiSubstrateExtensionOptions = {},
): ((pi: PiExtensionRuntimeApi) => void) => {
  const { substrateFactory = createSubstrateExtension, ...substrateOptions } =
    options;

  return (pi) => {
    const handle = substrateFactory(substrateOptions);
    handle.attach(pi);

    for (const command of buildSubstrateCommandDefinitions({
      getBootstrap: () => handle.ready,
      stake: handle.stake,
      challenge: handle.challenge,
      dispute: handle.dispute,
      getDashboardLinks: () => {
        const config = resolveConfig(substrateOptions);
        return {
          studioUrl: config.surfpoolStudioUrl,
          runDashboardUrl: config.runDashboardUrl,
        };
      },
    })) {
      pi.registerCommand(command.name, {
        description: command.description,
        handler: async (rawArgs, ctx) => {
          const result = await command.handler({
            raw: rawArgs,
            args: parseCommandArgs(rawArgs),
          });
          await notifyCommandResult(ctx, result);
        },
      });
    }
  };
};

export default createPiSubstrateExtension();
