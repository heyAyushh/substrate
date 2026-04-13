import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { strictEqual, ok } from "assert";
import { DelegationEngine } from "../target/types/delegation_engine";
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
const DELEGATION_SEED = "delegation";
const CHECKPOINT_SEED = "checkpoint";
const REPUTATION_SEED = "reputation";
const ASSIGNMENT_ACTION_MASK = 1 << 0;
const HANDOFF_ACTION_MASK = 1 << 1;
const COMPLETION_ACTION_MASK = 1 << 2;
const ASSIGNMENT_RECEIPT_KIND = 1;
const HANDOFF_RECEIPT_KIND = 2;
const COMPLETION_RECEIPT_KIND = 3;
const TASK_STATUS_COMPLETED = 2;
const EPOCH_NUMBER = 1;
const NEXT_EPOCH_NUMBER = 2;
const SUBTASK_COUNT = 2;
const NO_WEIGHT_OVERRIDE = new anchor.BN(0);

describe("trust_substrate protocol flow", () => {
  anchor.setProvider(anchor.AnchorProvider.env());

  const provider = anchor.AnchorProvider.env();
  const authority = provider.wallet.publicKey;
  const delegate = anchor.web3.Keypair.generate();
  const identityProgram = anchor.workspace
    .identityRegistry as Program<IdentityRegistry>;
  const taskProgram = anchor.workspace.taskRegistry as Program<TaskRegistry>;
  const receiptProgram = anchor.workspace
    .receiptEmitter as Program<ReceiptEmitter>;
  const delegationProgram = anchor.workspace
    .delegationEngine as Program<DelegationEngine>;
  const proofProgram = anchor.workspace.proofVerifier as Program<ProofVerifier>;
  const reputationProgram = anchor.workspace
    .reputationAccumulator as Program<ReputationAccumulator>;

  it("records the identity, task, receipt, delegation, checkpoint, and reputation graph", async () => {
    const agentId = bytes32(11);
    const taskId = bytes32(22);
    const completionReceiptId = bytes32(33);
    const delegatedHandoffReceiptId = bytes32(34);
    const policyRoot = bytes32(44);
    const historyRoot = bytes32(55);
    const subtaskRoot = bytes32(66);
    const domain = bytes32(77);
    const previousReceipt = bytes32(0);
    const payloadHash = bytes32(88);
    const allowedActions =
      ASSIGNMENT_ACTION_MASK | HANDOFF_ACTION_MASK | COMPLETION_ACTION_MASK;

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
      asBuffer(completionReceiptId),
    ]);
    const [delegatedReceipt] = pda(receiptProgram, [
      seed(RECEIPT_SEED),
      identity.toBuffer(),
      task.toBuffer(),
      asBuffer(delegatedHandoffReceiptId),
    ]);
    const [delegation] = pda(delegationProgram, [
      seed(DELEGATION_SEED),
      identity.toBuffer(),
      delegate.publicKey.toBuffer(),
    ]);
    const [checkpoint] = pda(proofProgram, [
      seed(CHECKPOINT_SEED),
      identity.toBuffer(),
      u64(EPOCH_NUMBER),
    ]);
    const [nextCheckpoint] = pda(proofProgram, [
      seed(CHECKPOINT_SEED),
      identity.toBuffer(),
      u64(NEXT_EPOCH_NUMBER),
    ]);
    const [reputation] = pda(reputationProgram, [
      seed(REPUTATION_SEED),
      identity.toBuffer(),
      asBuffer(domain),
    ]);

    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(
        delegate.publicKey,
        2 * anchor.web3.LAMPORTS_PER_SOL
      )
    );

    await identityProgram.methods
      .createIdentity(agentId, policyRoot, historyRoot)
      .accountsStrict({
        identity,
        authority,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    await taskProgram.methods
      .createTask(taskId, subtaskRoot, SUBTASK_COUNT)
      .accountsStrict({
        authority,
        identity,
        task,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    await delegationProgram.methods
      .createDelegation(allowedActions, new anchor.BN(0))
      .accountsStrict({
        authority,
        identity,
        delegate: delegate.publicKey,
        delegation,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    await receiptProgram.methods
      .emitDelegatedReceipt(
        delegatedHandoffReceiptId,
        HANDOFF_RECEIPT_KIND,
        new anchor.BN(0),
        domain,
        previousReceipt,
        payloadHash
      )
      .accountsStrict({
        delegate: delegate.publicKey,
        identity,
        delegation,
        task,
        receipt: delegatedReceipt,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([delegate])
      .rpc();

    await receiptProgram.methods
      .emitReceipt(
        completionReceiptId,
        COMPLETION_RECEIPT_KIND,
        new anchor.BN(1),
        domain,
        previousReceipt,
        payloadHash
      )
      .accountsStrict({
        authority,
        identity,
        task,
        receipt,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    await taskProgram.methods
      .syncTaskStatus()
      .accountsStrict({
        authority,
        identity,
        task,
        receipt,
      })
      .rpc();

    const receiptLeaves = [
      asBuffer(delegatedHandoffReceiptId),
      asBuffer(completionReceiptId),
    ];
    const merkleTree = new OnchainMerkleTree(receiptLeaves);
    const leafCount = receiptLeaves.length;
    const checkpointRoot = Array.from(merkleTree.root);

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
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    const completionLeafHash = Array.from(hashLeafBytes(receiptLeaves[1]));
    const completionProof = merkleTree.getProof(1);
    await proofProgram.methods
      .verifyReceiptInclusion(
        completionLeafHash,
        new anchor.BN(completionProof.index),
        completionProof.siblings.map((sibling) => Array.from(sibling))
      )
      .accountsStrict({
        checkpoint,
      })
      .rpc();

    const rotatedRoot = bytes32(123);
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
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    await reputationProgram.methods
      .createReputationDomain(
        domain,
        NO_WEIGHT_OVERRIDE,
        NO_WEIGHT_OVERRIDE,
        NO_WEIGHT_OVERRIDE
      )
      .accountsStrict({
        authority,
        identity,
        reputation,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    await reputationProgram.methods
      .applyReputationReceipt()
      .accountsStrict({
        authority,
        identity,
        receipt,
        reputation,
      })
      .rpc();

    const identityAccount = await identityProgram.account.agentIdentity.fetch(
      identity
    );
    const taskAccount = await taskProgram.account.taskRecord.fetch(task);
    const receiptAccount = await receiptProgram.account.receiptRecord.fetch(
      receipt
    );
    const delegatedReceiptAccount =
      await receiptProgram.account.receiptRecord.fetch(delegatedReceipt);
    const delegationAccount =
      await delegationProgram.account.delegationRecord.fetch(delegation);
    const checkpointAccount =
      await proofProgram.account.historyCheckpoint.fetch(checkpoint);
    const rotatedCheckpointAccount =
      await proofProgram.account.historyCheckpoint.fetch(nextCheckpoint);
    const reputationAccount =
      await reputationProgram.account.reputationAccumulator.fetch(reputation);

    strictEqual(identityAccount.authority.toBase58(), authority.toBase58());
    strictEqual(taskAccount.subtaskCount, SUBTASK_COUNT);
    strictEqual(taskAccount.status, TASK_STATUS_COMPLETED);
    strictEqual(taskAccount.completedCount, 1);
    strictEqual(receiptAccount.kind, COMPLETION_RECEIPT_KIND);
    strictEqual(
      receiptAccount.viaDelegation.toBase58(),
      anchor.web3.PublicKey.default.toBase58()
    );
    strictEqual(delegatedReceiptAccount.kind, HANDOFF_RECEIPT_KIND);
    strictEqual(
      delegatedReceiptAccount.actor.toBase58(),
      delegate.publicKey.toBase58()
    );
    strictEqual(
      delegatedReceiptAccount.viaDelegation.toBase58(),
      delegation.toBase58()
    );
    strictEqual(delegationAccount.allowedActions, allowedActions);
    strictEqual(checkpointAccount.leafCount.toNumber(), leafCount);
    strictEqual(rotatedCheckpointAccount.epoch.toNumber(), NEXT_EPOCH_NUMBER);
    ok(
      Buffer.from(rotatedCheckpointAccount.previousRoot).equals(
        Buffer.from(checkpointRoot)
      )
    );
    strictEqual(reputationAccount.completed.toNumber(), 1);
    strictEqual(reputationAccount.disputed.toNumber(), 0);
    ok(reputationAccount.completionWeight.toNumber() > 0);
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
