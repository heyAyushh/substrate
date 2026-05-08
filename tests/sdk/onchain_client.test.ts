import test from "node:test";
import { ok, rejects, strictEqual } from "node:assert/strict";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  address,
  generateKeyPairSigner,
  type Address,
  type Instruction,
} from "@solana/kit";

import {
  createIdentity,
  createReceipt,
  createTask,
  KitTransactionDispatcher,
  TrustSubstrateOnchainClient,
  withPayloadHash,
  type OnchainTransactionDispatcher,
} from "../../packages/sdk/src/index.js";

const { getCreateSocietyWorldInstructionAsync } = await import(
  pathToFileURL(
    resolve(
      process.cwd(),
      "../program-clients/dist/generated/task_registry/instructions/createSocietyWorld.js",
    ),
  ).href
);
const { getTaskRecordEncoder } = await import(
  pathToFileURL(
    resolve(
      process.cwd(),
      "../program-clients/dist/generated/task_registry/accounts/taskRecord.js",
    ),
  ).href
);

const DUMMY_BLOCKHASH_LIFETIME = {
  blockhash: "11111111111111111111111111111111",
  lastValidBlockHeight: 0n,
};
const MEMO_PROGRAM_ADDRESS = address(
  "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr",
);
const TASK_REGISTRY_PROGRAM_ADDRESS = address(
  "E16iDriWzHDTyX6irMhoGwnfWLDBMiTZeW67gZJiLwt4",
);
const ZERO_ADDRESS = address("11111111111111111111111111111111");

const decodeInstructionData = (instruction: Instruction): string =>
  new TextDecoder().decode(
    (instruction as Instruction & { data: Uint8Array }).data,
  );

const zeroBytes32 = (): Uint8Array => new Uint8Array(32);

const createTaskAccountRpc = (input: {
  readonly taskAddress: Address;
  readonly identityAddress: Address;
  readonly lastReceipt: Address;
  readonly lastSequence: bigint;
}) => {
  const data = getTaskRecordEncoder().encode({
    identity: input.identityAddress,
    taskId: zeroBytes32(),
    domain: zeroBytes32(),
    subtaskRoot: zeroBytes32(),
    subtaskCount: 0,
    status: 0,
    completedCount: 0,
    disputedCount: 0,
    resolvedCount: 0,
    lastReceipt: input.lastReceipt,
    lastSequence: input.lastSequence,
    bump: 255,
  });

  return {
    getAccountInfo: (requestedAddress: Address) => ({
      send: async () => ({
        value:
          requestedAddress === input.taskAddress
            ? {
                data: [Buffer.from(data).toString("base64"), "base64"],
                executable: false,
                lamports: 1n,
                owner: TASK_REGISTRY_PROGRAM_ADDRESS,
                space: data.length,
              }
            : null,
      }),
    }),
  };
};

test("dispatcher rejects oversized transactions before RPC send", async () => {
  const authority = await generateKeyPairSigner();
  const identity = await generateKeyPairSigner();
  const task = await generateKeyPairSigner();
  const societyWorld = await generateKeyPairSigner();
  const dispatcher = new KitTransactionDispatcher(
    {
      getLatestBlockhash: () => ({
        send: async () => ({ value: DUMMY_BLOCKHASH_LIFETIME }),
      }),
    } as never,
    {} as never,
  );

  const oversizedInstruction = await getCreateSocietyWorldInstructionAsync({
    authority,
    identity: identity.address,
    task: task.address,
    societyWorld: societyWorld.address,
    currentTick: 0,
    lastSequence: 0n,
    lastReceipt: address("11111111111111111111111111111111"),
    status: 0,
    state: new Uint8Array(1_400),
  });

  await rejects(
    dispatcher.send([oversizedInstruction], authority),
    /Transaction too large before send/,
  );
});

test("on-chain operations append Explorer-visible memos", async () => {
  const authority = await generateKeyPairSigner();
  const sentInstructionSets: Instruction[][] = [];
  const dispatcher: OnchainTransactionDispatcher = {
    send: async (instructions) => {
      sentInstructionSets.push([...instructions]);
      return { slot: 42, signature: "memo-signature" };
    },
  };
  const client = new TrustSubstrateOnchainClient(dispatcher);
  const identity = createIdentity({
    authority: authority.address,
    label: "memo-visible-agent",
  });

  await client.createIdentity({ authority, identity });

  const sentInstructions = sentInstructionSets[0] ?? [];
  const memoInstruction = sentInstructions.at(-1);
  strictEqual(sentInstructions.length, 2);
  strictEqual(memoInstruction?.programAddress, MEMO_PROGRAM_ADDRESS);
  const memo = decodeInstructionData(memoInstruction as Instruction);
  ok(memo.includes("Trust Substrate"));
  ok(memo.includes("create_identity"));
  ok(memo.includes(identity.identityId));
});

test("fetchTask exposes the on-chain task receipt chain head", async () => {
  const task = await generateKeyPairSigner();
  const identity = await generateKeyPairSigner();
  const lastReceipt = await generateKeyPairSigner();
  const client = new TrustSubstrateOnchainClient({
    rpc: createTaskAccountRpc({
      taskAddress: task.address,
      identityAddress: identity.address,
      lastReceipt: lastReceipt.address,
      lastSequence: 7n,
    }) as never,
    send: async () => {
      throw new Error("fetchTask must not send transactions");
    },
  });

  const record = await client.fetchTask({ task: task.address });

  strictEqual(record.address, task.address);
  strictEqual(record.identity, identity.address);
  strictEqual(record.lastReceipt, lastReceipt.address);
  strictEqual(record.lastSequence, 7n);
});

test("fetchMaybeTask returns undefined when the task account is missing", async () => {
  const task = await generateKeyPairSigner();
  const identity = await generateKeyPairSigner();
  const client = new TrustSubstrateOnchainClient({
    rpc: createTaskAccountRpc({
      taskAddress: identity.address,
      identityAddress: identity.address,
      lastReceipt: ZERO_ADDRESS,
      lastSequence: 0n,
    }) as never,
    send: async () => {
      throw new Error("fetchMaybeTask must not send transactions");
    },
  });

  const record = await client.fetchMaybeTask({ task: task.address });

  strictEqual(record, undefined);
});

test("delegated receipts are sent by the delegate signer", async () => {
  const authority = await generateKeyPairSigner();
  const delegate = await generateKeyPairSigner();
  let feePayerAddress = "";
  const sentInstructionSets: Instruction[][] = [];
  const dispatcher: OnchainTransactionDispatcher = {
    send: async (instructions, feePayer) => {
      sentInstructionSets.push([...instructions]);
      feePayerAddress = feePayer.address;
      return { slot: 42, signature: "delegated-signature" };
    },
  };
  const client = new TrustSubstrateOnchainClient(dispatcher);
  const identity = createIdentity({
    authority: authority.address,
    label: "society-root",
  });
  const task = createTask({
    identityId: identity.identityId,
    title: "delegated society",
    domain: "general",
  });
  const identityBinding = await client.bindIdentity({ authority, identity });
  const taskBinding = await client.bindTask({
    identity: identityBinding.address,
    task,
  });
  const delegation = await client.bindDelegation({
    identity: identityBinding.address,
    delegate: delegate.address,
  });
  const receipt = createReceipt({
    actorId: delegate.address,
    kind: "completion",
    taskId: task.taskId,
    sequence: 1,
    payload: withPayloadHash({ action: "agent-submitted" }),
  });

  const committed = await client.emitDelegatedReceipt({
    delegate,
    identity: identityBinding.address,
    delegation: delegation.address,
    task: taskBinding.address,
    domainCatalog: await client.getDomainCatalogAddress(),
    receipt,
  });

  strictEqual(committed.kind, "emit_delegated_receipt");
  strictEqual(feePayerAddress, delegate.address);
  strictEqual(sentInstructionSets[0]?.length, 2);
  strictEqual(
    sentInstructionSets[0]?.at(-1)?.programAddress,
    MEMO_PROGRAM_ADDRESS,
  );
});

test("verdict-backed slashing is exposed through the on-chain SDK", async () => {
  const adjudicator = await generateKeyPairSigner();
  const identity = await generateKeyPairSigner();
  const disputeReceipt = await generateKeyPairSigner();
  let feePayerAddress = "";
  const sentInstructionSets: Instruction[][] = [];
  const dispatcher: OnchainTransactionDispatcher = {
    send: async (instructions, feePayer) => {
      sentInstructionSets.push([...instructions]);
      feePayerAddress = feePayer.address;
      return { slot: 42, signature: "slash-signature" };
    },
  };
  const client = new TrustSubstrateOnchainClient(dispatcher);
  const stake = await client.bindStake({ identity: identity.address });

  const result = await client.slashWithVerdict({
    adjudicator,
    identity: identity.address,
    stake: stake.address,
    disputeReceipt: disputeReceipt.address,
  });

  strictEqual(result.kind, "slash_with_verdict");
  strictEqual(result.address, stake.address);
  strictEqual(result.stake, stake.address);
  strictEqual(result.disputeReceipt, disputeReceipt.address);
  ok(result.verdict.length > 0);
  strictEqual(feePayerAddress, adjudicator.address);
  strictEqual(sentInstructionSets[0]?.length, 2);
  strictEqual(
    sentInstructionSets[0]?.at(-1)?.programAddress,
    MEMO_PROGRAM_ADDRESS,
  );
});

test("SOL and SPL stake lifecycle methods are exposed through the on-chain SDK", async () => {
  const owner = await generateKeyPairSigner();
  const adjudicator = await generateKeyPairSigner();
  const identity = await generateKeyPairSigner();
  const scope = await generateKeyPairSigner();
  const mint = await generateKeyPairSigner();
  const ownerTokenAccount = await generateKeyPairSigner();
  const solDisputeReceipt = await generateKeyPairSigner();
  const tokenAuthorityDisputeReceipt = await generateKeyPairSigner();
  const tokenVerdictDisputeReceipt = await generateKeyPairSigner();
  const sentKinds: string[] = [];
  const feePayers: string[] = [];
  const dispatcher: OnchainTransactionDispatcher = {
    send: async (instructions, feePayer) => {
      const memoInstruction = instructions.at(-1);
      const memo = decodeInstructionData(memoInstruction as Instruction);
      sentKinds.push(memo.split(" | ")[1] ?? "");
      feePayers.push(feePayer.address);
      return { slot: 42, signature: `${sentKinds.at(-1)}-signature` };
    },
  };
  const client = new TrustSubstrateOnchainClient(dispatcher);
  const solStake = await client.bindStake({ identity: identity.address });
  const tokenStake = await client.initializeTokenStake({
    owner,
    identity: identity.address,
    scope: scope.address,
    mint: mint.address,
    slashAuthority: adjudicator.address,
    trustMode: 1,
  });
  const treasury = await client.initializeTokenTreasuryVault({
    payer: adjudicator,
    mint: mint.address,
  });

  await client.requestUnstake({
    owner,
    stake: solStake.address,
    amount: 1n,
  });
  await client.finalizeUnstake({
    owner,
    identity: identity.address,
    stake: solStake.address,
  });
  await client.slashWithAuthority({
    slashAuthority: adjudicator,
    identity: identity.address,
    stake: solStake.address,
    disputeReceipt: solDisputeReceipt.address,
    amount: 1n,
  });
  await client.stakeToken({
    owner,
    identity: identity.address,
    scope: scope.address,
    mint: mint.address,
    ownerTokenAccount: ownerTokenAccount.address,
    amount: 100n,
  });
  await client.requestUnstakeToken({
    owner,
    tokenStake: tokenStake.address,
    amount: 10n,
  });
  await client.finalizeUnstakeToken({
    owner,
    tokenStake: tokenStake.address,
    identity: identity.address,
    mint: mint.address,
    ownerTokenAccount: ownerTokenAccount.address,
    vault: tokenStake.vault,
  });
  await client.slashTokenWithAuthority({
    slashAuthority: adjudicator,
    identity: identity.address,
    tokenStake: tokenStake.address,
    disputeReceipt: tokenAuthorityDisputeReceipt.address,
    mint: mint.address,
    vault: tokenStake.vault,
    treasuryTokenVault: treasury.treasuryTokenVault,
    amount: 5n,
  });
  const tokenSlash = await client.slashTokenWithVerdict({
    adjudicator,
    identity: identity.address,
    tokenStake: tokenStake.address,
    disputeReceipt: tokenVerdictDisputeReceipt.address,
    mint: mint.address,
    vault: tokenStake.vault,
    treasuryTokenVault: treasury.treasuryTokenVault,
  });

  strictEqual(tokenStake.mint, mint.address);
  strictEqual(tokenSlash.tokenStake, tokenStake.address);
  strictEqual(tokenSlash.treasuryTokenVault, treasury.treasuryTokenVault);
  strictEqual(
    sentKinds.join(","),
    [
      "initialize_token_stake",
      "initialize_token_treasury_vault",
      "request_unstake",
      "finalize_unstake",
      "slash_with_authority",
      "stake_token",
      "request_unstake_token",
      "finalize_unstake_token",
      "slash_token_with_authority",
      "slash_token_with_verdict",
    ].join(","),
  );
  strictEqual(feePayers[0], owner.address);
  strictEqual(feePayers.at(-1), adjudicator.address);
});

test("dispatcher observes sent signatures through RPC status polling", async () => {
  const authority = await generateKeyPairSigner();
  const observedSignatures: string[][] = [];
  let sentTransaction = "";
  const dispatcher = new KitTransactionDispatcher(
    {
      getLatestBlockhash: () => ({
        send: async () => ({ value: DUMMY_BLOCKHASH_LIFETIME }),
      }),
      sendTransaction: (transaction: string) => ({
        send: async () => {
          sentTransaction = transaction;
          return "fake_signature";
        },
      }),
      getSignatureStatuses: (signatures: string[]) => ({
        send: async () => {
          observedSignatures.push(signatures);
          return {
            value: [
              {
                err: null,
                confirmationStatus: "processed",
              },
            ],
          };
        },
      }),
      getSlot: () => ({
        send: async () => 42n,
      }),
    } as never,
    {} as never,
    "processed",
  );

  const result = await dispatcher.send([], authority);

  strictEqual(result.slot, 42);
  strictEqual(sentTransaction.length > 0, true);
  strictEqual(observedSignatures.length, 1);
  strictEqual(observedSignatures[0]?.length, 1);
  strictEqual(result.signature, observedSignatures[0]?.[0]);
});
