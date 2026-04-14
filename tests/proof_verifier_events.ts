import * as anchor from "@anchor-lang/core";
import { Program } from "@anchor-lang/core";
import { strictEqual, ok } from "assert";
import { IdentityRegistry } from "../target/types/identity_registry";
import { ProofVerifier } from "../target/types/proof_verifier";
import {
  OnchainMerkleTree,
  hashLeafBytes,
} from "../packages/sdk/src/onchain-merkle";

const IDENTITY_SEED = "identity";
const CHECKPOINT_SEED = "checkpoint";
const LATEST_CHECKPOINT_SEED = "latest_checkpoint";
const EPOCH_NUMBER = 1;
const NEXT_EPOCH_NUMBER = 2;

describe("proof_verifier structured events", () => {
  anchor.setProvider(anchor.AnchorProvider.env());

  const provider = anchor.AnchorProvider.env();
  const authority = provider.wallet.publicKey;
  const identityProgram = anchor.workspace
    .identityRegistry as Program<IdentityRegistry>;
  const proofProgram = anchor.workspace.proofVerifier as Program<ProofVerifier>;

  let historyUpdater: anchor.web3.PublicKey;
  before(async () => {
    const [pda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("history_updater", "utf8")],
      proofProgram.programId
    );
    historyUpdater = pda;
    try {
      await proofProgram.account.historyUpdater.fetch(historyUpdater);
    } catch {
      await proofProgram.methods
        .initializeHistoryUpdater()
        .accountsStrict({
          payer: authority,
          historyUpdater,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();
    }
  });

  it("emits CheckpointCreated, InclusionVerified, and CheckpointRotated events", async () => {
    const agentId = bytes32(701);
    const policyRoot = bytes32(702);
    const historyRoot = bytes32(703);

    const [identity] = pda(identityProgram, [
      seed(IDENTITY_SEED),
      authority.toBuffer(),
      asBuffer(agentId),
    ]);
    const [checkpoint] = pda(proofProgram, [
      seed(CHECKPOINT_SEED),
      identity.toBuffer(),
      u64(EPOCH_NUMBER),
    ]);
    const [latestCheckpoint] = pda(proofProgram, [
      seed(LATEST_CHECKPOINT_SEED),
      identity.toBuffer(),
    ]);
    const [nextCheckpoint] = pda(proofProgram, [
      seed(CHECKPOINT_SEED),
      identity.toBuffer(),
      u64(NEXT_EPOCH_NUMBER),
    ]);

    await identityProgram.methods
      .createIdentity(agentId, policyRoot, historyRoot)
      .accountsStrict({
        identity,
        authority,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    const receiptLeaves = [asBuffer(bytes32(704)), asBuffer(bytes32(705))];
    const merkleTree = new OnchainMerkleTree(receiptLeaves);
    const leafCount = receiptLeaves.length;
    const checkpointRoot = Array.from(merkleTree.root);

    const createdEvent = await captureEvent(
      proofProgram,
      "checkpointCreated",
      async () => {
        await proofProgram.methods
          .checkpointHistory(
            new anchor.BN(EPOCH_NUMBER),
            checkpointRoot,
            new anchor.BN(leafCount)
          )
          .accountsStrict({
            authority,
            identity,
            checkpoint,
            latestCheckpoint,
            historyUpdater,
            identityRegistryProgram: identityProgram.programId,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .rpc();
      }
    );

    strictEqual(createdEvent.identity.toBase58(), identity.toBase58());
    strictEqual(createdEvent.epoch.toNumber(), EPOCH_NUMBER);
    strictEqual(createdEvent.leafCount.toNumber(), leafCount);
    ok(Buffer.from(createdEvent.root).equals(Buffer.from(checkpointRoot)));
    ok(Number(createdEvent.slot) > 0);

    await new Promise((r) => setTimeout(r, 500));

    const completionLeafHash = Array.from(hashLeafBytes(receiptLeaves[1]));
    const completionProof = merkleTree.getProof(1);

    const verifiedEvent = await captureEvent(
      proofProgram,
      "inclusionVerified",
      async () => {
        await proofProgram.methods
          .verifyReceiptInclusion(
            completionLeafHash,
            new anchor.BN(completionProof.index),
            completionProof.siblings.map((sibling) => Array.from(sibling))
          )
          .accountsStrict({
            checkpoint,
            latestCheckpoint,
          })
          .rpc();
      }
    );

    strictEqual(verifiedEvent.identity.toBase58(), identity.toBase58());
    strictEqual(verifiedEvent.checkpoint.toBase58(), checkpoint.toBase58());
    ok(
      Buffer.from(verifiedEvent.receipt).equals(Buffer.from(completionLeafHash))
    );
    ok(Number(verifiedEvent.slot) > 0);

    await new Promise((r) => setTimeout(r, 500));

    const rotatedRoot = bytes32(706);
    const rotatedEvent = await captureEvent(
      proofProgram,
      "checkpointRotated",
      async () => {
        await proofProgram.methods
          .rotateCheckpoint(
            new anchor.BN(NEXT_EPOCH_NUMBER),
            rotatedRoot,
            new anchor.BN(leafCount + 1)
          )
          .accountsStrict({
            authority,
            identity,
            previousCheckpoint: checkpoint,
            checkpoint: nextCheckpoint,
            latestCheckpoint,
            historyUpdater,
            identityRegistryProgram: identityProgram.programId,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .rpc();
      }
    );

    strictEqual(rotatedEvent.identity.toBase58(), identity.toBase58());
    strictEqual(rotatedEvent.epoch.toNumber(), NEXT_EPOCH_NUMBER);
    ok(
      Buffer.from(rotatedEvent.previousRoot).equals(Buffer.from(checkpointRoot))
    );
    ok(Buffer.from(rotatedEvent.newRoot).equals(Buffer.from(rotatedRoot)));
    strictEqual(rotatedEvent.leafCount.toNumber(), leafCount + 1);
    ok(Number(rotatedEvent.slot) > 0);
  });
});

function pda<T>(
  program: Program<T>,
  seeds: Array<Buffer>
): [anchor.web3.PublicKey, number] {
  return anchor.web3.PublicKey.findProgramAddressSync(seeds, program.programId);
}

function seed(value: string): Buffer {
  return Buffer.from(value, "utf8");
}

function bytes32(value: number): number[] {
  return Array.from(Buffer.alloc(32, value));
}

function asBuffer(value: number[]): Buffer {
  return Buffer.from(value);
}

function u64(value: number): Buffer {
  return new anchor.BN(value).toArrayLike(Buffer, "le", 8);
}

async function captureEvent<T>(
  program: Program<any>,
  eventName: string,
  action: () => Promise<void>,
  timeoutMs = 10000
): Promise<T> {
  return new Promise(async (resolve, reject) => {
    let resolved = false;
    const listener = program.addEventListener(eventName, (event) => {
      if (!resolved) {
        resolved = true;
        resolve(event as T);
      }
    });

    await new Promise((r) => setTimeout(r, 300));

    action().catch((err) => {
      if (!resolved) {
        resolved = true;
        reject(err);
      }
    });

    setTimeout(() => {
      program.removeEventListener(listener);
      if (!resolved) {
        resolved = true;
        reject(new Error(`Timeout waiting for ${eventName}`));
      }
    }, timeoutMs);
  });
}
