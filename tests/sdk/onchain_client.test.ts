import test from "node:test";
import { ok, rejects, strictEqual } from "node:assert/strict";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { address, generateKeyPairSigner, type Instruction } from "@solana/kit";

import {
  createIdentity,
  KitTransactionDispatcher,
  TrustSubstrateOnchainClient,
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

const DUMMY_BLOCKHASH_LIFETIME = {
  blockhash: "11111111111111111111111111111111",
  lastValidBlockHeight: 0n,
};
const MEMO_PROGRAM_ADDRESS = address(
  "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr",
);

const decodeInstructionData = (instruction: Instruction): string =>
  new TextDecoder().decode(
    (instruction as Instruction & { data: Uint8Array }).data,
  );

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
