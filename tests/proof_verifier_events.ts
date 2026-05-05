import * as anchor from "@anchor-lang/core";
import { Program } from "@anchor-lang/core";
import { strictEqual, ok } from "assert";
import { IdentityRegistry } from "../target/types/identity_registry";
import { ProofVerifier } from "../target/types/proof_verifier";
import { ReceiptEmitter } from "../target/types/receipt_emitter";
import { ReputationAccumulator } from "../target/types/reputation_accumulator";
import { TaskRegistry } from "../target/types/task_registry";
import {
  OnchainMerkleTree,
  hashLeafBytes,
} from "../packages/sdk/src/onchain-merkle";

const IDENTITY_SEED = "identity";
const TASK_SEED = "task";
const RECEIPT_SEED = "receipt";
const CHECKPOINT_SEED = "checkpoint";
const LATEST_CHECKPOINT_SEED = "latest_checkpoint";
const EPOCH_NUMBER = 1;
const NEXT_EPOCH_NUMBER = 2;
const COMPLETION_RECEIPT_KIND = 3;
const SUBTASK_COUNT = 1;
const CHECKPOINT_APPENDED_EVENT = "checkpointReceiptAppended";

describe("proof_verifier structured events", () => {
  anchor.setProvider(anchor.AnchorProvider.env());

  const provider = anchor.AnchorProvider.env();
  const authority = provider.wallet.publicKey;
  const identityProgram = anchor.workspace
    .identityRegistry as Program<IdentityRegistry>;
  const taskProgram = anchor.workspace.taskRegistry as Program<TaskRegistry>;
  const receiptProgram = anchor.workspace
    .receiptEmitter as Program<ReceiptEmitter>;
  const proofProgram = anchor.workspace.proofVerifier as Program<ProofVerifier>;
  const reputationProgram = anchor.workspace
    .reputationAccumulator as Program<ReputationAccumulator>;

  let cpiAuthority: anchor.web3.PublicKey;
  let domainCatalog: anchor.web3.PublicKey;
  let historyUpdater: anchor.web3.PublicKey;
  before(async () => {
    const [cpiAuthorityPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("cpi_authority", "utf8")],
      receiptProgram.programId,
    );
    cpiAuthority = cpiAuthorityPda;
    try {
      await receiptProgram.account.cpiAuthority.fetch(cpiAuthority);
    } catch {
      await receiptProgram.methods
        .initializeCpiAuthority()
        .accountsStrict({
          payer: authority,
          cpiAuthority,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();
    }

    const [pda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("history_updater", "utf8")],
      proofProgram.programId,
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

    const [domainCatalogPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("domain_catalog", "utf8")],
      reputationProgram.programId,
    );
    domainCatalog = domainCatalogPda;
    try {
      await reputationProgram.account.reputationDomainCatalog.fetch(
        domainCatalog,
      );
    } catch {
      await reputationProgram.methods
        .initializeDomainCatalog()
        .accountsStrict({
          curator: authority,
          domainCatalog,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();
    }
  });

  it("emits checkpoint lifecycle events for initialize, append, inclusion, and rotate", async () => {
    const agentId = bytes32(701);
    const taskId = bytes32(704);
    const receiptId = bytes32(705);
    const policyRoot = bytes32(702);
    const historyRoot = bytes32(703);

    const [identity] = pda(identityProgram, [
      seed(IDENTITY_SEED),
      authority.toBuffer(),
      asBuffer(agentId),
    ]);
    const [task] = pda(taskProgram, [
      seed(TASK_SEED),
      identity.toBuffer(),
      asBuffer(taskId),
    ]);
    const [receipt] = pda(receiptProgram, [
      seed(RECEIPT_SEED),
      identity.toBuffer(),
      task.toBuffer(),
      asBuffer(receiptId),
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

    await taskProgram.methods
      .createTask(taskId, bytes32(706), SUBTASK_COUNT, bytes32(0))
      .accountsStrict({
        authority,
        identity,
        task,
        identityRegistryProgram: identityProgram.programId,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    const createdEvent = await captureEvent(
      proofProgram,
      "checkpointCreated",
      async () => {
        await proofProgram.methods
          .initializeCheckpoint(new anchor.BN(EPOCH_NUMBER))
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
      },
    );

    strictEqual(createdEvent.identity.toBase58(), identity.toBase58());
    strictEqual(createdEvent.epoch.toNumber(), EPOCH_NUMBER);
    strictEqual(createdEvent.leafCount.toNumber(), 0);
    ok(Buffer.from(createdEvent.root).equals(Buffer.alloc(32, 0)));
    ok(Number(createdEvent.slot) > 0);

    await new Promise((r) => setTimeout(r, 500));

    await receiptProgram.methods
      .emitReceipt(
        receiptId,
        COMPLETION_RECEIPT_KIND,
        new anchor.BN(1),
        bytes32(0),
        bytes32(0),
        bytes32(707),
      )
      .accountsStrict({
        authority,
        identity,
        task,
        receipt,
        domainCatalog,
        systemProgram: anchor.web3.SystemProgram.programId,
        cpiAuthority,
        taskRegistryProgram: taskProgram.programId,
      })
      .rpc();

    const receiptLeaves = [receipt.toBuffer()];
    const merkleTree = new OnchainMerkleTree(receiptLeaves);

    const appendedEvent = await captureEvent(
      proofProgram,
      CHECKPOINT_APPENDED_EVENT,
      async () => {
        await proofProgram.methods
          .appendReceiptToCheckpoint()
          .accountsStrict({
            identity,
            checkpoint,
            latestCheckpoint,
            receipt,
            historyUpdater,
            identityRegistryProgram: identityProgram.programId,
          })
          .rpc();
      },
    );

    strictEqual(appendedEvent.identity.toBase58(), identity.toBase58());
    strictEqual(appendedEvent.checkpoint.toBase58(), checkpoint.toBase58());
    strictEqual(appendedEvent.leafCount.toNumber(), 1);
    strictEqual(appendedEvent.receipt.toBase58(), receipt.toBase58());
    ok(Number(appendedEvent.slot) > 0);

    await new Promise((r) => setTimeout(r, 500));

    const completionLeafHash = Array.from(hashLeafBytes(receiptLeaves[0]));
    const checkpointRoot = completionLeafHash;
    const completionProof = merkleTree.getProof(0);

    const verifiedEvent = await captureEvent(
      proofProgram,
      "inclusionVerified",
      async () => {
        await proofProgram.methods
          .verifyReceiptInclusion(
            completionLeafHash,
            new anchor.BN(completionProof.index),
            completionProof.siblings.map((sibling) => Array.from(sibling)),
          )
          .accountsStrict({
            checkpoint,
            latestCheckpoint,
          })
          .rpc();
      },
    );

    strictEqual(verifiedEvent.identity.toBase58(), identity.toBase58());
    strictEqual(verifiedEvent.checkpoint.toBase58(), checkpoint.toBase58());
    ok(
      Buffer.from(verifiedEvent.receipt).equals(
        Buffer.from(completionLeafHash),
      ),
    );
    ok(Number(verifiedEvent.slot) > 0);

    await new Promise((r) => setTimeout(r, 500));

    const rotatedEvent = await captureEvent(
      proofProgram,
      "checkpointRotated",
      async () => {
        await proofProgram.methods
          .rotateCheckpoint(new anchor.BN(NEXT_EPOCH_NUMBER))
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
      },
    );

    strictEqual(rotatedEvent.identity.toBase58(), identity.toBase58());
    strictEqual(rotatedEvent.epoch.toNumber(), NEXT_EPOCH_NUMBER);
    ok(
      Buffer.from(rotatedEvent.previousRoot).equals(
        Buffer.from(checkpointRoot),
      ),
    );
    ok(Buffer.from(rotatedEvent.newRoot).equals(Buffer.alloc(32, 0)));
    strictEqual(rotatedEvent.leafCount.toNumber(), 0);
    ok(Number(rotatedEvent.slot) > 0);
  });
});

function pda<T>(
  program: Program<T>,
  seeds: Array<Buffer>,
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
  timeoutMs = 10000,
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
