import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

import {
  appendTransactionMessageInstructions,
  createSolanaRpc,
  createSolanaRpcSubscriptions,
  createTransactionMessage,
  getSignatureFromTransaction,
  sendAndConfirmTransactionFactory,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
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
    feePayer: TransactionSigner
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

export interface OnchainReceiptBinding {
  readonly address: Address;
  readonly receiptId: Uint8Array;
  readonly previousReceipt: Uint8Array;
  readonly payloadHash: Uint8Array;
  readonly domain: Uint8Array;
}

export interface OnchainStakeBinding {
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

type IdentityPdaModule =
  typeof import("../../program-clients/dist/generated/identity_registry/pdas/identity.js");
type CreateIdentityInstructionModule =
  typeof import("../../program-clients/dist/generated/identity_registry/instructions/createIdentity.js");
type AgentIdentityAccountModule =
  typeof import("../../program-clients/dist/generated/identity_registry/accounts/agentIdentity.js");
type TaskPdaModule =
  typeof import("../../program-clients/dist/generated/task_registry/pdas/task.js");
type CreateTaskInstructionModule =
  typeof import("../../program-clients/dist/generated/task_registry/instructions/createTask.js");
type TaskRecordAccountModule =
  typeof import("../../program-clients/dist/generated/task_registry/accounts/taskRecord.js");
type SyncTaskStatusInstructionModule =
  typeof import("../../program-clients/dist/generated/task_registry/instructions/syncTaskStatus.js");
type ReceiptPdaModule =
  typeof import("../../program-clients/dist/generated/receipt_emitter/pdas/receipt.js");
type CpiAuthorityPdaModule =
  typeof import("../../program-clients/dist/generated/receipt_emitter/pdas/cpiAuthority.js");
type EmitReceiptInstructionModule =
  typeof import("../../program-clients/dist/generated/receipt_emitter/instructions/emitReceipt.js");
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
type StakePdaModule =
  typeof import("../../program-clients/dist/generated/agent_stake/pdas/stake.js");
type StakeAccountModule =
  typeof import("../../program-clients/dist/generated/agent_stake/accounts/stakeAccount.js");
type InitializeStakeInstructionModule =
  typeof import("../../program-clients/dist/generated/agent_stake/instructions/initializeStake.js");
type StakeInstructionModule =
  typeof import("../../program-clients/dist/generated/agent_stake/instructions/stake.js");

const addressFromPda = (pda: ProgramDerivedAddress): Address => pda[0];
const require = createRequire(import.meta.url);
const programClientsDistUrl = new URL(
  "./",
  pathToFileURL(require.resolve("@trust-substrate/program-clients"))
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
  "./generated/identity_registry/pdas/identity.js"
);
const loadCreateIdentityInstructionModule =
  lazyModule<CreateIdentityInstructionModule>(
    "./generated/identity_registry/instructions/createIdentity.js"
  );
const loadAgentIdentityAccountModule = lazyModule<AgentIdentityAccountModule>(
  "./generated/identity_registry/accounts/agentIdentity.js"
);
const loadTaskPdaModule = lazyModule<TaskPdaModule>(
  "./generated/task_registry/pdas/task.js"
);
const loadCreateTaskInstructionModule = lazyModule<CreateTaskInstructionModule>(
  "./generated/task_registry/instructions/createTask.js"
);
const loadTaskRecordAccountModule = lazyModule<TaskRecordAccountModule>(
  "./generated/task_registry/accounts/taskRecord.js"
);
const loadSyncTaskStatusInstructionModule =
  lazyModule<SyncTaskStatusInstructionModule>(
    "./generated/task_registry/instructions/syncTaskStatus.js"
  );
const loadReceiptPdaModule = lazyModule<ReceiptPdaModule>(
  "./generated/receipt_emitter/pdas/receipt.js"
);
const loadCpiAuthorityPdaModule = lazyModule<CpiAuthorityPdaModule>(
  "./generated/receipt_emitter/pdas/cpiAuthority.js"
);
const loadEmitReceiptInstructionModule =
  lazyModule<EmitReceiptInstructionModule>(
    "./generated/receipt_emitter/instructions/emitReceipt.js"
  );
const loadInitializeCpiAuthorityInstructionModule =
  lazyModule<InitializeCpiAuthorityInstructionModule>(
    "./generated/receipt_emitter/instructions/initializeCpiAuthority.js"
  );
const loadCpiAuthorityAccountModule = lazyModule<CpiAuthorityAccountModule>(
  "./generated/receipt_emitter/accounts/cpiAuthority.js"
);
const loadDomainCatalogPdaModule = lazyModule<DomainCatalogPdaModule>(
  "./generated/reputation_accumulator/pdas/domainCatalog.js"
);
const loadReputationPdaModule = lazyModule<ReputationPdaModule>(
  "./generated/reputation_accumulator/pdas/reputation.js"
);
const loadReputationDomainCatalogAccountModule =
  lazyModule<ReputationDomainCatalogAccountModule>(
    "./generated/reputation_accumulator/accounts/reputationDomainCatalog.js"
  );
const loadReputationAccumulatorAccountModule =
  lazyModule<ReputationAccumulatorAccountModule>(
    "./generated/reputation_accumulator/accounts/reputationAccumulator.js"
  );
const loadInitializeDomainCatalogInstructionModule =
  lazyModule<InitializeDomainCatalogInstructionModule>(
    "./generated/reputation_accumulator/instructions/initializeDomainCatalog.js"
  );
const loadRegisterDomainInstructionModule =
  lazyModule<RegisterDomainInstructionModule>(
    "./generated/reputation_accumulator/instructions/registerDomain.js"
  );
const loadCreateReputationDomainInstructionModule =
  lazyModule<CreateReputationDomainInstructionModule>(
    "./generated/reputation_accumulator/instructions/createReputationDomain.js"
  );
const loadApplyReputationReceiptInstructionModule =
  lazyModule<ApplyReputationReceiptInstructionModule>(
    "./generated/reputation_accumulator/instructions/applyReputationReceipt.js"
  );
const loadStakePdaModule = lazyModule<StakePdaModule>(
  "./generated/agent_stake/pdas/stake.js"
);
const loadStakeAccountModule = lazyModule<StakeAccountModule>(
  "./generated/agent_stake/accounts/stakeAccount.js"
);
const loadInitializeStakeInstructionModule =
  lazyModule<InitializeStakeInstructionModule>(
    "./generated/agent_stake/instructions/initializeStake.js"
  );
const loadStakeInstructionModule = lazyModule<StakeInstructionModule>(
  "./generated/agent_stake/instructions/stake.js"
);

export class KitTransactionDispatcher implements OnchainTransactionDispatcher {
  readonly rpc: TrustSubstrateRpc;
  private readonly rpcSubscriptions: TrustSubstrateRpcSubscriptions;
  private readonly commitment: "processed" | "confirmed" | "finalized";

  constructor(
    rpc: TrustSubstrateRpc,
    rpcSubscriptions: TrustSubstrateRpcSubscriptions,
    commitment: "processed" | "confirmed" | "finalized" = DEFAULT_COMMITMENT
  ) {
    this.rpc = rpc;
    this.rpcSubscriptions = rpcSubscriptions;
    this.commitment = commitment;
  }

  async send(
    instructions: ReadonlyArray<Instruction>,
    feePayer: TransactionSigner
  ): Promise<OnchainTransactionCommit> {
    const { value: latestBlockhash } = await this.rpc
      .getLatestBlockhash({ commitment: this.commitment })
      .send();

    const transactionMessage = createTransactionMessage({ version: "legacy" });
    const messageWithFeePayer = setTransactionMessageFeePayerSigner(
      feePayer,
      transactionMessage
    );
    const messageWithInstructions = appendTransactionMessageInstructions(
      [...instructions],
      messageWithFeePayer
    );
    const messageWithLifetime = setTransactionMessageLifetimeUsingBlockhash(
      latestBlockhash,
      messageWithInstructions
    );

    const signedTransaction = await signTransactionMessageWithSigners(
      messageWithLifetime
    );
    const signature = getSignatureFromTransaction(signedTransaction);
    const sendAndConfirm = sendAndConfirmTransactionFactory({
      rpc: this.rpc,
      rpcSubscriptions: this.rpcSubscriptions,
    });

    await sendAndConfirm(
      signedTransaction as Parameters<typeof sendAndConfirm>[0],
      {
        commitment: this.commitment,
      }
    );

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
      rpcSubscriptionsUrl
    ) as TrustSubstrateRpcSubscriptions,
    commitment
  );

export class TrustSubstrateOnchainClient {
  constructor(private readonly dispatcher: OnchainTransactionDispatcher) {}

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
      })
    );
    return { address, agentId };
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
      })
    );
    return {
      address,
      taskId,
      subtaskRoot,
      domain,
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
      payloadHashFromReceipt(input.receipt)
    );
    const domain = deriveDomainBytes(input.receipt.domain);
    const address = addressFromPda(
      await findReceiptPda({
        identity: input.identity,
        task: input.task,
        receiptId,
      })
    );

    return {
      address,
      receiptId,
      previousReceipt,
      payloadHash,
      domain,
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
      })
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
      })
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
      binding.address
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
      const { fetchMaybeAgentIdentity } = await loadAgentIdentityAccountModule();
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
      binding.address
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
      address
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
      address
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
      input.domainCatalog
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
        input.domainCatalog
      );
      if (
        catalog.exists &&
        catalog.data.domains.some((entry: ReadonlyUint8Array) =>
          bytes32Equals(entry, domain)
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
      binding.address
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
        binding.address
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
      binding.address
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
      binding.address
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
      binding.address
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
      input.task
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
      input.reputation
    );
  }

  private async sendOperation(
    kind: string,
    instruction: Instruction | Promise<Instruction>,
    feePayer: TransactionSigner,
    address?: Address
  ): Promise<OnchainOperationResult> {
    const commit = await this.dispatcher.send([await instruction], feePayer);
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
