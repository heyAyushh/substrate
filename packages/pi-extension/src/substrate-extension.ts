import type { KeyObject } from "node:crypto";

import {
  PiToolStreamBridge,
  TrustSubstrateOnchainClient,
  createKitTransactionDispatcher,
  type PiBridgeCommitResult,
  type ReceiptIndexWriter,
} from "@trust-substrate/sdk";
import { LocalDurableIndexer } from "@trust-substrate/indexer";

import { loadExtensionConfig, type ExtensionConfig } from "./config.js";
import {
  createTrustSubstrateExtension,
  type PiExtensionHost,
  type TurnCommitHandler,
} from "./extension.js";
import { loadKeyPairSignerFromFile } from "./keypair.js";
import {
  bootstrapSubstrateSession,
  type BootstrapResult,
} from "./session-bootstrap.js";
import { createSubstrateSessionCommitter } from "./session-commit.js";

export interface SubstrateExtensionOptions {
  readonly config?: Partial<ExtensionConfig>;
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly indexer?: ReceiptIndexWriter;
  readonly runtimeAuthority?: KeyObject;
  readonly sessionId?: string;
  readonly taskDescription?: string;
  readonly onCommitted?: (result: PiBridgeCommitResult) => void | Promise<void>;
  readonly onBootstrapped?: (result: BootstrapResult) => void | Promise<void>;
  readonly onError?: (error: unknown) => void | Promise<void>;
}

export interface SubstrateExtensionHandle {
  readonly attach: (pi: PiExtensionHost) => void;
  readonly ready: Promise<BootstrapResult>;
}

const resolveConfig = (
  options: SubstrateExtensionOptions
): ExtensionConfig => {
  const base = loadExtensionConfig({ env: options.env });
  return { ...base, ...(options.config ?? {}) };
};

interface BootstrappedSession {
  readonly bootstrap: BootstrapResult;
  readonly commit: TurnCommitHandler;
}

export const createSubstrateExtension = (
  options: SubstrateExtensionOptions = {}
): SubstrateExtensionHandle => {
  const config = resolveConfig(options);

  const sessionPromise = (async (): Promise<BootstrappedSession> => {
    const authority = await loadKeyPairSignerFromFile(config.keypairPath);
    const dispatcher = createKitTransactionDispatcher({
      rpcUrl: config.rpcUrl,
      rpcSubscriptionsUrl: config.rpcSubscriptionsUrl,
    });
    const client = new TrustSubstrateOnchainClient(dispatcher);
    const bootstrap = await bootstrapSubstrateSession({
      client,
      authority,
      identityLabel: config.identityLabel,
      taskTitle: config.taskTitle,
      domain: config.domain,
      taskDescription: options.taskDescription,
      autoProvisionIdentity: config.autoProvisionIdentity,
    });
    if (options.onBootstrapped) {
      await options.onBootstrapped(bootstrap);
    }
    const indexer = options.indexer ?? new LocalDurableIndexer();
    const bridge = new PiToolStreamBridge({ onchain: client, indexer });
    const commit = createSubstrateSessionCommitter({
      bridge,
      bindings: bootstrap,
      runtimeAuthority: options.runtimeAuthority,
      sessionId: options.sessionId,
      onCommitted: options.onCommitted,
    });
    return { bootstrap, commit };
  })();

  const handler = createTrustSubstrateExtension({
    onTurnCommit: async (turn) => {
      try {
        const session = await sessionPromise;
        await session.commit(turn);
      } catch (error) {
        if (options.onError) {
          await options.onError(error);
          return;
        }
        throw error;
      }
    },
  });

  return {
    attach: (pi: PiExtensionHost) => handler(pi),
    ready: sessionPromise.then((session) => session.bootstrap),
  };
};
