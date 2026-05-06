import type { KeyObject } from "node:crypto";

import {
  PiToolStreamBridge,
  TrustSubstrateOnchainClient,
  buildUnansweredChallengePayload,
  createChallengeReceipt,
  createIdentity,
  createKitTransactionDispatcher,
  createReceipt,
  withPayloadHash,
  type PiBridgeCommitResult,
  type ReceiptIndexWriter,
  type ReceiptRecord,
} from "@trust-substrate/sdk";
import {
  SqliteDurableIndexer,
  type IndexedReceipt,
} from "@trust-substrate/indexer";

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
  readonly stake?: (amountLamports: bigint) => Promise<string>;
  readonly challenge?: (receiptId: string) => Promise<string>;
  readonly dispute?: (receiptId: string) => Promise<string>;
}

const resolveConfig = (options: SubstrateExtensionOptions): ExtensionConfig => {
  const base = loadExtensionConfig({ env: options.env });
  return { ...base, ...(options.config ?? {}) };
};

interface BootstrappedSession {
  readonly bootstrap: BootstrapResult;
  readonly commit: TurnCommitHandler;
  readonly stake: (amountLamports: bigint) => Promise<string>;
  readonly challenge: (receiptId: string) => Promise<string>;
  readonly dispute: (receiptId: string) => Promise<string>;
}

interface ReceiptHistoryReader extends ReceiptIndexWriter {
  getTaskHistory(taskId: string): IndexedReceipt[];
  getChallengeRounds?(
    targetReceiptId: string,
    currentSlot?: number,
  ): ReadonlyArray<{
    readonly challengeReceiptId: string;
    readonly answered: boolean;
  }>;
}

interface LiveCommandHandlerInput {
  readonly bridge: Pick<PiToolStreamBridge<ReceiptHistoryReader>, "indexer">;
  readonly client: Pick<
    TrustSubstrateOnchainClient,
    | "bindAuditReceipt"
    | "bindReceipt"
    | "emitAuditReceipt"
    | "ensureIdentity"
    | "ensureIdentityBond"
    | "ensureStake"
    | "finalizeUnansweredChallenge"
    | "getCurrentSlot"
    | "stake"
  >;
  readonly bindings: BootstrapResult;
}

interface LiveCommandHandlers {
  readonly stake: (amountLamports: bigint) => Promise<string>;
  readonly challenge: (receiptId: string) => Promise<string>;
  readonly dispute: (receiptId: string) => Promise<string>;
}

const TRUST_MODE_VERDICT = 0;
const DEFAULT_CHALLENGE_DEADLINE_SLOTS = 40;
const MANUAL_DISPUTE_MARKER = "trust-substrate.manual_dispute";
const REVIEWER_LABEL_SUFFIX = "-reviewer";

interface AuditReviewerBinding {
  readonly identity: ReturnType<typeof createIdentity>;
  readonly identityAddress: BootstrapResult["identityAddress"];
  readonly identityBondAddress: BootstrapResult["identityAddress"];
}

const toReceiptHistoryReader = (
  indexer: ReceiptIndexWriter,
): ReceiptHistoryReader => {
  if (typeof (indexer as ReceiptHistoryReader).getTaskHistory !== "function") {
    throw new Error(
      "The configured receipt indexer cannot query task history for live commands.",
    );
  }
  return indexer as ReceiptHistoryReader;
};

const getTaskReceiptCursor = (
  indexer: ReceiptHistoryReader,
  taskId: string,
): {
  readonly previousReceiptId?: string;
  readonly sequence: number;
} => {
  const history = indexer.getTaskHistory(taskId);
  const latest = history.at(-1);
  return {
    previousReceiptId: latest?.receiptId,
    sequence: (latest?.sequence ?? 0) + 1,
  };
};

const requireTaskReceipt = (
  indexer: ReceiptHistoryReader,
  taskId: string,
  receiptId: string,
): IndexedReceipt => {
  const receipt = indexer
    .getTaskHistory(taskId)
    .find((candidate) => candidate.receiptId === receiptId);
  if (!receipt) {
    throw new Error(
      `Receipt ${receiptId} is not indexed for the current task.`,
    );
  }
  return receipt;
};

const asNumber = (value: unknown): number | undefined => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && /^\d+$/.test(value)) {
    return Number(value);
  }
  return undefined;
};

const getNextAuditRound = (
  indexer: ReceiptHistoryReader,
  taskId: string,
  targetReceiptId: string,
  kind: "challenge" | "dispute",
): number =>
  indexer.getTaskHistory(taskId).filter((receipt) => {
    if (receipt.kind !== kind) {
      return false;
    }
    if (kind === "challenge") {
      return receipt.payload.challengeTarget === targetReceiptId;
    }
    return receipt.payload.targetReceiptId === targetReceiptId;
  }).length;

const getAuditRound = (receipt: IndexedReceipt): number =>
  asNumber(receipt.payload.auditRound) ?? 0;

const getChallengeDeadlineSlot = (receipt: IndexedReceipt): number =>
  asNumber(receipt.payload.deadlineSlot) ?? 0;

const buildAuditReviewerBinding = async (
  input: LiveCommandHandlerInput,
): Promise<AuditReviewerBinding> => {
  const identity = createIdentity({
    authority: input.bindings.authority.address,
    label: `${input.bindings.identity.label}${REVIEWER_LABEL_SUFFIX}`,
  });
  const identityCommit = await input.client.ensureIdentity({
    authority: input.bindings.authority,
    identity,
  });
  const identityBondCommit = await input.client.ensureIdentityBond({
    authority: input.bindings.authority,
    identity: identityCommit.address,
  });

  return {
    identity,
    identityAddress: identityCommit.address,
    identityBondAddress: identityBondCommit.address,
  };
};

const recordSubmittedReceipt = (
  indexer: ReceiptHistoryReader,
  receipt: ReceiptRecord,
  operation: { readonly signature?: string; readonly slot: number },
  kind: string,
): string => {
  ingestCommittedReceipt(indexer, receipt, operation.slot);
  if (!operation.signature) {
    throw new Error(`No Surfpool signature returned for ${kind} receipt.`);
  }
  return operation.signature;
};

const annotateAuditReceipt = (
  receipt: ReceiptRecord,
  input: {
    readonly auditorId: string;
    readonly targetReceiptId: string;
    readonly round: number;
  },
): ReceiptRecord => {
  const annotatedReceipt = createReceipt({
    actorId: input.auditorId,
    kind: receipt.kind,
    taskId: receipt.taskId,
    sequence: receipt.sequence,
    previousReceiptId: receipt.previousReceiptId,
    payload: withPayloadHash({
      ...receipt.payload,
      auditRound: input.round,
    }),
  });

  return {
    ...annotatedReceipt,
    auditorId: input.auditorId,
    targetReceiptId: input.targetReceiptId,
    round: input.round,
  };
};

const ingestCommittedReceipt = (
  indexer: ReceiptHistoryReader,
  receipt: ReceiptRecord,
  slot: number,
) => {
  indexer.ingest([
    {
      receiptId: receipt.receiptId,
      slot,
      taskId: receipt.taskId,
      actorId: receipt.actorId,
      kind: receipt.kind,
      domain: receipt.domain,
      payload: { ...receipt.payload },
      sequence: receipt.sequence,
    },
  ]);
};

export const createLiveCommandHandlers = (
  input: LiveCommandHandlerInput,
): LiveCommandHandlers => ({
  stake: async (amountLamports) => {
    await input.client.ensureStake({
      owner: input.bindings.authority,
      identity: input.bindings.identityAddress,
      slashAuthority: input.bindings.authority.address,
      trustMode: TRUST_MODE_VERDICT,
    });
    const result = await input.client.stake({
      owner: input.bindings.authority,
      identity: input.bindings.identityAddress,
      amount: amountLamports,
    });
    if (!result.signature) {
      throw new Error("No Surfpool signature returned for stake deposit.");
    }
    return result.signature;
  },
  challenge: async (receiptId) => {
    const indexer = toReceiptHistoryReader(input.bridge.indexer);
    const targetReceipt = requireTaskReceipt(
      indexer,
      input.bindings.task.taskId,
      receiptId,
    );
    const targetReceiptRecord = targetReceipt as unknown as ReceiptRecord;
    const reviewer = await buildAuditReviewerBinding(input);
    const targetReceiptBinding = await input.client.bindReceipt({
      identity: input.bindings.identityAddress,
      task: input.bindings.taskAddress,
      receipt: targetReceiptRecord,
    });
    const round = getNextAuditRound(
      indexer,
      input.bindings.task.taskId,
      receiptId,
      "challenge",
    );
    const cursor = getTaskReceiptCursor(indexer, input.bindings.task.taskId);
    const receipt = createChallengeReceipt({
      actorId: reviewer.identity.identityId,
      taskId: input.bindings.task.taskId,
      sequence: cursor.sequence,
      previousReceiptId: cursor.previousReceiptId,
      domain: input.bindings.task.domain,
      targetReceiptId: receiptId,
      deadlineSlot:
        (targetReceipt.slot ?? 0) + DEFAULT_CHALLENGE_DEADLINE_SLOTS,
    });
    const annotatedReceipt = annotateAuditReceipt(receipt, {
      auditorId: reviewer.identity.identityId,
      targetReceiptId: receiptId,
      round,
    });
    const committedReceipt = await input.client.emitAuditReceipt({
      authority: input.bindings.authority,
      auditorIdentity: reviewer.identityAddress,
      identityBond: reviewer.identityBondAddress,
      targetIdentity: input.bindings.identityAddress,
      targetReceipt: targetReceiptBinding.address,
      domainCatalog: input.bindings.domainCatalogAddress,
      receipt: annotatedReceipt,
      round,
      deadlineSlot:
        (targetReceipt.slot ?? 0) + DEFAULT_CHALLENGE_DEADLINE_SLOTS,
    });
    return recordSubmittedReceipt(
      indexer,
      annotatedReceipt,
      committedReceipt,
      "challenge",
    );
  },
  dispute: async (receiptId) => {
    const indexer = toReceiptHistoryReader(input.bridge.indexer);
    const targetReceipt = requireTaskReceipt(
      indexer,
      input.bindings.task.taskId,
      receiptId,
    );
    const targetReceiptRecord = targetReceipt as unknown as ReceiptRecord;
    const reviewer = await buildAuditReviewerBinding(input);
    const targetReceiptBinding = await input.client.bindReceipt({
      identity: input.bindings.identityAddress,
      task: input.bindings.taskAddress,
      receipt: targetReceiptRecord,
    });
    const cursor = getTaskReceiptCursor(indexer, input.bindings.task.taskId);
    const pendingChallenge = indexer
      .getChallengeRounds?.(receiptId)
      ?.filter((candidate) => !candidate.answered)
      .at(-1);
    if (pendingChallenge) {
      const challengeReceipt = requireTaskReceipt(
        indexer,
        input.bindings.task.taskId,
        pendingChallenge.challengeReceiptId,
      );
      const round = getAuditRound(challengeReceipt);
      const receipt = buildUnansweredChallengePayload({
        actorId: reviewer.identity.identityId,
        taskId: input.bindings.task.taskId,
        sequence: cursor.sequence,
        previousReceiptId: cursor.previousReceiptId,
        domain: input.bindings.task.domain,
        challengeReceiptId: pendingChallenge.challengeReceiptId,
        targetReceiptId: receiptId,
      });
      const annotatedReceipt = annotateAuditReceipt(receipt, {
        auditorId: reviewer.identity.identityId,
        targetReceiptId: receiptId,
        round,
      });
      if (
        (await input.client.getCurrentSlot()) >=
        getChallengeDeadlineSlot(challengeReceipt)
      ) {
        const committedReceipt = await input.client.finalizeUnansweredChallenge(
          {
            authority: input.bindings.authority,
            targetIdentity: input.bindings.identityAddress,
            challenge: (
              await input.client.bindAuditReceipt({
                auditorIdentity: reviewer.identityAddress,
                targetReceipt: targetReceiptBinding.address,
                kind: "challenge",
                round,
              })
            ).address,
            targetReceipt: targetReceiptBinding.address,
            auditorIdentity: reviewer.identityAddress,
            round,
          },
        );
        return recordSubmittedReceipt(
          indexer,
          annotatedReceipt,
          committedReceipt,
          "dispute",
        );
      }

      const committedReceipt = await input.client.emitAuditReceipt({
        authority: input.bindings.authority,
        auditorIdentity: reviewer.identityAddress,
        identityBond: reviewer.identityBondAddress,
        targetIdentity: input.bindings.identityAddress,
        targetReceipt: targetReceiptBinding.address,
        domainCatalog: input.bindings.domainCatalogAddress,
        receipt: annotatedReceipt,
        round,
      });
      return recordSubmittedReceipt(
        indexer,
        annotatedReceipt,
        committedReceipt,
        "dispute",
      );
    }

    const round = getNextAuditRound(
      indexer,
      input.bindings.task.taskId,
      receiptId,
      "dispute",
    );
    const receipt = createReceipt({
      actorId: reviewer.identity.identityId,
      kind: "dispute",
      taskId: input.bindings.task.taskId,
      sequence: cursor.sequence,
      previousReceiptId: cursor.previousReceiptId,
      payload: withPayloadHash({
        domain: input.bindings.task.domain,
        type: MANUAL_DISPUTE_MARKER,
        targetReceiptId: receiptId,
      }),
    });
    const annotatedReceipt = annotateAuditReceipt(receipt, {
      auditorId: reviewer.identity.identityId,
      targetReceiptId: receiptId,
      round,
    });
    const committedReceipt = await input.client.emitAuditReceipt({
      authority: input.bindings.authority,
      auditorIdentity: reviewer.identityAddress,
      identityBond: reviewer.identityBondAddress,
      targetIdentity: input.bindings.identityAddress,
      targetReceipt: targetReceiptBinding.address,
      domainCatalog: input.bindings.domainCatalogAddress,
      receipt: annotatedReceipt,
      round,
    });
    return recordSubmittedReceipt(
      indexer,
      annotatedReceipt,
      committedReceipt,
      "dispute",
    );
  },
});

export const createSubstrateExtension = (
  options: SubstrateExtensionOptions = {},
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
    const indexer =
      options.indexer ?? new SqliteDurableIndexer({ path: config.indexDbPath });
    const bridge = new PiToolStreamBridge({ onchain: client, indexer });
    const commit = createSubstrateSessionCommitter({
      bridge,
      bindings: bootstrap,
      runtimeAuthority: options.runtimeAuthority,
      sessionId: options.sessionId,
      onCommitted: options.onCommitted,
    });
    const liveCommands = createLiveCommandHandlers({
      bridge: bridge as PiToolStreamBridge<ReceiptHistoryReader>,
      client,
      bindings: bootstrap,
    });
    return {
      bootstrap,
      commit,
      stake: liveCommands.stake,
      challenge: liveCommands.challenge,
      dispute: liveCommands.dispute,
    };
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
    stake: (amountLamports: bigint) =>
      sessionPromise.then((session) => session.stake(amountLamports)),
    challenge: (receiptId: string) =>
      sessionPromise.then((session) => session.challenge(receiptId)),
    dispute: (receiptId: string) =>
      sessionPromise.then((session) => session.dispute(receiptId)),
  };
};
