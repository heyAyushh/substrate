import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { strictEqual } from "assert";
import { TrustSubstrate } from "../target/types/trust_substrate";

const IDENTITY_SEED = "identity";
const TASK_SEED = "task";
const RECEIPT_SEED = "receipt";
const DELEGATION_SEED = "delegation";
const CHECKPOINT_SEED = "checkpoint";
const REPUTATION_SEED = "reputation";
const ASSIGNMENT_ACTION_MASK = 1;
const HANDOFF_ACTION_MASK = 2;
const COMPLETION_RECEIPT_KIND = 3;
const EPOCH_NUMBER = 1;
const LEAF_COUNT = 1;
const SUBTASK_COUNT = 2;

describe("trust_substrate", () => {
  anchor.setProvider(anchor.AnchorProvider.env());

  const provider = anchor.AnchorProvider.env();
  const program = anchor.workspace.trustSubstrate as Program<TrustSubstrate>;
  const authority = provider.wallet.publicKey;
  const delegate = anchor.web3.Keypair.generate();

  it("records an identity, task, receipt graph, delegation, checkpoint, and reputation", async () => {
    const agentId = bytes32(11);
    const taskId = bytes32(22);
    const completionReceiptId = bytes32(33);
    const policyRoot = bytes32(44);
    const historyRoot = bytes32(55);
    const subtaskRoot = bytes32(66);
    const domain = bytes32(77);
    const previousReceipt = bytes32(0);
    const payloadHash = bytes32(88);
    const checkpointRoot = bytes32(99);
    const allowedActions = ASSIGNMENT_ACTION_MASK | HANDOFF_ACTION_MASK;

    const [identity] = pda(program, [
      seed(IDENTITY_SEED),
      authority.toBuffer(),
      asBuffer(agentId),
    ]);
    const [task] = pda(program, [
      seed(TASK_SEED),
      identity.toBuffer(),
      asBuffer(taskId),
    ]);
    const [receipt] = pda(program, [
      seed(RECEIPT_SEED),
      identity.toBuffer(),
      task.toBuffer(),
      asBuffer(completionReceiptId),
    ]);
    const [delegation] = pda(program, [
      seed(DELEGATION_SEED),
      identity.toBuffer(),
      delegate.publicKey.toBuffer(),
    ]);
    const [checkpoint] = pda(program, [
      seed(CHECKPOINT_SEED),
      identity.toBuffer(),
      u64(EPOCH_NUMBER),
    ]);
    const [reputation] = pda(program, [
      seed(REPUTATION_SEED),
      identity.toBuffer(),
      asBuffer(domain),
    ]);

    await program.methods
      .createIdentity(agentId, policyRoot, historyRoot)
      .accountsStrict({
        identity,
        authority,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    await program.methods
      .createTask(taskId, subtaskRoot, SUBTASK_COUNT)
      .accountsStrict({
        authority,
        identity,
        task,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    await program.methods
      .emitReceipt(
        completionReceiptId,
        COMPLETION_RECEIPT_KIND,
        new anchor.BN(LEAF_COUNT),
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

    await program.methods
      .createDelegation(allowedActions, new anchor.BN(0))
      .accountsStrict({
        authority,
        identity,
        delegate: delegate.publicKey,
        delegation,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    await program.methods
      .checkpointHistory(
        new anchor.BN(EPOCH_NUMBER),
        checkpointRoot,
        new anchor.BN(LEAF_COUNT)
      )
      .accountsStrict({
        authority,
        identity,
        checkpoint,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    await program.methods
      .createReputationDomain(domain)
      .accountsStrict({
        authority,
        identity,
        reputation,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    await program.methods
      .applyReputationReceipt()
      .accountsStrict({
        authority,
        identity,
        receipt,
        reputation,
      })
      .rpc();

    const identityAccount = await program.account.agentIdentity.fetch(identity);
    const taskAccount = await program.account.taskRecord.fetch(task);
    const receiptAccount = await program.account.receiptRecord.fetch(receipt);
    const delegationAccount = await program.account.delegationRecord.fetch(
      delegation
    );
    const checkpointAccount = await program.account.historyCheckpoint.fetch(
      checkpoint
    );
    const reputationAccount = await program.account.reputationAccumulator.fetch(
      reputation
    );

    strictEqual(identityAccount.authority.toBase58(), authority.toBase58());
    strictEqual(taskAccount.subtaskCount, SUBTASK_COUNT);
    strictEqual(receiptAccount.kind, COMPLETION_RECEIPT_KIND);
    strictEqual(delegationAccount.allowedActions, allowedActions);
    strictEqual(checkpointAccount.leafCount.toNumber(), LEAF_COUNT);
    strictEqual(reputationAccount.completed.toNumber(), LEAF_COUNT);
    strictEqual(reputationAccount.disputed.toNumber(), 0);
  });
});

function pda(
  program: Program<TrustSubstrate>,
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
