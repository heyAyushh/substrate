import test from "node:test";
import { ok } from "node:assert/strict";
import { createRequire } from "node:module";
import {
  appendTransactionMessageInstructions,
  createTransactionMessage,
  generateKeyPairSigner,
  getTransactionEncoder,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
  TRANSACTION_SIZE_LIMIT,
} from "@solana/kit";

import { getCreateSocietyWorldInstructionAsync } from "../../packages/program-clients/dist/generated/task_registry/instructions/createSocietyWorld.js";

const require = createRequire(import.meta.url);
const {
  createLiveSocietySession,
  packOnchainSocietyWorldState,
} = require("../../examples/multi_agent/society_core.js");

const DUMMY_BLOCKHASH_LIFETIME = {
  blockhash: "11111111111111111111111111111111",
  lastValidBlockHeight: 0n,
};

const WORLD_SYNC_CONFIGS = [
  {
    agents: 8,
    ticks: 24,
    gridSize: 16,
    scenario: "genesis",
    seed: "world-sync-default",
  },
  {
    agents: 12,
    ticks: 10,
    gridSize: 18,
    scenario: "worldseed",
    seed: "world-sync-worldseed",
  },
  {
    agents: 40,
    ticks: 24,
    gridSize: 42,
    scenario: "dynasty",
    seed: "world-sync-max",
  },
] as const;

test("on-chain society world checkpoints stay inside the transaction size limit", async () => {
  const authority = await generateKeyPairSigner();
  const identity = await generateKeyPairSigner();
  const task = await generateKeyPairSigner();
  const societyWorld = await generateKeyPairSigner();

  for (const config of WORLD_SYNC_CONFIGS) {
    const session = createLiveSocietySession(config);
    const state = packOnchainSocietyWorldState(session);
    const instruction = await getCreateSocietyWorldInstructionAsync({
      authority,
      identity: identity.address,
      task: task.address,
      societyWorld: societyWorld.address,
      currentTick: session.currentTick,
      lastSequence: session.sequence,
      lastReceipt: "11111111111111111111111111111111",
      status: 0,
      state,
    });
    const transactionMessage = setTransactionMessageLifetimeUsingBlockhash(
      DUMMY_BLOCKHASH_LIFETIME,
      appendTransactionMessageInstructions(
        [instruction],
        setTransactionMessageFeePayerSigner(
          authority,
          createTransactionMessage({ version: "legacy" }),
        ),
      ),
    );
    const signed = await signTransactionMessageWithSigners(transactionMessage);
    const rawBytes = getTransactionEncoder().encode(signed).length;

    ok(
      rawBytes <= TRANSACTION_SIZE_LIMIT,
      `${config.seed} produced a ${rawBytes}-byte world-sync transaction`,
    );
  }
});
