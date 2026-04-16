import type { KeyObject } from "node:crypto";
import type { Address, TransactionSigner } from "@solana/kit";

import {
  createReceipt,
  type IdentityRecord,
  type ReceiptKind,
  type ReceiptRecord,
  type TaskRecord,
} from "./client.js";
import { hashExecutionRecord, type ExecutionRecordVerification } from "./execution-record.js";
import { createStakeEvent } from "./stake.js";
import { adaptAndSignPiToolCalls, adaptPiToolCalls, type PiToolCall } from "./pi-adapter.js";
import { TrustSubstrateOnchainClient, type OnchainOperationResult } from "./onchain-client.js";

export interface ReceiptIndexRecord {
  readonly receiptId: string;
  readonly slot: number;
  readonly taskId: string;
  readonly actorId: string;
  readonly kind: ReceiptKind;
  readonly domain: string;
  readonly payload: Readonly<Record<string, unknown>>;
}

export interface ReceiptIndexWriter {
  ingest(receipts: ReadonlyArray<ReceiptIndexRecord>): void;
}

export interface PiBridgeStakeInput {
  readonly slashAuthority: Address;
  readonly trustMode: number;
  readonly depositLamports?: bigint;
  readonly ownerId?: string;
  readonly slashAuthorityId?: string;
}

export interface PiBridgeCommitInput {
  readonly authority: TransactionSigner;
  readonly identity: IdentityRecord;
  readonly identityAddress: Address;
  readonly task: TaskRecord;
  readonly taskAddress: Address;
  readonly domainCatalogAddress: Address;
  readonly recordId: string;
  readonly kind: ReceiptKind;
  readonly sequence: number;
  readonly toolCalls: ReadonlyArray<PiToolCall>;
  readonly previousReceiptId?: string;
  readonly payload?: Readonly<Record<string, unknown>>;
  readonly runtimeAuthority?: KeyObject;
  readonly storage?: {
    readonly uri: string;
    readonly hash?: string;
  };
  readonly actorId?: string;
  readonly stake?: PiBridgeStakeInput;
  readonly syncTaskStatus?: boolean;
}

export interface PiBridgeExecutionResult {
  readonly record: ReturnType<typeof adaptPiToolCalls>;
  readonly runtimeAuthority?: string;
  readonly verification?: ExecutionRecordVerification;
}

export interface PiBridgeCommitResult {
  readonly execution: PiBridgeExecutionResult;
  readonly receipt: ReceiptRecord;
  readonly indexedReceipt: ReceiptIndexRecord;
  readonly onchain: {
    readonly receiptAddress: Address;
    readonly stakeAddress?: Address;
    readonly operations: ReadonlyArray<OnchainOperationResult>;
  };
}

export class PiToolStreamBridge<TIndexer extends ReceiptIndexWriter> {
  readonly indexer: TIndexer;
  private readonly onchain: TrustSubstrateOnchainClient;

  constructor(input: {
    readonly onchain: TrustSubstrateOnchainClient;
    readonly indexer: TIndexer;
  }) {
    this.onchain = input.onchain;
    this.indexer = input.indexer;
  }

  async commit(input: PiBridgeCommitInput): Promise<PiBridgeCommitResult> {
    const execution = input.runtimeAuthority
      ? adaptAndSignPiToolCalls({
          recordId: input.recordId,
          identityId: input.identity.identityId,
          taskId: input.task.taskId,
          toolCalls: input.toolCalls,
          runtimeAuthority: input.runtimeAuthority,
        })
      : {
          record: adaptPiToolCalls({
            recordId: input.recordId,
            identityId: input.identity.identityId,
            taskId: input.task.taskId,
            toolCalls: input.toolCalls,
          }),
        };
    const payloadHash = hashExecutionRecord(execution.record).root.toString(
      "hex"
    );
    const operations: OnchainOperationResult[] = [];
    const payload: Record<string, unknown> = {
      ...(input.payload ?? {}),
      domain: input.task.domain,
      recordId: input.recordId,
      payloadHash,
    };

    if (input.storage) {
      payload.storage = {
        uri: input.storage.uri,
        ...(input.storage.hash ? { hash: input.storage.hash } : {}),
      };
    }

    const stakeEvents = this.buildStakeEvents(input);
    if (stakeEvents.length > 0) {
      const existingStakeEvents = Array.isArray(payload.stakeEvents)
        ? [...payload.stakeEvents]
        : [];
      payload.stakeEvents = [...existingStakeEvents, ...stakeEvents];
    }

    const receipt = createReceipt({
      actorId: input.actorId ?? input.identity.identityId,
      kind: input.kind,
      taskId: input.task.taskId,
      sequence: input.sequence,
      previousReceiptId: input.previousReceiptId,
      payload,
    });

    let stakeAddress: Address | undefined;
    if (input.stake) {
      const initialized = await this.onchain.ensureStake({
        owner: input.authority,
        identity: input.identityAddress,
        slashAuthority: input.stake.slashAuthority,
        trustMode: input.stake.trustMode,
      });
      stakeAddress = initialized.address;
      operations.push(initialized);

      if (input.stake.depositLamports !== undefined) {
        const staked = await this.onchain.stake({
          owner: input.authority,
          identity: input.identityAddress,
          amount: input.stake.depositLamports,
        });
        operations.push(staked);
      }
    }

    const committedReceipt = await this.onchain.emitReceipt({
      authority: input.authority,
      identity: input.identityAddress,
      task: input.taskAddress,
      domainCatalog: input.domainCatalogAddress,
      receipt,
    });
    operations.push(committedReceipt);

    if (input.syncTaskStatus ?? true) {
      operations.push(
        await this.onchain.syncTaskStatus({
          authority: input.authority,
          identity: input.identityAddress,
          task: input.taskAddress,
          receipt: committedReceipt.address,
        })
      );
    }

    const indexedReceipt: ReceiptIndexRecord = {
      receiptId: receipt.receiptId,
      slot: committedReceipt.slot,
      taskId: receipt.taskId,
      actorId: receipt.actorId,
      kind: receipt.kind,
      domain: receipt.domain,
      payload: { ...receipt.payload },
    };
    this.indexer.ingest([indexedReceipt]);

    return {
      execution: {
        record: execution.record,
        ...("runtimeAuthority" in execution
          ? {
              runtimeAuthority: execution.runtimeAuthority,
              verification: execution.verification,
            }
          : {}),
      },
      receipt,
      indexedReceipt,
      onchain: {
        receiptAddress: committedReceipt.address,
        ...(stakeAddress ? { stakeAddress } : {}),
        operations,
      },
    };
  }

  private buildStakeEvents(input: PiBridgeCommitInput) {
    if (!input.stake) {
      return [];
    }

    const events = [
      createStakeEvent({
        kind: "initialized",
        identityId: input.identity.identityId,
        ownerId: input.stake.ownerId ?? input.authority.address,
        slashAuthorityId:
          input.stake.slashAuthorityId ?? input.stake.slashAuthority,
      }),
    ];

    if (input.stake.depositLamports !== undefined) {
      events.push(
        createStakeEvent({
          kind: "deposited",
          identityId: input.identity.identityId,
          amountLamports: input.stake.depositLamports,
        })
      );
    }

    return events;
  }
}
