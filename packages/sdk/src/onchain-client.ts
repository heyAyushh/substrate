import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

import {
  appendTransactionMessageInstructions,
  address,
  createSolanaRpc,
  createSolanaRpcSubscriptions,
  createTransactionMessage,
  getBase64EncodedWireTransaction,
  getSignatureFromTransaction,
  getTransactionEncoder,
  sendTransactionWithoutConfirmingFactory,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
  TRANSACTION_SIZE_LIMIT,
  type Address,
  type GetAccountInfoApi,
  type GetEpochInfoApi,
  type GetLatestBlockhashApi,
  type GetMultipleAccountsApi,
  type GetSignatureStatusesApi,
  type GetSlotApi,
  type Instruction,
  type ProgramDerivedAddress,
  type Rpc,
  type RpcSubscriptions,
  type ReadonlyUint8Array,
  type SendTransactionApi,
  type SignatureNotificationsApi,
  type SlotNotificationsApi,
  type TransactionSigner,
} from "@solana/kit";

import {
  RECEIPT_KIND_CODES,
  type IdentityRecord,
  type ReceiptRecord,
  type TaskRecord,
} from "./client.js";
import {
  bytes32Equals,
  deriveAgentIdBytes,
  deriveAuditReceiptIdBytes,
  deriveDomainBytes,
  deriveHistoryRootBytes,
  derivePayloadHashBytes,
  derivePolicyRootBytes,
  derivePreviousReceiptBytes,
  deriveReceiptIdBytes,
  deriveSubtaskRootBytes,
  deriveTaskIdBytes,
  zeroBytes32,
} from "./onchain-identifiers.js";

const CHALLENGE_RECEIPT_KIND_CODE = RECEIPT_KIND_CODES.challenge;
const DISPUTE_RECEIPT_KIND_CODE = RECEIPT_KIND_CODES.dispute;

export type TrustSubstrateRpc = Rpc<
  GetAccountInfoApi &
    GetMultipleAccountsApi &
    GetLatestBlockhashApi &
    GetSlotApi &
    GetEpochInfoApi &
    GetSignatureStatusesApi &
    SendTransactionApi
>;

export type TrustSubstrateRpcSubscriptions = RpcSubscriptions<
  SignatureNotificationsApi & SlotNotificationsApi
>;

export interface OnchainTransactionCommit {
  readonly slot: number;
  readonly signature?: string;
}

export interface OnchainTransactionDispatcher {
  readonly rpc?: TrustSubstrateRpc;
  send(
    instructions: ReadonlyArray<Instruction>,
    feePayer: TransactionSigner,
  ): Promise<OnchainTransactionCommit>;
}

export interface TrustSubstrateDispatcherConfig {
  readonly rpcUrl: string;
  readonly rpcSubscriptionsUrl: string;
  readonly commitment?: "processed" | "confirmed" | "finalized";
}

export interface OnchainIdentityBinding {
  readonly address: Address;
  readonly agentId: Uint8Array;
}

export interface OnchainTaskBinding {
  readonly address: Address;
  readonly taskId: Uint8Array;
  readonly subtaskRoot: Uint8Array;
  readonly domain: Uint8Array;
}

export interface OnchainSocietyWorldBinding {
  readonly address: Address;
}

export interface OnchainSocietyWorldRecord {
  readonly identity: Address;
  readonly task: Address;
  readonly currentTick: number;
  readonly lastSequence: bigint;
  readonly lastReceipt: Address;
  readonly stateHash: ReadonlyUint8Array;
  readonly status: number;
  readonly state: ReadonlyUint8Array;
  readonly bump: number;
}

export interface OnchainReceiptBinding {
  readonly address: Address;
  readonly receiptId: Uint8Array;
  readonly previousReceipt: Uint8Array;
  readonly payloadHash: Uint8Array;
  readonly domain: Uint8Array;
}

export interface OnchainAuditReceiptBinding {
  readonly address: Address;
  readonly receiptId: Uint8Array;
}

export interface OnchainChallengeResponseBinding {
  readonly address: Address;
}

export interface OnchainStakeBinding {
  readonly address: Address;
}

export interface OnchainIdentityBondBinding {
  readonly address: Address;
}

export interface OnchainAttesterBinding {
  readonly address: Address;
  readonly config: Address;
  readonly identityBond: Address;
}

export interface OnchainDelegationBinding {
  readonly address: Address;
  readonly delegate: Address;
}

export interface OnchainHistoryCheckpointBinding {
  readonly address: Address;
  readonly latestCheckpoint: Address;
  readonly epoch: bigint;
}

export interface OnchainAdjudicatorBinding {
  readonly address: Address;
  readonly adjudicator: Address;
  readonly treasuryVault: Address;
}

export interface OnchainVerdictBinding {
  readonly address: Address;
}

export interface OnchainReputationBinding {
  readonly address: Address;
  readonly domain: Uint8Array;
}

export interface OnchainOperationResult extends OnchainTransactionCommit {
  readonly kind: string;
  readonly address?: Address;
  readonly created?: boolean;
}

const DEFAULT_COMMITMENT = "confirmed" as const;
const DEFAULT_WEIGHT = 0n;
const SEND_TRANSACTION_MAX_RETRIES = 3n;
const TRANSACTION_STATUS_POLL_ATTEMPTS = 80;
const TRANSACTION_STATUS_POLL_DELAY_MS = 250;
const EXPLORER_MEMO_MAX_BYTES = 320;
const EXPLORER_MEMO_PREFIX = "Trust Substrate";
const EXPLORER_MEMO_TRUNCATION_SUFFIX = "...";
const MEMO_PROGRAM_ADDRESS = address(
  "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr",
);
const TRANSACTION_TOO_LARGE_MESSAGE = "Transaction too large before send";
const TRANSACTION_COMMITMENT_RANK = {
  processed: 0,
  confirmed: 1,
  finalized: 2,
} as const;

type TransactionCommitment = keyof typeof TRANSACTION_COMMITMENT_RANK;
type TransactionSignature = ReturnType<typeof getSignatureFromTransaction>;

const textEncoder = new TextEncoder();

const wait = (milliseconds: number): Promise<void> =>
  new Promise((resolveWait) => {
    setTimeout(resolveWait, milliseconds);
  });

const hasReachedCommitment = (
  confirmationStatus: TransactionCommitment | null,
  desiredCommitment: TransactionCommitment,
): boolean => {
  if (confirmationStatus === null) return desiredCommitment === "processed";
  return (
    TRANSACTION_COMMITMENT_RANK[confirmationStatus] >=
    TRANSACTION_COMMITMENT_RANK[desiredCommitment]
  );
};

const encodeExplorerMemo = (memo: string): Uint8Array => {
  const encoded = textEncoder.encode(memo);
  if (encoded.length <= EXPLORER_MEMO_MAX_BYTES) return encoded;

  const truncated = memo.slice(
    0,
    EXPLORER_MEMO_MAX_BYTES - EXPLORER_MEMO_TRUNCATION_SUFFIX.length,
  );
  return textEncoder.encode(`${truncated}${EXPLORER_MEMO_TRUNCATION_SUFFIX}`);
};

const createExplorerMemoInstruction = (memo: string): Instruction => ({
  programAddress: MEMO_PROGRAM_ADDRESS,
  data: encodeExplorerMemo(memo),
});

const buildExplorerMemo = ({
  kind,
  address,
  details = [],
}: {
  readonly kind: string;
  readonly address?: Address;
  readonly details?: ReadonlyArray<string>;
}): string =>
  [EXPLORER_MEMO_PREFIX, kind, address ? `account ${address}` : undefined]
    .concat(details)
    .filter((part): part is string => Boolean(part))
    .join(" | ");

const receiptExplorerMemoDetails = (
  receipt: ReceiptRecord,
): ReadonlyArray<string> => {
  const action = receipt.payload.action;
  return [
    `receipt ${receipt.receiptId}`,
    `kind ${receipt.kind}`,
    `actor ${receipt.actorId}`,
    typeof action === "string" ? `action ${action}` : undefined,
    `sequence ${receipt.sequence}`,
  ].filter((detail): detail is string => Boolean(detail));
};

const isTransactionTooLargeError = (error: unknown): boolean =>
  error instanceof Error &&
  error.message.includes(TRANSACTION_TOO_LARGE_MESSAGE);

type IdentityPdaModule =
  typeof import("../../program-clients/dist/generated/identity_registry/pdas/identity.js");
type CreateIdentityInstructionModule =
  typeof import("../../program-clients/dist/generated/identity_registry/instructions/createIdentity.js");
type IdentityBondPdaModule =
  typeof import("../../program-clients/dist/generated/identity_registry/pdas/identityBond.js");
type IdentityBondAccountModule =
  typeof import("../../program-clients/dist/generated/identity_registry/accounts/identityBond.js");
type DepositIdentityBondInstructionModule =
  typeof import("../../program-clients/dist/generated/identity_registry/instructions/depositIdentityBond.js");
type AgentIdentityAccountModule =
  typeof import("../../program-clients/dist/generated/identity_registry/accounts/agentIdentity.js");
type TaskPdaModule =
  typeof import("../../program-clients/dist/generated/task_registry/pdas/task.js");
type SocietyWorldPdaModule =
  typeof import("../../program-clients/dist/generated/task_registry/pdas/societyWorld.js");
type CreateTaskInstructionModule =
  typeof import("../../program-clients/dist/generated/task_registry/instructions/createTask.js");
type CreateSocietyWorldInstructionModule =
  typeof import("../../program-clients/dist/generated/task_registry/instructions/createSocietyWorld.js");
type TaskRecordAccountModule =
  typeof import("../../program-clients/dist/generated/task_registry/accounts/taskRecord.js");
type SocietyWorldAccountModule =
  typeof import("../../program-clients/dist/generated/task_registry/accounts/societyWorld.js");
type SyncTaskStatusInstructionModule =
  typeof import("../../program-clients/dist/generated/task_registry/instructions/syncTaskStatus.js");
type UpdateSocietyWorldInstructionModule =
  typeof import("../../program-clients/dist/generated/task_registry/instructions/updateSocietyWorld.js");
type ReceiptPdaModule =
  typeof import("../../program-clients/dist/generated/receipt_emitter/pdas/receipt.js");
type AuditReceiptPdaModule =
  typeof import("../../program-clients/dist/generated/receipt_emitter/pdas/auditReceipt.js");
type ChallengeResponsePdaModule =
  typeof import("../../program-clients/dist/generated/receipt_emitter/pdas/challengeResponse.js");
type CpiAuthorityPdaModule =
  typeof import("../../program-clients/dist/generated/receipt_emitter/pdas/cpiAuthority.js");
type EmitReceiptInstructionModule =
  typeof import("../../program-clients/dist/generated/receipt_emitter/instructions/emitReceipt.js");
type EmitAuditReceiptInstructionModule =
  typeof import("../../program-clients/dist/generated/receipt_emitter/instructions/emitAuditReceipt.js");
type EmitChallengeResponseInstructionModule =
  typeof import("../../program-clients/dist/generated/receipt_emitter/instructions/emitChallengeResponse.js");
type FinalizeUnansweredChallengeInstructionModule =
  typeof import("../../program-clients/dist/generated/receipt_emitter/instructions/finalizeUnansweredChallenge.js");
type InitializeCpiAuthorityInstructionModule =
  typeof import("../../program-clients/dist/generated/receipt_emitter/instructions/initializeCpiAuthority.js");
type CpiAuthorityAccountModule =
  typeof import("../../program-clients/dist/generated/receipt_emitter/accounts/cpiAuthority.js");
type DomainCatalogPdaModule =
  typeof import("../../program-clients/dist/generated/reputation_accumulator/pdas/domainCatalog.js");
type ReputationPdaModule =
  typeof import("../../program-clients/dist/generated/reputation_accumulator/pdas/reputation.js");
type ReputationDomainCatalogAccountModule =
  typeof import("../../program-clients/dist/generated/reputation_accumulator/accounts/reputationDomainCatalog.js");
type ReputationAccumulatorAccountModule =
  typeof import("../../program-clients/dist/generated/reputation_accumulator/accounts/reputationAccumulator.js");
type InitializeDomainCatalogInstructionModule =
  typeof import("../../program-clients/dist/generated/reputation_accumulator/instructions/initializeDomainCatalog.js");
type RegisterDomainInstructionModule =
  typeof import("../../program-clients/dist/generated/reputation_accumulator/instructions/registerDomain.js");
type CreateReputationDomainInstructionModule =
  typeof import("../../program-clients/dist/generated/reputation_accumulator/instructions/createReputationDomain.js");
type ApplyReputationReceiptInstructionModule =
  typeof import("../../program-clients/dist/generated/reputation_accumulator/instructions/applyReputationReceipt.js");
type AttesterConfigPdaModule =
  typeof import("../../program-clients/dist/generated/attester_registry/pdas/config.js");
type AttesterPdaModule =
  typeof import("../../program-clients/dist/generated/attester_registry/pdas/attester.js");
type AttesterRegistryConfigAccountModule =
  typeof import("../../program-clients/dist/generated/attester_registry/accounts/attesterRegistryConfig.js");
type AttesterRecordAccountModule =
  typeof import("../../program-clients/dist/generated/attester_registry/accounts/attesterRecord.js");
type InitializeAttesterRegistryInstructionModule =
  typeof import("../../program-clients/dist/generated/attester_registry/instructions/initializeRegistry.js");
type RegisterAttesterInstructionModule =
  typeof import("../../program-clients/dist/generated/attester_registry/instructions/registerAttester.js");
type DelegationPdaModule =
  typeof import("../../program-clients/dist/generated/delegation_engine/pdas/delegation.js");
type DelegationRecordAccountModule =
  typeof import("../../program-clients/dist/generated/delegation_engine/accounts/delegationRecord.js");
type CreateDelegationInstructionModule =
  typeof import("../../program-clients/dist/generated/delegation_engine/instructions/createDelegation.js");
type HistoryUpdaterPdaModule =
  typeof import("../../program-clients/dist/generated/proof_verifier/pdas/historyUpdater.js");
type CheckpointPdaModule =
  typeof import("../../program-clients/dist/generated/proof_verifier/pdas/checkpoint.js");
type LatestCheckpointPdaModule =
  typeof import("../../program-clients/dist/generated/proof_verifier/pdas/latestCheckpoint.js");
type HistoryUpdaterAccountModule =
  typeof import("../../program-clients/dist/generated/proof_verifier/accounts/historyUpdater.js");
type HistoryCheckpointAccountModule =
  typeof import("../../program-clients/dist/generated/proof_verifier/accounts/historyCheckpoint.js");
type InitializeHistoryUpdaterInstructionModule =
  typeof import("../../program-clients/dist/generated/proof_verifier/instructions/initializeHistoryUpdater.js");
type InitializeCheckpointInstructionModule =
  typeof import("../../program-clients/dist/generated/proof_verifier/instructions/initializeCheckpoint.js");
type AppendReceiptToCheckpointInstructionModule =
  typeof import("../../program-clients/dist/generated/proof_verifier/instructions/appendReceiptToCheckpoint.js");
type StakePdaModule =
  typeof import("../../program-clients/dist/generated/agent_stake/pdas/stake.js");
type StakeAccountModule =
  typeof import("../../program-clients/dist/generated/agent_stake/accounts/stakeAccount.js");
type InitializeStakeInstructionModule =
  typeof import("../../program-clients/dist/generated/agent_stake/instructions/initializeStake.js");
type StakeInstructionModule =
  typeof import("../../program-clients/dist/generated/agent_stake/instructions/stake.js");
type AdjudicatorConfigPdaModule =
  typeof import("../../program-clients/dist/generated/dispute_resolver/pdas/adjudicatorConfig.js");
type TreasuryVaultPdaModule =
  typeof import("../../program-clients/dist/generated/dispute_resolver/pdas/treasuryVault.js");
type VerdictPdaModule =
  typeof import("../../program-clients/dist/generated/dispute_resolver/pdas/verdict.js");
type AdjudicatorConfigAccountModule =
  typeof import("../../program-clients/dist/generated/dispute_resolver/accounts/adjudicatorConfig.js");
type DisputeVerdictAccountModule =
  typeof import("../../program-clients/dist/generated/dispute_resolver/accounts/disputeVerdict.js");
type RegisterAdjudicatorInstructionModule =
  typeof import("../../program-clients/dist/generated/dispute_resolver/instructions/registerAdjudicator.js");
type RecordVerdictInstructionModule =
  typeof import("../../program-clients/dist/generated/dispute_resolver/instructions/recordVerdict.js");

const addressFromPda = (pda: ProgramDerivedAddress): Address => pda[0];
const require = createRequire(import.meta.url);
const programClientsDistUrl = new URL(
  "./",
  pathToFileURL(require.resolve("@trust-substrate/program-clients")),
);

const lazyModule = <T>(relativePath: string) => {
  let promise: Promise<T> | undefined;
  return async (): Promise<T> => {
    if (!promise) {
      promise = import(
        new URL(relativePath, programClientsDistUrl).href
      ) as Promise<T>;
    }
    return promise;
  };
};

const loadIdentityPdaModule = lazyModule<IdentityPdaModule>(
  "./generated/identity_registry/pdas/identity.js",
);
const loadCreateIdentityInstructionModule =
  lazyModule<CreateIdentityInstructionModule>(
    "./generated/identity_registry/instructions/createIdentity.js",
  );
const loadIdentityBondPdaModule = lazyModule<IdentityBondPdaModule>(
  "./generated/identity_registry/pdas/identityBond.js",
);
const loadIdentityBondAccountModule = lazyModule<IdentityBondAccountModule>(
  "./generated/identity_registry/accounts/identityBond.js",
);
const loadDepositIdentityBondInstructionModule =
  lazyModule<DepositIdentityBondInstructionModule>(
    "./generated/identity_registry/instructions/depositIdentityBond.js",
  );
const loadAgentIdentityAccountModule = lazyModule<AgentIdentityAccountModule>(
  "./generated/identity_registry/accounts/agentIdentity.js",
);
const loadTaskPdaModule = lazyModule<TaskPdaModule>(
  "./generated/task_registry/pdas/task.js",
);
const loadSocietyWorldPdaModule = lazyModule<SocietyWorldPdaModule>(
  "./generated/task_registry/pdas/societyWorld.js",
);
const loadCreateTaskInstructionModule = lazyModule<CreateTaskInstructionModule>(
  "./generated/task_registry/instructions/createTask.js",
);
const loadCreateSocietyWorldInstructionModule =
  lazyModule<CreateSocietyWorldInstructionModule>(
    "./generated/task_registry/instructions/createSocietyWorld.js",
  );
const loadTaskRecordAccountModule = lazyModule<TaskRecordAccountModule>(
  "./generated/task_registry/accounts/taskRecord.js",
);
const loadSocietyWorldAccountModule = lazyModule<SocietyWorldAccountModule>(
  "./generated/task_registry/accounts/societyWorld.js",
);
const loadSyncTaskStatusInstructionModule =
  lazyModule<SyncTaskStatusInstructionModule>(
    "./generated/task_registry/instructions/syncTaskStatus.js",
  );
const loadUpdateSocietyWorldInstructionModule =
  lazyModule<UpdateSocietyWorldInstructionModule>(
    "./generated/task_registry/instructions/updateSocietyWorld.js",
  );
const loadReceiptPdaModule = lazyModule<ReceiptPdaModule>(
  "./generated/receipt_emitter/pdas/receipt.js",
);
const loadAuditReceiptPdaModule = lazyModule<AuditReceiptPdaModule>(
  "./generated/receipt_emitter/pdas/auditReceipt.js",
);
const loadChallengeResponsePdaModule = lazyModule<ChallengeResponsePdaModule>(
  "./generated/receipt_emitter/pdas/challengeResponse.js",
);
const loadCpiAuthorityPdaModule = lazyModule<CpiAuthorityPdaModule>(
  "./generated/receipt_emitter/pdas/cpiAuthority.js",
);
const loadEmitReceiptInstructionModule =
  lazyModule<EmitReceiptInstructionModule>(
    "./generated/receipt_emitter/instructions/emitReceipt.js",
  );
const loadEmitAuditReceiptInstructionModule =
  lazyModule<EmitAuditReceiptInstructionModule>(
    "./generated/receipt_emitter/instructions/emitAuditReceipt.js",
  );
const loadEmitChallengeResponseInstructionModule =
  lazyModule<EmitChallengeResponseInstructionModule>(
    "./generated/receipt_emitter/instructions/emitChallengeResponse.js",
  );
const loadFinalizeUnansweredChallengeInstructionModule =
  lazyModule<FinalizeUnansweredChallengeInstructionModule>(
    "./generated/receipt_emitter/instructions/finalizeUnansweredChallenge.js",
  );
const loadInitializeCpiAuthorityInstructionModule =
  lazyModule<InitializeCpiAuthorityInstructionModule>(
    "./generated/receipt_emitter/instructions/initializeCpiAuthority.js",
  );
const loadCpiAuthorityAccountModule = lazyModule<CpiAuthorityAccountModule>(
  "./generated/receipt_emitter/accounts/cpiAuthority.js",
);
const loadDomainCatalogPdaModule = lazyModule<DomainCatalogPdaModule>(
  "./generated/reputation_accumulator/pdas/domainCatalog.js",
);
const loadReputationPdaModule = lazyModule<ReputationPdaModule>(
  "./generated/reputation_accumulator/pdas/reputation.js",
);
const loadReputationDomainCatalogAccountModule =
  lazyModule<ReputationDomainCatalogAccountModule>(
    "./generated/reputation_accumulator/accounts/reputationDomainCatalog.js",
  );
const loadReputationAccumulatorAccountModule =
  lazyModule<ReputationAccumulatorAccountModule>(
    "./generated/reputation_accumulator/accounts/reputationAccumulator.js",
  );
const loadInitializeDomainCatalogInstructionModule =
  lazyModule<InitializeDomainCatalogInstructionModule>(
    "./generated/reputation_accumulator/instructions/initializeDomainCatalog.js",
  );
const loadRegisterDomainInstructionModule =
  lazyModule<RegisterDomainInstructionModule>(
    "./generated/reputation_accumulator/instructions/registerDomain.js",
  );
const loadCreateReputationDomainInstructionModule =
  lazyModule<CreateReputationDomainInstructionModule>(
    "./generated/reputation_accumulator/instructions/createReputationDomain.js",
  );
const loadApplyReputationReceiptInstructionModule =
  lazyModule<ApplyReputationReceiptInstructionModule>(
    "./generated/reputation_accumulator/instructions/applyReputationReceipt.js",
  );
const loadAttesterConfigPdaModule = lazyModule<AttesterConfigPdaModule>(
  "./generated/attester_registry/pdas/config.js",
);
const loadAttesterPdaModule = lazyModule<AttesterPdaModule>(
  "./generated/attester_registry/pdas/attester.js",
);
const loadAttesterRegistryConfigAccountModule =
  lazyModule<AttesterRegistryConfigAccountModule>(
    "./generated/attester_registry/accounts/attesterRegistryConfig.js",
  );
const loadAttesterRecordAccountModule = lazyModule<AttesterRecordAccountModule>(
  "./generated/attester_registry/accounts/attesterRecord.js",
);
const loadInitializeAttesterRegistryInstructionModule =
  lazyModule<InitializeAttesterRegistryInstructionModule>(
    "./generated/attester_registry/instructions/initializeRegistry.js",
  );
const loadRegisterAttesterInstructionModule =
  lazyModule<RegisterAttesterInstructionModule>(
    "./generated/attester_registry/instructions/registerAttester.js",
  );
const loadDelegationPdaModule = lazyModule<DelegationPdaModule>(
  "./generated/delegation_engine/pdas/delegation.js",
);
const loadDelegationRecordAccountModule =
  lazyModule<DelegationRecordAccountModule>(
    "./generated/delegation_engine/accounts/delegationRecord.js",
  );
const loadCreateDelegationInstructionModule =
  lazyModule<CreateDelegationInstructionModule>(
    "./generated/delegation_engine/instructions/createDelegation.js",
  );
const loadHistoryUpdaterPdaModule = lazyModule<HistoryUpdaterPdaModule>(
  "./generated/proof_verifier/pdas/historyUpdater.js",
);
const loadCheckpointPdaModule = lazyModule<CheckpointPdaModule>(
  "./generated/proof_verifier/pdas/checkpoint.js",
);
const loadLatestCheckpointPdaModule = lazyModule<LatestCheckpointPdaModule>(
  "./generated/proof_verifier/pdas/latestCheckpoint.js",
);
const loadHistoryUpdaterAccountModule = lazyModule<HistoryUpdaterAccountModule>(
  "./generated/proof_verifier/accounts/historyUpdater.js",
);
const loadHistoryCheckpointAccountModule =
  lazyModule<HistoryCheckpointAccountModule>(
    "./generated/proof_verifier/accounts/historyCheckpoint.js",
  );
const loadInitializeHistoryUpdaterInstructionModule =
  lazyModule<InitializeHistoryUpdaterInstructionModule>(
    "./generated/proof_verifier/instructions/initializeHistoryUpdater.js",
  );
const loadInitializeCheckpointInstructionModule =
  lazyModule<InitializeCheckpointInstructionModule>(
    "./generated/proof_verifier/instructions/initializeCheckpoint.js",
  );
const loadAppendReceiptToCheckpointInstructionModule =
  lazyModule<AppendReceiptToCheckpointInstructionModule>(
    "./generated/proof_verifier/instructions/appendReceiptToCheckpoint.js",
  );
const loadStakePdaModule = lazyModule<StakePdaModule>(
  "./generated/agent_stake/pdas/stake.js",
);
const loadStakeAccountModule = lazyModule<StakeAccountModule>(
  "./generated/agent_stake/accounts/stakeAccount.js",
);
const loadInitializeStakeInstructionModule =
  lazyModule<InitializeStakeInstructionModule>(
    "./generated/agent_stake/instructions/initializeStake.js",
  );
const loadStakeInstructionModule = lazyModule<StakeInstructionModule>(
  "./generated/agent_stake/instructions/stake.js",
);
const loadAdjudicatorConfigPdaModule = lazyModule<AdjudicatorConfigPdaModule>(
  "./generated/dispute_resolver/pdas/adjudicatorConfig.js",
);
const loadTreasuryVaultPdaModule = lazyModule<TreasuryVaultPdaModule>(
  "./generated/dispute_resolver/pdas/treasuryVault.js",
);
const loadVerdictPdaModule = lazyModule<VerdictPdaModule>(
  "./generated/dispute_resolver/pdas/verdict.js",
);
const loadAdjudicatorConfigAccountModule =
  lazyModule<AdjudicatorConfigAccountModule>(
    "./generated/dispute_resolver/accounts/adjudicatorConfig.js",
  );
const loadDisputeVerdictAccountModule = lazyModule<DisputeVerdictAccountModule>(
  "./generated/dispute_resolver/accounts/disputeVerdict.js",
);
const loadRegisterAdjudicatorInstructionModule =
  lazyModule<RegisterAdjudicatorInstructionModule>(
    "./generated/dispute_resolver/instructions/registerAdjudicator.js",
  );
const loadRecordVerdictInstructionModule =
  lazyModule<RecordVerdictInstructionModule>(
    "./generated/dispute_resolver/instructions/recordVerdict.js",
  );

export class KitTransactionDispatcher implements OnchainTransactionDispatcher {
  readonly rpc: TrustSubstrateRpc;
  private readonly commitment: "processed" | "confirmed" | "finalized";

  constructor(
    rpc: TrustSubstrateRpc,
    _rpcSubscriptions: TrustSubstrateRpcSubscriptions,
    commitment: "processed" | "confirmed" | "finalized" = DEFAULT_COMMITMENT,
  ) {
    this.rpc = rpc;
    this.commitment = commitment;
  }

  private async waitForSignatureStatus(
    signature: TransactionSignature,
  ): Promise<void> {
    for (
      let attempt = 0;
      attempt < TRANSACTION_STATUS_POLL_ATTEMPTS;
      attempt += 1
    ) {
      const { value: statuses } = await this.rpc
        .getSignatureStatuses([signature])
        .send();
      const status = statuses[0];
      if (status?.err) {
        throw new Error(
          `Transaction ${signature} failed: ${JSON.stringify(status.err)}`,
        );
      }
      if (
        status &&
        hasReachedCommitment(
          status.confirmationStatus as TransactionCommitment | null,
          this.commitment,
        )
      ) {
        return;
      }
      await wait(TRANSACTION_STATUS_POLL_DELAY_MS);
    }
    throw new Error(
      `Transaction ${signature} was sent but not observed at ${this.commitment} commitment`,
    );
  }

  async send(
    instructions: ReadonlyArray<Instruction>,
    feePayer: TransactionSigner,
  ): Promise<OnchainTransactionCommit> {
    const { value: latestBlockhash } = await this.rpc
      .getLatestBlockhash({ commitment: this.commitment })
      .send();

    const transactionMessage = createTransactionMessage({ version: "legacy" });
    const messageWithFeePayer = setTransactionMessageFeePayerSigner(
      feePayer,
      transactionMessage,
    );
    const messageWithInstructions = appendTransactionMessageInstructions(
      [...instructions],
      messageWithFeePayer,
    );
    const messageWithLifetime = setTransactionMessageLifetimeUsingBlockhash(
      latestBlockhash,
      messageWithInstructions,
    );

    const signedTransaction =
      await signTransactionMessageWithSigners(messageWithLifetime);
    const rawTransactionBytes =
      getTransactionEncoder().encode(signedTransaction);
    if (rawTransactionBytes.length > TRANSACTION_SIZE_LIMIT) {
      const base64EncodedTransaction =
        getBase64EncodedWireTransaction(signedTransaction);
      throw new Error(
        `Transaction too large before send: ${rawTransactionBytes.length} raw bytes (${base64EncodedTransaction.length} base64), max ${TRANSACTION_SIZE_LIMIT} raw bytes`,
      );
    }
    const signature = getSignatureFromTransaction(signedTransaction);
    const sendTransaction = sendTransactionWithoutConfirmingFactory({
      rpc: this.rpc,
    });

    await sendTransaction(
      signedTransaction as Parameters<typeof sendTransaction>[0],
      {
        commitment: this.commitment,
        maxRetries: SEND_TRANSACTION_MAX_RETRIES,
      },
    );
    await this.waitForSignatureStatus(signature);

    const slot = await this.rpc.getSlot({ commitment: this.commitment }).send();
    return {
      slot: Number(slot),
      signature,
    };
  }
}

export const createKitTransactionDispatcher = ({
  rpcUrl,
  rpcSubscriptionsUrl,
  commitment = DEFAULT_COMMITMENT,
}: TrustSubstrateDispatcherConfig): KitTransactionDispatcher =>
  new KitTransactionDispatcher(
    createSolanaRpc(rpcUrl) as TrustSubstrateRpc,
    createSolanaRpcSubscriptions(
      rpcSubscriptionsUrl,
    ) as TrustSubstrateRpcSubscriptions,
    commitment,
  );

export class TrustSubstrateOnchainClient {
  constructor(private readonly dispatcher: OnchainTransactionDispatcher) {}

  async getCurrentSlot(): Promise<number> {
    const rpc = this.dispatcher.rpc;
    if (!rpc) {
      throw new Error("Current slot is unavailable without an RPC client");
    }
    const slot = await rpc.getSlot({ commitment: DEFAULT_COMMITMENT }).send();
    return Number(slot);
  }

  async getDomainCatalogAddress(): Promise<Address> {
    const { findDomainCatalogPda } = await loadDomainCatalogPdaModule();
    return addressFromPda(await findDomainCatalogPda());
  }

  async bindIdentity(input: {
    readonly authority: TransactionSigner;
    readonly identity: IdentityRecord;
  }): Promise<OnchainIdentityBinding> {
    const { findIdentityPda } = await loadIdentityPdaModule();
    const agentId = deriveAgentIdBytes(input.identity);
    const address = addressFromPda(
      await findIdentityPda({
        authority: input.authority.address,
        agentId,
      }),
    );
    return { address, agentId };
  }

  async bindIdentityBond(input: {
    readonly identity: Address;
  }): Promise<OnchainIdentityBondBinding> {
    const { findIdentityBondPda } = await loadIdentityBondPdaModule();
    const address = addressFromPda(
      await findIdentityBondPda({
        identity: input.identity,
      }),
    );
    return { address };
  }

  async bindTask(input: {
    readonly identity: Address;
    readonly task: TaskRecord;
  }): Promise<OnchainTaskBinding> {
    const { findTaskPda } = await loadTaskPdaModule();
    const taskId = deriveTaskIdBytes(input.task);
    const subtaskRoot = deriveSubtaskRootBytes(input.task);
    const domain = deriveDomainBytes(input.task);
    const address = addressFromPda(
      await findTaskPda({
        identity: input.identity,
        taskId,
      }),
    );
    return {
      address,
      taskId,
      subtaskRoot,
      domain,
    };
  }

  async bindSocietyWorld(input: {
    readonly task: Address;
  }): Promise<OnchainSocietyWorldBinding> {
    const { findSocietyWorldPda } = await loadSocietyWorldPdaModule();
    return {
      address: addressFromPda(
        await findSocietyWorldPda({
          task: input.task,
        }),
      ),
    };
  }

  async bindReceipt(input: {
    readonly identity: Address;
    readonly task: Address;
    readonly receipt: ReceiptRecord;
  }): Promise<OnchainReceiptBinding> {
    const { findReceiptPda } = await loadReceiptPdaModule();
    const receiptId = deriveReceiptIdBytes(input.receipt);
    const previousReceipt = derivePreviousReceiptBytes(input.receipt);
    const payloadHash = derivePayloadHashBytes(
      payloadHashFromReceipt(input.receipt),
    );
    const domain = deriveDomainBytes(input.receipt.domain);
    const address = addressFromPda(
      await findReceiptPda({
        identity: input.identity,
        task: input.task,
        receiptId,
      }),
    );

    return {
      address,
      receiptId,
      previousReceipt,
      payloadHash,
      domain,
    };
  }

  async bindAuditReceipt(input: {
    readonly auditorIdentity: Address;
    readonly targetReceipt: Address;
    readonly kind: ReceiptRecord["kind"];
    readonly round: number;
  }): Promise<OnchainAuditReceiptBinding> {
    const { findAuditReceiptPda } = await loadAuditReceiptPdaModule();
    const kind = RECEIPT_KIND_CODES[input.kind];
    const receiptId = deriveAuditReceiptIdBytes({
      auditorIdentity: input.auditorIdentity,
      targetReceipt: input.targetReceipt,
      kind,
      round: input.round,
    });
    const address = addressFromPda(
      await findAuditReceiptPda({
        auditorIdentity: input.auditorIdentity,
        targetReceipt: input.targetReceipt,
        kind,
        round: input.round,
      }),
    );
    return { address, receiptId };
  }

  async bindChallengeResponse(input: {
    readonly challenge: Address;
  }): Promise<OnchainChallengeResponseBinding> {
    const { findChallengeResponsePda } = await loadChallengeResponsePdaModule();
    return {
      address: addressFromPda(
        await findChallengeResponsePda({
          challenge: input.challenge,
        }),
      ),
    };
  }

  async bindCpiAuthority(): Promise<Address> {
    const { findCpiAuthorityPda } = await loadCpiAuthorityPdaModule();
    return addressFromPda(await findCpiAuthorityPda());
  }

  async bindStake(input: {
    readonly identity: Address;
  }): Promise<OnchainStakeBinding> {
    const { findStakePda } = await loadStakePdaModule();
    const address = addressFromPda(
      await findStakePda({
        identity: input.identity,
      }),
    );
    return { address };
  }

  async bindAttester(input: {
    readonly identity: Address;
  }): Promise<OnchainAttesterBinding> {
    const { findConfigPda } = await loadAttesterConfigPdaModule();
    const { findAttesterPda } = await loadAttesterPdaModule();
    const identityBond = await this.bindIdentityBond(input);
    const config = addressFromPda(await findConfigPda());
    const address = addressFromPda(
      await findAttesterPda({
        identity: input.identity,
      }),
    );
    return { address, config, identityBond: identityBond.address };
  }

  async bindDelegation(input: {
    readonly identity: Address;
    readonly delegate: Address;
  }): Promise<OnchainDelegationBinding> {
    const { findDelegationPda } = await loadDelegationPdaModule();
    const address = addressFromPda(
      await findDelegationPda({
        identity: input.identity,
        delegate: input.delegate,
      }),
    );
    return { address, delegate: input.delegate };
  }

  async bindHistoryUpdater(): Promise<Address> {
    const { findHistoryUpdaterPda } = await loadHistoryUpdaterPdaModule();
    return addressFromPda(await findHistoryUpdaterPda());
  }

  async bindHistoryCheckpoint(input: {
    readonly identity: Address;
    readonly epoch: number | bigint;
  }): Promise<OnchainHistoryCheckpointBinding> {
    const { findCheckpointPda } = await loadCheckpointPdaModule();
    const { findLatestCheckpointPda } = await loadLatestCheckpointPdaModule();
    const epoch = BigInt(input.epoch);
    const address = addressFromPda(
      await findCheckpointPda({
        identity: input.identity,
        epoch,
      }),
    );
    const latestCheckpoint = addressFromPda(
      await findLatestCheckpointPda({
        identity: input.identity,
      }),
    );
    return { address, latestCheckpoint, epoch };
  }

  async bindAdjudicator(): Promise<OnchainAdjudicatorBinding> {
    const { findAdjudicatorConfigPda } = await loadAdjudicatorConfigPdaModule();
    const { findTreasuryVaultPda } = await loadTreasuryVaultPdaModule();
    return {
      address: addressFromPda(await findAdjudicatorConfigPda()),
      adjudicator: "11111111111111111111111111111111" as Address,
      treasuryVault: addressFromPda(await findTreasuryVaultPda()),
    };
  }

  async bindVerdict(input: {
    readonly disputeReceipt: Address;
  }): Promise<OnchainVerdictBinding> {
    const { findVerdictPda } = await loadVerdictPdaModule();
    const address = addressFromPda(
      await findVerdictPda({
        disputeReceipt: input.disputeReceipt,
      }),
    );
    return { address };
  }

  async bindReputation(input: {
    readonly identity: Address;
    readonly taskOrDomain: TaskRecord | string;
  }): Promise<OnchainReputationBinding> {
    const { findReputationPda } = await loadReputationPdaModule();
    const domain = deriveDomainBytes(input.taskOrDomain);
    const address = addressFromPda(
      await findReputationPda({
        identity: input.identity,
        domain,
      }),
    );
    return { address, domain };
  }

  async createIdentity(input: {
    readonly authority: TransactionSigner;
    readonly identity: IdentityRecord;
  }): Promise<OnchainIdentityBinding & OnchainOperationResult> {
    const { getCreateIdentityInstructionAsync } =
      await loadCreateIdentityInstructionModule();
    const binding = await this.bindIdentity(input);
    const commit = await this.sendOperation(
      "create_identity",
      getCreateIdentityInstructionAsync({
        authority: input.authority,
        identity: binding.address,
        agentId: binding.agentId,
        policyRoot: derivePolicyRootBytes(input.identity),
        historyRoot: deriveHistoryRootBytes(input.identity),
      }),
      input.authority,
      binding.address,
      [
        `identity ${input.identity.identityId}`,
        `label ${input.identity.label}`,
      ],
    );
    return { ...binding, ...commit };
  }

  async ensureIdentity(input: {
    readonly authority: TransactionSigner;
    readonly identity: IdentityRecord;
  }): Promise<OnchainIdentityBinding & OnchainOperationResult> {
    const binding = await this.bindIdentity(input);
    const rpc = this.dispatcher.rpc;
    if (rpc) {
      const { fetchMaybeAgentIdentity } =
        await loadAgentIdentityAccountModule();
      const existing = await fetchMaybeAgentIdentity(rpc, binding.address);
      if (existing.exists) {
        return {
          ...binding,
          kind: "create_identity",
          address: binding.address,
          created: false,
          slot: 0,
        };
      }
    }

    return {
      ...(await this.createIdentity(input)),
      created: true,
    };
  }

  async depositIdentityBond(input: {
    readonly authority: TransactionSigner;
    readonly identity: Address;
  }): Promise<OnchainIdentityBondBinding & OnchainOperationResult> {
    const { getDepositIdentityBondInstructionAsync } =
      await loadDepositIdentityBondInstructionModule();
    const binding = await this.bindIdentityBond(input);
    const commit = await this.sendOperation(
      "deposit_identity_bond",
      getDepositIdentityBondInstructionAsync({
        authority: input.authority,
        identity: input.identity,
        identityBond: binding.address,
      }),
      input.authority,
      binding.address,
      [`identity ${input.identity}`],
    );
    return { ...binding, ...commit };
  }

  async ensureIdentityBond(input: {
    readonly authority: TransactionSigner;
    readonly identity: Address;
  }): Promise<OnchainIdentityBondBinding & OnchainOperationResult> {
    const binding = await this.bindIdentityBond(input);
    const rpc = this.dispatcher.rpc;
    if (rpc) {
      const { fetchMaybeIdentityBond } = await loadIdentityBondAccountModule();
      const existing = await fetchMaybeIdentityBond(rpc, binding.address);
      if (existing.exists) {
        return {
          ...binding,
          kind: "deposit_identity_bond",
          address: binding.address,
          created: false,
          slot: 0,
        };
      }
    }

    return {
      ...(await this.depositIdentityBond(input)),
      created: true,
    };
  }

  async createTask(input: {
    readonly authority: TransactionSigner;
    readonly identity: Address;
    readonly task: TaskRecord;
  }): Promise<OnchainTaskBinding & OnchainOperationResult> {
    const { getCreateTaskInstructionAsync } =
      await loadCreateTaskInstructionModule();
    const binding = await this.bindTask(input);
    const commit = await this.sendOperation(
      "create_task",
      getCreateTaskInstructionAsync({
        authority: input.authority,
        identity: input.identity,
        task: binding.address,
        taskId: binding.taskId,
        subtaskRoot: binding.subtaskRoot,
        subtaskCount: input.task.subtasks.length,
        domain: binding.domain,
      }),
      input.authority,
      binding.address,
      [`task ${input.task.taskId}`, `title ${input.task.title}`],
    );
    return { ...binding, ...commit };
  }

  async ensureTask(input: {
    readonly authority: TransactionSigner;
    readonly identity: Address;
    readonly task: TaskRecord;
  }): Promise<OnchainTaskBinding & OnchainOperationResult> {
    const binding = await this.bindTask(input);
    const rpc = this.dispatcher.rpc;
    if (rpc) {
      const { fetchMaybeTaskRecord } = await loadTaskRecordAccountModule();
      const existing = await fetchMaybeTaskRecord(rpc, binding.address);
      if (existing.exists) {
        return {
          ...binding,
          kind: "create_task",
          address: binding.address,
          created: false,
          slot: 0,
        };
      }
    }

    return {
      ...(await this.createTask(input)),
      created: true,
    };
  }

  async createSocietyWorld(input: {
    readonly authority: TransactionSigner;
    readonly identity: Address;
    readonly task: Address;
    readonly currentTick: number;
    readonly lastSequence: number | bigint;
    readonly lastReceipt: Address;
    readonly status: number;
    readonly state: ReadonlyUint8Array;
  }): Promise<OnchainSocietyWorldBinding & OnchainOperationResult> {
    const { getCreateSocietyWorldInstructionAsync } =
      await loadCreateSocietyWorldInstructionModule();
    const binding = await this.bindSocietyWorld(input);
    const commit = await this.sendOperation(
      "create_society_world",
      getCreateSocietyWorldInstructionAsync({
        authority: input.authority,
        identity: input.identity,
        task: input.task,
        societyWorld: binding.address,
        currentTick: input.currentTick,
        lastSequence: input.lastSequence,
        lastReceipt: input.lastReceipt,
        status: input.status,
        state: input.state,
      }),
      input.authority,
      binding.address,
      [
        `tick ${input.currentTick}`,
        `sequence ${input.lastSequence.toString()}`,
        `status ${input.status}`,
      ],
    );
    return { ...binding, ...commit };
  }

  async updateSocietyWorld(input: {
    readonly authority: TransactionSigner;
    readonly identity: Address;
    readonly task: Address;
    readonly currentTick: number;
    readonly lastSequence: number | bigint;
    readonly lastReceipt: Address;
    readonly status: number;
    readonly state: ReadonlyUint8Array;
  }): Promise<OnchainSocietyWorldBinding & OnchainOperationResult> {
    const { getUpdateSocietyWorldInstructionAsync } =
      await loadUpdateSocietyWorldInstructionModule();
    const binding = await this.bindSocietyWorld(input);
    const commit = await this.sendOperation(
      "update_society_world",
      getUpdateSocietyWorldInstructionAsync({
        authority: input.authority,
        identity: input.identity,
        task: input.task,
        societyWorld: binding.address,
        currentTick: input.currentTick,
        lastSequence: input.lastSequence,
        lastReceipt: input.lastReceipt,
        status: input.status,
        state: input.state,
      }),
      input.authority,
      binding.address,
      [
        `tick ${input.currentTick}`,
        `sequence ${input.lastSequence.toString()}`,
        `status ${input.status}`,
      ],
    );
    return { ...binding, ...commit };
  }

  async fetchMaybeSocietyWorld(input: {
    readonly task: Address;
  }): Promise<
    (OnchainSocietyWorldBinding & OnchainSocietyWorldRecord) | undefined
  > {
    const rpc = this.dispatcher.rpc;
    if (!rpc) {
      throw new Error(
        "Society world fetch is unavailable without an RPC client",
      );
    }
    const { fetchMaybeSocietyWorld } = await loadSocietyWorldAccountModule();
    const binding = await this.bindSocietyWorld(input);
    const account = await fetchMaybeSocietyWorld(rpc, binding.address);
    if (!account.exists) return undefined;
    return {
      address: binding.address,
      identity: account.data.identity,
      task: account.data.task,
      currentTick: account.data.currentTick,
      lastSequence: account.data.lastSequence,
      lastReceipt: account.data.lastReceipt,
      stateHash: account.data.stateHash,
      status: account.data.status,
      state: account.data.state,
      bump: account.data.bump,
    };
  }

  async fetchSocietyWorld(input: {
    readonly task: Address;
  }): Promise<OnchainSocietyWorldBinding & OnchainSocietyWorldRecord> {
    const world = await this.fetchMaybeSocietyWorld(input);
    if (!world) {
      throw new Error(`Society world ${input.task} does not exist`);
    }
    return world;
  }

  async initializeDomainCatalog(input: {
    readonly curator: TransactionSigner;
    readonly domainCatalog?: Address;
  }): Promise<OnchainOperationResult> {
    const { getInitializeDomainCatalogInstructionAsync } =
      await loadInitializeDomainCatalogInstructionModule();
    const address =
      input.domainCatalog ?? (await this.getDomainCatalogAddress());
    return await this.sendOperation(
      "initialize_domain_catalog",
      getInitializeDomainCatalogInstructionAsync({
        curator: input.curator,
        domainCatalog: address,
      }),
      input.curator,
      address,
    );
  }

  async initializeCpiAuthority(input: {
    readonly payer: TransactionSigner;
  }): Promise<OnchainOperationResult> {
    const { getInitializeCpiAuthorityInstructionAsync } =
      await loadInitializeCpiAuthorityInstructionModule();
    const address = await this.bindCpiAuthority();
    return await this.sendOperation(
      "initialize_cpi_authority",
      getInitializeCpiAuthorityInstructionAsync({
        payer: input.payer,
        cpiAuthority: address,
      }),
      input.payer,
      address,
    );
  }

  async ensureCpiAuthority(input: {
    readonly payer: TransactionSigner;
  }): Promise<OnchainOperationResult> {
    const address = await this.bindCpiAuthority();
    const rpc = this.dispatcher.rpc;
    if (rpc) {
      const { fetchMaybeCpiAuthority } = await loadCpiAuthorityAccountModule();
      const existing = await fetchMaybeCpiAuthority(rpc, address);
      if (existing.exists) {
        return {
          kind: "initialize_cpi_authority",
          address,
          created: false,
          slot: 0,
        };
      }
    }

    return {
      ...(await this.initializeCpiAuthority(input)),
      created: true,
    };
  }

  async ensureDomainCatalog(input: {
    readonly curator: TransactionSigner;
  }): Promise<OnchainOperationResult> {
    const address = await this.getDomainCatalogAddress();
    const rpc = this.dispatcher.rpc;
    if (rpc) {
      const { fetchMaybeReputationDomainCatalog } =
        await loadReputationDomainCatalogAccountModule();
      const existing = await fetchMaybeReputationDomainCatalog(rpc, address);
      if (existing.exists) {
        return {
          kind: "initialize_domain_catalog",
          address,
          created: false,
          slot: 0,
        };
      }
    }
    return {
      ...(await this.initializeDomainCatalog({
        curator: input.curator,
        domainCatalog: address,
      })),
      created: true,
    };
  }

  async registerDomain(input: {
    readonly curator: TransactionSigner;
    readonly domainCatalog: Address;
    readonly taskOrDomain: TaskRecord | string;
  }): Promise<OnchainOperationResult> {
    const { getRegisterDomainInstructionAsync } =
      await loadRegisterDomainInstructionModule();
    const domain = deriveDomainBytes(input.taskOrDomain);
    return await this.sendOperation(
      "register_domain",
      getRegisterDomainInstructionAsync({
        curator: input.curator,
        domainCatalog: input.domainCatalog,
        domain,
      }),
      input.curator,
      input.domainCatalog,
    );
  }

  async ensureDomainRegistered(input: {
    readonly curator: TransactionSigner;
    readonly domainCatalog: Address;
    readonly taskOrDomain: TaskRecord | string;
  }): Promise<OnchainOperationResult> {
    const rpc = this.dispatcher.rpc;
    const domain = deriveDomainBytes(input.taskOrDomain);
    if (rpc) {
      const { fetchMaybeReputationDomainCatalog } =
        await loadReputationDomainCatalogAccountModule();
      const catalog = await fetchMaybeReputationDomainCatalog(
        rpc,
        input.domainCatalog,
      );
      if (
        catalog.exists &&
        catalog.data.domains.some((entry: ReadonlyUint8Array) =>
          bytes32Equals(entry, domain),
        )
      ) {
        return {
          kind: "register_domain",
          address: input.domainCatalog,
          created: false,
          slot: 0,
        };
      }
    }
    return {
      ...(await this.registerDomain(input)),
      created: true,
    };
  }

  async createReputationDomain(input: {
    readonly authority: TransactionSigner;
    readonly identity: Address;
    readonly domainCatalog: Address;
    readonly taskOrDomain: TaskRecord | string;
    readonly completionWeight?: bigint;
    readonly disputeWeight?: bigint;
    readonly disputeResolvedWeight?: bigint;
  }): Promise<OnchainReputationBinding & OnchainOperationResult> {
    const { getCreateReputationDomainInstructionAsync } =
      await loadCreateReputationDomainInstructionModule();
    const binding = await this.bindReputation(input);
    const commit = await this.sendOperation(
      "create_reputation_domain",
      getCreateReputationDomainInstructionAsync({
        authority: input.authority,
        identity: input.identity,
        domainCatalog: input.domainCatalog,
        reputation: binding.address,
        domain: binding.domain,
        completionWeight: input.completionWeight ?? DEFAULT_WEIGHT,
        disputeWeight: input.disputeWeight ?? DEFAULT_WEIGHT,
        disputeResolvedWeight: input.disputeResolvedWeight ?? DEFAULT_WEIGHT,
      }),
      input.authority,
      binding.address,
    );
    return { ...binding, ...commit };
  }

  async ensureReputationDomain(input: {
    readonly authority: TransactionSigner;
    readonly identity: Address;
    readonly domainCatalog: Address;
    readonly taskOrDomain: TaskRecord | string;
    readonly completionWeight?: bigint;
    readonly disputeWeight?: bigint;
    readonly disputeResolvedWeight?: bigint;
  }): Promise<OnchainReputationBinding & OnchainOperationResult> {
    const binding = await this.bindReputation(input);
    const rpc = this.dispatcher.rpc;
    if (rpc) {
      const { fetchMaybeReputationAccumulator } =
        await loadReputationAccumulatorAccountModule();
      const existing = await fetchMaybeReputationAccumulator(
        rpc,
        binding.address,
      );
      if (existing.exists) {
        return {
          ...binding,
          kind: "create_reputation_domain",
          address: binding.address,
          created: false,
          slot: 0,
        };
      }
    }
    return {
      ...(await this.createReputationDomain(input)),
      created: true,
    };
  }

  async initializeStake(input: {
    readonly owner: TransactionSigner;
    readonly identity: Address;
    readonly slashAuthority: Address;
    readonly trustMode: number;
  }): Promise<OnchainStakeBinding & OnchainOperationResult> {
    const { getInitializeStakeInstructionAsync } =
      await loadInitializeStakeInstructionModule();
    const binding = await this.bindStake(input);
    const commit = await this.sendOperation(
      "initialize_stake",
      getInitializeStakeInstructionAsync({
        owner: input.owner,
        identity: input.identity,
        stake: binding.address,
        slashAuthority: input.slashAuthority,
        trustMode: input.trustMode,
      }),
      input.owner,
      binding.address,
      [`identity ${input.identity}`, `trust_mode ${input.trustMode}`],
    );
    return { ...binding, ...commit };
  }

  async ensureStake(input: {
    readonly owner: TransactionSigner;
    readonly identity: Address;
    readonly slashAuthority: Address;
    readonly trustMode: number;
  }): Promise<OnchainStakeBinding & OnchainOperationResult> {
    const binding = await this.bindStake(input);
    const rpc = this.dispatcher.rpc;
    if (rpc) {
      const { fetchMaybeStakeAccount } = await loadStakeAccountModule();
      const existing = await fetchMaybeStakeAccount(rpc, binding.address);
      if (existing.exists) {
        return {
          ...binding,
          kind: "initialize_stake",
          address: binding.address,
          created: false,
          slot: 0,
        };
      }
    }
    return {
      ...(await this.initializeStake(input)),
      created: true,
    };
  }

  async stake(input: {
    readonly owner: TransactionSigner;
    readonly identity: Address;
    readonly amount: bigint;
  }): Promise<OnchainStakeBinding & OnchainOperationResult> {
    if (input.amount <= 0n) {
      throw new Error("Stake amount must be positive");
    }

    const { getStakeInstruction } = await loadStakeInstructionModule();
    const binding = await this.bindStake(input);
    const commit = await this.sendOperation(
      "stake",
      getStakeInstruction({
        owner: input.owner,
        identity: input.identity,
        stake: binding.address,
        amount: input.amount,
      }),
      input.owner,
      binding.address,
      [`identity ${input.identity}`, `amount ${input.amount.toString()}`],
    );
    return { ...binding, ...commit };
  }

  async emitReceipt(input: {
    readonly authority: TransactionSigner;
    readonly identity: Address;
    readonly task: Address;
    readonly domainCatalog: Address;
    readonly receipt: ReceiptRecord;
  }): Promise<OnchainReceiptBinding & OnchainOperationResult> {
    const { getEmitReceiptInstructionAsync } =
      await loadEmitReceiptInstructionModule();
    const binding = await this.bindReceipt(input);
    const kind = RECEIPT_KIND_CODES[input.receipt.kind];
    const commit = await this.sendOperation(
      "emit_receipt",
      getEmitReceiptInstructionAsync({
        authority: input.authority,
        identity: input.identity,
        task: input.task,
        receipt: binding.address,
        domainCatalog: input.domainCatalog,
        receiptId: binding.receiptId,
        kind,
        sequence: BigInt(input.receipt.sequence),
        domain: binding.domain,
        previousReceipt: binding.previousReceipt,
        payloadHash: binding.payloadHash,
      }),
      input.authority,
      binding.address,
      receiptExplorerMemoDetails(input.receipt),
    );
    return { ...binding, ...commit };
  }

  async emitAuditReceipt(input: {
    readonly authority: TransactionSigner;
    readonly auditorIdentity: Address;
    readonly identityBond: Address;
    readonly targetIdentity: Address;
    readonly targetReceipt: Address;
    readonly domainCatalog: Address;
    readonly receipt: ReceiptRecord;
    readonly round: number;
    readonly deadlineSlot?: number | bigint;
  }): Promise<OnchainAuditReceiptBinding & OnchainOperationResult> {
    const { getEmitAuditReceiptInstructionAsync } =
      await loadEmitAuditReceiptInstructionModule();
    const binding = await this.bindAuditReceipt({
      auditorIdentity: input.auditorIdentity,
      targetReceipt: input.targetReceipt,
      kind: input.receipt.kind,
      round: input.round,
    });
    const kind = RECEIPT_KIND_CODES[input.receipt.kind];
    const payloadHash = derivePayloadHashBytes(
      payloadHashFromReceipt(input.receipt),
    );
    const domain = deriveDomainBytes(input.receipt.domain);
    const commit = await this.sendOperation(
      "emit_audit_receipt",
      getEmitAuditReceiptInstructionAsync({
        authority: input.authority,
        auditorIdentity: input.auditorIdentity,
        identityBond: input.identityBond,
        targetIdentity: input.targetIdentity,
        targetReceipt: input.targetReceipt,
        auditReceipt: binding.address,
        domainCatalog: input.domainCatalog,
        kind,
        domain,
        payloadHash,
        sequence: BigInt(input.receipt.sequence),
        round: input.round,
        deadlineSlot: input.deadlineSlot ?? 0n,
      }),
      input.authority,
      binding.address,
      receiptExplorerMemoDetails(input.receipt),
    );
    return { ...binding, ...commit };
  }

  async emitChallengeResponse(input: {
    readonly authority: TransactionSigner;
    readonly identity: Address;
    readonly targetIdentity: Address;
    readonly challenge: Address;
    readonly receipt: ReceiptRecord;
  }): Promise<OnchainChallengeResponseBinding & OnchainOperationResult> {
    const { getEmitChallengeResponseInstructionAsync } =
      await loadEmitChallengeResponseInstructionModule();
    const binding = await this.bindChallengeResponse({
      challenge: input.challenge,
    });
    const payloadHash = derivePayloadHashBytes(
      payloadHashFromReceipt(input.receipt),
    );
    const commit = await this.sendOperation(
      "emit_challenge_response",
      getEmitChallengeResponseInstructionAsync({
        authority: input.authority,
        identity: input.identity,
        targetIdentity: input.targetIdentity,
        challenge: input.challenge,
        challengeResponse: binding.address,
        payloadHash,
      }),
      input.authority,
      binding.address,
    );
    return { ...binding, ...commit };
  }

  async finalizeUnansweredChallenge(input: {
    readonly authority: TransactionSigner;
    readonly targetIdentity: Address;
    readonly challenge: Address;
    readonly targetReceipt: Address;
    readonly auditorIdentity: Address;
    readonly round: number;
  }): Promise<OnchainAuditReceiptBinding & OnchainOperationResult> {
    const { getFinalizeUnansweredChallengeInstructionAsync } =
      await loadFinalizeUnansweredChallengeInstructionModule();
    const binding = await this.bindAuditReceipt({
      auditorIdentity: input.auditorIdentity,
      targetReceipt: input.targetReceipt,
      kind: "dispute",
      round: input.round,
    });
    const commit = await this.sendOperation(
      "finalize_unanswered_challenge",
      getFinalizeUnansweredChallengeInstructionAsync({
        authority: input.authority,
        targetIdentity: input.targetIdentity,
        challenge: input.challenge,
        targetReceipt: input.targetReceipt,
        auditReceipt: binding.address,
      }),
      input.authority,
      binding.address,
    );
    return { ...binding, ...commit };
  }

  async syncTaskStatus(input: {
    readonly authority: TransactionSigner;
    readonly identity: Address;
    readonly task: Address;
    readonly receipt: Address;
  }): Promise<OnchainOperationResult> {
    const { getSyncTaskStatusInstructionAsync } =
      await loadSyncTaskStatusInstructionModule();
    return await this.sendOperation(
      "sync_task_status",
      getSyncTaskStatusInstructionAsync({
        authority: input.authority,
        identity: input.identity,
        task: input.task,
        receipt: input.receipt,
      }),
      input.authority,
      input.task,
    );
  }

  async applyReputationReceipt(input: {
    readonly authority: TransactionSigner;
    readonly identity: Address;
    readonly receipt: Address;
    readonly reputation: Address;
  }): Promise<OnchainOperationResult> {
    const { getApplyReputationReceiptInstructionAsync } =
      await loadApplyReputationReceiptInstructionModule();
    return await this.sendOperation(
      "apply_reputation_receipt",
      getApplyReputationReceiptInstructionAsync({
        authority: input.authority,
        identity: input.identity,
        receipt: input.receipt,
        reputation: input.reputation,
      }),
      input.authority,
      input.reputation,
    );
  }

  async initializeAttesterRegistry(input: {
    readonly curator: TransactionSigner;
  }): Promise<OnchainOperationResult> {
    const { getInitializeRegistryInstructionAsync } =
      await loadInitializeAttesterRegistryInstructionModule();
    const { findConfigPda } = await loadAttesterConfigPdaModule();
    const address = addressFromPda(await findConfigPda());
    return await this.sendOperation(
      "initialize_attester_registry",
      getInitializeRegistryInstructionAsync({
        curator: input.curator,
        config: address,
      }),
      input.curator,
      address,
    );
  }

  async ensureAttesterRegistry(input: {
    readonly curator: TransactionSigner;
  }): Promise<OnchainOperationResult> {
    const { findConfigPda } = await loadAttesterConfigPdaModule();
    const address = addressFromPda(await findConfigPda());
    const rpc = this.dispatcher.rpc;
    if (rpc) {
      const { fetchMaybeAttesterRegistryConfig } =
        await loadAttesterRegistryConfigAccountModule();
      const existing = await fetchMaybeAttesterRegistryConfig(rpc, address);
      if (existing.exists) {
        return {
          kind: "initialize_attester_registry",
          address,
          created: false,
          slot: 0,
        };
      }
    }
    return {
      ...(await this.initializeAttesterRegistry(input)),
      created: true,
    };
  }

  async registerAttester(input: {
    readonly authority: TransactionSigner;
    readonly identity: Address;
    readonly category: string;
    readonly selfDeclaredTier: number;
  }): Promise<OnchainAttesterBinding & OnchainOperationResult> {
    const { getRegisterAttesterInstructionAsync } =
      await loadRegisterAttesterInstructionModule();
    const binding = await this.bindAttester(input);
    const commit = await this.sendOperation(
      "register_attester",
      getRegisterAttesterInstructionAsync({
        authority: input.authority,
        identity: input.identity,
        identityBond: binding.identityBond,
        config: binding.config,
        attester: binding.address,
        category: input.category,
        selfDeclaredTier: input.selfDeclaredTier,
      }),
      input.authority,
      binding.address,
    );
    return { ...binding, ...commit };
  }

  async ensureAttester(input: {
    readonly authority: TransactionSigner;
    readonly identity: Address;
    readonly category: string;
    readonly selfDeclaredTier: number;
  }): Promise<OnchainAttesterBinding & OnchainOperationResult> {
    const binding = await this.bindAttester(input);
    const rpc = this.dispatcher.rpc;
    if (rpc) {
      const { fetchMaybeAttesterRecord } =
        await loadAttesterRecordAccountModule();
      const existing = await fetchMaybeAttesterRecord(rpc, binding.address);
      if (existing.exists) {
        return {
          ...binding,
          kind: "register_attester",
          address: binding.address,
          created: false,
          slot: 0,
        };
      }
    }
    return {
      ...(await this.registerAttester(input)),
      created: true,
    };
  }

  async createDelegation(input: {
    readonly authority: TransactionSigner;
    readonly identity: Address;
    readonly delegate: Address;
    readonly allowedActions: number;
    readonly expiresAtSlot?: number | bigint;
  }): Promise<OnchainDelegationBinding & OnchainOperationResult> {
    if (input.allowedActions <= 0) {
      throw new Error("Delegation scope must include at least one action");
    }

    const { getCreateDelegationInstructionAsync } =
      await loadCreateDelegationInstructionModule();
    const binding = await this.bindDelegation(input);
    const commit = await this.sendOperation(
      "create_delegation",
      getCreateDelegationInstructionAsync({
        authority: input.authority,
        identity: input.identity,
        delegate: input.delegate,
        delegation: binding.address,
        allowedActions: input.allowedActions,
        expiresAtSlot: input.expiresAtSlot ?? 0n,
      }),
      input.authority,
      binding.address,
    );
    return { ...binding, ...commit };
  }

  async ensureDelegation(input: {
    readonly authority: TransactionSigner;
    readonly identity: Address;
    readonly delegate: Address;
    readonly allowedActions: number;
    readonly expiresAtSlot?: number | bigint;
  }): Promise<OnchainDelegationBinding & OnchainOperationResult> {
    const binding = await this.bindDelegation(input);
    const rpc = this.dispatcher.rpc;
    if (rpc) {
      const { fetchMaybeDelegationRecord } =
        await loadDelegationRecordAccountModule();
      const existing = await fetchMaybeDelegationRecord(rpc, binding.address);
      if (existing.exists) {
        return {
          ...binding,
          kind: "create_delegation",
          address: binding.address,
          created: false,
          slot: 0,
        };
      }
    }
    return {
      ...(await this.createDelegation(input)),
      created: true,
    };
  }

  async initializeHistoryUpdater(input: {
    readonly payer: TransactionSigner;
  }): Promise<OnchainOperationResult> {
    const { getInitializeHistoryUpdaterInstructionAsync } =
      await loadInitializeHistoryUpdaterInstructionModule();
    const address = await this.bindHistoryUpdater();
    return await this.sendOperation(
      "initialize_history_updater",
      getInitializeHistoryUpdaterInstructionAsync({
        payer: input.payer,
        historyUpdater: address,
      }),
      input.payer,
      address,
    );
  }

  async ensureHistoryUpdater(input: {
    readonly payer: TransactionSigner;
  }): Promise<OnchainOperationResult> {
    const address = await this.bindHistoryUpdater();
    const rpc = this.dispatcher.rpc;
    if (rpc) {
      const { fetchMaybeHistoryUpdater } =
        await loadHistoryUpdaterAccountModule();
      const existing = await fetchMaybeHistoryUpdater(rpc, address);
      if (existing.exists) {
        return {
          kind: "initialize_history_updater",
          address,
          created: false,
          slot: 0,
        };
      }
    }
    return {
      ...(await this.initializeHistoryUpdater(input)),
      created: true,
    };
  }

  async initializeHistoryCheckpoint(input: {
    readonly authority: TransactionSigner;
    readonly identity: Address;
    readonly epoch: number | bigint;
  }): Promise<OnchainHistoryCheckpointBinding & OnchainOperationResult> {
    const { getInitializeCheckpointInstructionAsync } =
      await loadInitializeCheckpointInstructionModule();
    const binding = await this.bindHistoryCheckpoint(input);
    const historyUpdater = await this.bindHistoryUpdater();
    const commit = await this.sendOperation(
      "initialize_history_checkpoint",
      getInitializeCheckpointInstructionAsync({
        authority: input.authority,
        identity: input.identity,
        checkpoint: binding.address,
        latestCheckpoint: binding.latestCheckpoint,
        historyUpdater,
        epoch: binding.epoch,
      }),
      input.authority,
      binding.address,
    );
    return { ...binding, ...commit };
  }

  async ensureHistoryCheckpoint(input: {
    readonly authority: TransactionSigner;
    readonly identity: Address;
    readonly epoch: number | bigint;
  }): Promise<OnchainHistoryCheckpointBinding & OnchainOperationResult> {
    const binding = await this.bindHistoryCheckpoint(input);
    const rpc = this.dispatcher.rpc;
    if (rpc) {
      const { fetchMaybeHistoryCheckpoint } =
        await loadHistoryCheckpointAccountModule();
      const existing = await fetchMaybeHistoryCheckpoint(rpc, binding.address);
      if (existing.exists) {
        return {
          ...binding,
          kind: "initialize_history_checkpoint",
          address: binding.address,
          created: false,
          slot: 0,
        };
      }
    }
    return {
      ...(await this.initializeHistoryCheckpoint(input)),
      created: true,
    };
  }

  async appendReceiptToCheckpoint(input: {
    readonly feePayer: TransactionSigner;
    readonly identity: Address;
    readonly checkpoint: Address;
    readonly latestCheckpoint: Address;
    readonly receipt: Address;
  }): Promise<OnchainOperationResult> {
    const { getAppendReceiptToCheckpointInstructionAsync } =
      await loadAppendReceiptToCheckpointInstructionModule();
    const historyUpdater = await this.bindHistoryUpdater();
    return await this.sendOperation(
      "append_receipt_to_checkpoint",
      getAppendReceiptToCheckpointInstructionAsync({
        identity: input.identity,
        checkpoint: input.checkpoint,
        latestCheckpoint: input.latestCheckpoint,
        receipt: input.receipt,
        historyUpdater,
      }),
      input.feePayer,
      input.checkpoint,
    );
  }

  async registerAdjudicator(input: {
    readonly governance: TransactionSigner;
    readonly adjudicator?: Address;
  }): Promise<OnchainAdjudicatorBinding & OnchainOperationResult> {
    const { getRegisterAdjudicatorInstructionAsync } =
      await loadRegisterAdjudicatorInstructionModule();
    const { findAdjudicatorConfigPda } = await loadAdjudicatorConfigPdaModule();
    const { findTreasuryVaultPda } = await loadTreasuryVaultPdaModule();
    const address = addressFromPda(await findAdjudicatorConfigPda());
    const treasuryVault = addressFromPda(await findTreasuryVaultPda());
    const adjudicator = input.adjudicator ?? input.governance.address;
    const commit = await this.sendOperation(
      "register_adjudicator",
      getRegisterAdjudicatorInstructionAsync({
        governance: input.governance,
        adjudicatorConfig: address,
        treasuryVault,
        adjudicator,
      }),
      input.governance,
      address,
    );
    return { address, adjudicator, treasuryVault, ...commit };
  }

  async ensureAdjudicator(input: {
    readonly governance: TransactionSigner;
    readonly adjudicator?: Address;
  }): Promise<OnchainAdjudicatorBinding & OnchainOperationResult> {
    const { findAdjudicatorConfigPda } = await loadAdjudicatorConfigPdaModule();
    const { findTreasuryVaultPda } = await loadTreasuryVaultPdaModule();
    const address = addressFromPda(await findAdjudicatorConfigPda());
    const treasuryVault = addressFromPda(await findTreasuryVaultPda());
    const rpc = this.dispatcher.rpc;
    if (rpc) {
      const { fetchMaybeAdjudicatorConfig } =
        await loadAdjudicatorConfigAccountModule();
      const existing = await fetchMaybeAdjudicatorConfig(rpc, address);
      if (existing.exists) {
        return {
          address,
          adjudicator: existing.data.adjudicator,
          treasuryVault,
          kind: "register_adjudicator",
          created: false,
          slot: 0,
        };
      }
    }
    return {
      ...(await this.registerAdjudicator(input)),
      created: true,
    };
  }

  async recordVerdict(input: {
    readonly adjudicator: TransactionSigner;
    readonly disputeReceipt: Address;
    readonly outcome: number;
    readonly slashAmount: number | bigint;
    readonly class: number;
    readonly staleAfterSlot: number | bigint;
  }): Promise<OnchainVerdictBinding & OnchainOperationResult> {
    const { getRecordVerdictInstructionAsync } =
      await loadRecordVerdictInstructionModule();
    const binding = await this.bindVerdict(input);
    const commit = await this.sendOperation(
      "record_verdict",
      getRecordVerdictInstructionAsync({
        adjudicator: input.adjudicator,
        disputeReceipt: input.disputeReceipt,
        verdict: binding.address,
        outcome: input.outcome,
        slashAmount: input.slashAmount,
        class: input.class,
        staleAfterSlot: input.staleAfterSlot,
      }),
      input.adjudicator,
      binding.address,
    );
    return { ...binding, ...commit };
  }

  async ensureVerdict(input: {
    readonly adjudicator: TransactionSigner;
    readonly disputeReceipt: Address;
    readonly outcome: number;
    readonly slashAmount: number | bigint;
    readonly class: number;
    readonly staleAfterSlot: number | bigint;
  }): Promise<OnchainVerdictBinding & OnchainOperationResult> {
    const binding = await this.bindVerdict(input);
    const rpc = this.dispatcher.rpc;
    if (rpc) {
      const { fetchMaybeDisputeVerdict } =
        await loadDisputeVerdictAccountModule();
      const existing = await fetchMaybeDisputeVerdict(rpc, binding.address);
      if (existing.exists) {
        return {
          ...binding,
          kind: "record_verdict",
          address: binding.address,
          created: false,
          slot: 0,
        };
      }
    }
    return {
      ...(await this.recordVerdict(input)),
      created: true,
    };
  }

  private async sendOperation(
    kind: string,
    instruction: Instruction | Promise<Instruction>,
    feePayer: TransactionSigner,
    address?: Address,
    memoDetails?: ReadonlyArray<string>,
  ): Promise<OnchainOperationResult> {
    const primaryInstruction = await instruction;
    const primaryInstructions = [primaryInstruction];
    const memoInstruction = createExplorerMemoInstruction(
      buildExplorerMemo({ kind, address, details: memoDetails }),
    );
    let commit: OnchainTransactionCommit;
    try {
      commit = await this.dispatcher.send(
        [...primaryInstructions, memoInstruction],
        feePayer,
      );
    } catch (error) {
      if (!isTransactionTooLargeError(error)) throw error;
      commit = await this.dispatcher.send(primaryInstructions, feePayer);
    }
    return {
      kind,
      address,
      ...commit,
    };
  }
}

function payloadHashFromReceipt(receipt: ReceiptRecord): string | undefined {
  const payloadHash = receipt.payload.payloadHash;
  return typeof payloadHash === "string" ? payloadHash : undefined;
}
