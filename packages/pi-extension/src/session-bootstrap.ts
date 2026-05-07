import type { Address, TransactionSigner } from "@solana/kit";

import {
  TrustSubstrateOnchainClient,
  createIdentity,
  createTask,
  type IdentityRecord,
  type OnchainOperationResult,
  type TaskRecord,
} from "@trust-substrate/sdk";

import type { SubstrateBindings } from "./session-commit.js";

export interface BootstrapInput {
  readonly client: TrustSubstrateOnchainClient;
  readonly authority: TransactionSigner;
  readonly identityLabel: string;
  readonly taskTitle: string;
  readonly domain: string;
  readonly taskDescription?: string;
  readonly autoProvisionIdentity: boolean;
}

export interface BootstrapResult extends SubstrateBindings {
  readonly operations: ReadonlyArray<OnchainOperationResult>;
}

const buildIdentityRecord = (
  authority: TransactionSigner,
  label: string,
): IdentityRecord =>
  createIdentity({
    authority: authority.address,
    label,
  });

const buildTaskRecord = (
  identity: IdentityRecord,
  title: string,
  domain: string,
  description?: string,
): TaskRecord =>
  createTask({
    identityId: identity.identityId,
    title,
    domain,
    description,
  });

export const bootstrapSubstrateSession = async (
  input: BootstrapInput,
): Promise<BootstrapResult> => {
  const identity = buildIdentityRecord(input.authority, input.identityLabel);
  const task = buildTaskRecord(
    identity,
    input.taskTitle,
    input.domain,
    input.taskDescription,
  );

  const operations: OnchainOperationResult[] = [];
  const domainCatalogAddress = await input.client.getDomainCatalogAddress();
  operations.push(
    await input.client.ensureDomainCatalog({
      curator: input.authority,
    }),
  );
  operations.push(
    await input.client.ensureDomainRegistered({
      curator: input.authority,
      domainCatalog: domainCatalogAddress,
      taskOrDomain: task,
    }),
  );
  operations.push(
    await input.client.ensureCpiAuthority({
      payer: input.authority,
    }),
  );

  let identityAddress: Address;
  let taskAddress: Address;

  if (input.autoProvisionIdentity) {
    const identityCommit = await input.client.ensureIdentity({
      authority: input.authority,
      identity,
    });
    identityAddress = identityCommit.address;
    operations.push(identityCommit);

    const taskCommit = await input.client.ensureTask({
      authority: input.authority,
      identity: identityAddress,
      task,
    });
    taskAddress = taskCommit.address;
    operations.push(taskCommit);
  } else {
    const identityBinding = await input.client.bindIdentity({
      authority: input.authority,
      identity,
    });
    identityAddress = identityBinding.address;
    const taskBinding = await input.client.bindTask({
      identity: identityAddress,
      task,
    });
    taskAddress = taskBinding.address;
  }

  const reputationCommit = await input.client.ensureReputationDomain({
    authority: input.authority,
    identity: identityAddress,
    domainCatalog: domainCatalogAddress,
    taskOrDomain: task,
  });
  operations.push(reputationCommit);

  return {
    authority: input.authority,
    identity,
    identityAddress,
    task,
    taskAddress,
    domainCatalogAddress,
    reputationAddress: reputationCommit.address,
    operations,
  };
};
