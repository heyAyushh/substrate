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
const RECEIPT_CHAIN_SEED = "receipt_chain";
const DELEGATION_SEED = "delegation";
const CHECKPOINT_SEED = "checkpoint";
const REPUTATION_SEED = "reputation";
const LATEST_CHECKPOINT_SEED = "latest_checkpoint";
const TASK_RECEIPT_APPLICATION_SEED = "task_receipt_application";
const REPUTATION_RECEIPT_APPLICATION_SEED = "reputation_receipt_application";
const ASSIGNMENT_ACTION_MASK = 1 << 0;
const HANDOFF_ACTION_MASK = 1 << 1;
const COMPLETION_ACTION_MASK = 1 << 2;
const INVALID_ACTION_MASK = 1 << 7;
const ASSIGNMENT_RECEIPT_KIND = 1;
const HANDOFF_RECEIPT_KIND = 2;
const COMPLETION_RECEIPT_KIND = 3;
const DISPUTE_RESOLVED_RECEIPT_KIND = 5;
const TASK_STATUS_COMPLETED = 2;
const EPOCH_NUMBER = 1;
const NEXT_EPOCH_NUMBER = 2;
const SUBTASK_COUNT = 2;
const NO_WEIGHT_OVERRIDE = new anchor.BN(0);
const MAX_U64 = new anchor.BN("18446744073709551615");

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
    const receiptChain = receiptChainPda(identity, task);
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
    const [latestCheckpoint] = pda(proofProgram, [
      seed(LATEST_CHECKPOINT_SEED),
      identity.toBuffer(),
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
    const [taskReceiptApplication] = pda(taskProgram, [
      seed(TASK_RECEIPT_APPLICATION_SEED),
      task.toBuffer(),
      receipt.toBuffer(),
    ]);
    const [reputationReceiptApplication] = pda(reputationProgram, [
      seed(REPUTATION_RECEIPT_APPLICATION_SEED),
      reputation.toBuffer(),
      receipt.toBuffer(),
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
        new anchor.BN(1),
        domain,
        previousReceipt,
        payloadHash
      )
      .accountsStrict({
        delegate: delegate.publicKey,
        identity,
        delegation,
        task,
        receiptChain,
        receipt: delegatedReceipt,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([delegate])
      .rpc();

    await receiptProgram.methods
      .emitReceipt(
        completionReceiptId,
        COMPLETION_RECEIPT_KIND,
        new anchor.BN(2),
        domain,
        pubkeyBytes(delegatedReceipt),
        payloadHash
      )
      .accountsStrict({
        authority,
        identity,
        task,
        receiptChain,
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
        receiptApplication: taskReceiptApplication,
        systemProgram: anchor.web3.SystemProgram.programId,
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
        latestCheckpoint,
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
        latestCheckpoint,
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
        latestCheckpoint,
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
        receiptApplication: reputationReceiptApplication,
        systemProgram: anchor.web3.SystemProgram.programId,
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

  it("returns specific errors for invalid receipt and delegation actions", async () => {
    const setup = await createIdentityAndTask(101, 102);
    const otherSetup = await createIdentityAndTask(103, 104);
    const delegateKeypair = anchor.web3.Keypair.generate();
    const domain = bytes32(105);
    const previousReceipt = bytes32(0);
    const payloadHash = bytes32(106);

    await fund(delegateKeypair.publicKey);

    const [invalidDelegation] = pda(delegationProgram, [
      seed(DELEGATION_SEED),
      setup.identity.toBuffer(),
      delegateKeypair.publicKey.toBuffer(),
    ]);

    await expectAnchorError(
      delegationProgram.methods
        .createDelegation(INVALID_ACTION_MASK, new anchor.BN(0))
        .accountsStrict({
          authority,
          identity: setup.identity,
          delegate: delegateKeypair.publicKey,
          delegation: invalidDelegation,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc(),
      "InvalidDelegationScope"
    );

    await delegationProgram.methods
      .createDelegation(ASSIGNMENT_ACTION_MASK, new anchor.BN(0))
      .accountsStrict({
        authority,
        identity: setup.identity,
        delegate: delegateKeypair.publicKey,
        delegation: invalidDelegation,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    const [delegatedCompletionReceipt] = pda(receiptProgram, [
      seed(RECEIPT_SEED),
      setup.identity.toBuffer(),
      setup.task.toBuffer(),
      asBuffer(bytes32(107)),
    ]);

    await expectAnchorError(
      receiptProgram.methods
        .emitDelegatedReceipt(
          bytes32(107),
          COMPLETION_RECEIPT_KIND,
          new anchor.BN(1),
          domain,
          previousReceipt,
          payloadHash
        )
        .accountsStrict({
          delegate: delegateKeypair.publicKey,
          identity: setup.identity,
          delegation: invalidDelegation,
          task: setup.task,
          receiptChain: receiptChainPda(setup.identity, setup.task),
          receipt: delegatedCompletionReceipt,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([delegateKeypair])
        .rpc(),
      "DelegationScopeMismatch"
    );

    const [invalidKindReceipt] = pda(receiptProgram, [
      seed(RECEIPT_SEED),
      setup.identity.toBuffer(),
      setup.task.toBuffer(),
      asBuffer(bytes32(108)),
    ]);

    await expectAnchorError(
      receiptProgram.methods
        .emitReceipt(
          bytes32(108),
          255,
          new anchor.BN(1),
          domain,
          previousReceipt,
          payloadHash
        )
        .accountsStrict({
          authority,
          identity: setup.identity,
          task: setup.task,
          receiptChain: receiptChainPda(setup.identity, setup.task),
          receipt: invalidKindReceipt,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc(),
      "InvalidReceiptKind"
    );

    const [wrongIdentityReceipt] = pda(receiptProgram, [
      seed(RECEIPT_SEED),
      setup.identity.toBuffer(),
      otherSetup.task.toBuffer(),
      asBuffer(bytes32(109)),
    ]);

    await expectAnchorError(
      receiptProgram.methods
        .emitReceipt(
          bytes32(109),
          COMPLETION_RECEIPT_KIND,
          new anchor.BN(1),
          domain,
          previousReceipt,
          payloadHash
        )
        .accountsStrict({
          authority,
          identity: setup.identity,
          task: otherSetup.task,
          receiptChain: receiptChainPda(setup.identity, otherSetup.task),
          receipt: wrongIdentityReceipt,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc(),
      "TaskIdentityMismatch"
    );
  });

  it("returns specific errors for stale checkpoint rotation", async () => {
    const setup = await createIdentityAndTask(111, 112);
    const checkpointRoot = bytes32(113);
    const initialLeafCount = new anchor.BN(4);
    const [checkpoint] = pda(proofProgram, [
      seed(CHECKPOINT_SEED),
      setup.identity.toBuffer(),
      u64(EPOCH_NUMBER),
    ]);
    const latestCheckpoint = latestCheckpointPda(setup.identity);

    await proofProgram.methods
      .checkpointHistory(
        new anchor.BN(EPOCH_NUMBER),
        checkpointRoot,
        initialLeafCount
      )
      .accountsStrict({
        authority,
        identity: setup.identity,
        checkpoint,
        latestCheckpoint,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    const [skippedCheckpoint] = pda(proofProgram, [
      seed(CHECKPOINT_SEED),
      setup.identity.toBuffer(),
      u64(3),
    ]);

    await expectAnchorError(
      proofProgram.methods
        .rotateCheckpoint(new anchor.BN(3), bytes32(114), initialLeafCount)
        .accountsStrict({
          authority,
          identity: setup.identity,
          previousCheckpoint: checkpoint,
          checkpoint: skippedCheckpoint,
          latestCheckpoint,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc(),
      "CheckpointEpochNotSequential"
    );

    const [regressedCheckpoint] = pda(proofProgram, [
      seed(CHECKPOINT_SEED),
      setup.identity.toBuffer(),
      u64(NEXT_EPOCH_NUMBER),
    ]);

    await expectAnchorError(
      proofProgram.methods
        .rotateCheckpoint(
          new anchor.BN(NEXT_EPOCH_NUMBER),
          bytes32(115),
          new anchor.BN(3)
        )
        .accountsStrict({
          authority,
          identity: setup.identity,
          previousCheckpoint: checkpoint,
          checkpoint: regressedCheckpoint,
          latestCheckpoint,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc(),
      "CheckpointLeafCountRegression"
    );

    const overflowSetup = await createIdentityAndTask(118, 119);
    const [maxEpochCheckpoint] = pda(proofProgram, [
      seed(CHECKPOINT_SEED),
      overflowSetup.identity.toBuffer(),
      u64Bn(MAX_U64),
    ]);
    const latestMaxEpochCheckpoint = latestCheckpointPda(
      overflowSetup.identity
    );

    await proofProgram.methods
      .checkpointHistory(MAX_U64, bytes32(116), new anchor.BN(1))
      .accountsStrict({
        authority,
        identity: overflowSetup.identity,
        checkpoint: maxEpochCheckpoint,
        latestCheckpoint: latestMaxEpochCheckpoint,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    const [overflowCheckpoint] = pda(proofProgram, [
      seed(CHECKPOINT_SEED),
      overflowSetup.identity.toBuffer(),
      u64(0),
    ]);

    await expectAnchorError(
      proofProgram.methods
        .rotateCheckpoint(new anchor.BN(0), bytes32(117), new anchor.BN(1))
        .accountsStrict({
          authority,
          identity: overflowSetup.identity,
          previousCheckpoint: maxEpochCheckpoint,
          checkpoint: overflowCheckpoint,
          latestCheckpoint: latestMaxEpochCheckpoint,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc(),
      "CheckpointEpochOverflow"
    );
  });

  it("rejects inclusion proofs against stale checkpoints", async () => {
    const setup = await createIdentityAndTask(151, 152);
    const receiptLeaves = [asBuffer(bytes32(153)), asBuffer(bytes32(154))];
    const merkleTree = new OnchainMerkleTree(receiptLeaves);
    const [checkpoint] = pda(proofProgram, [
      seed(CHECKPOINT_SEED),
      setup.identity.toBuffer(),
      u64(EPOCH_NUMBER),
    ]);
    const [nextCheckpoint] = pda(proofProgram, [
      seed(CHECKPOINT_SEED),
      setup.identity.toBuffer(),
      u64(NEXT_EPOCH_NUMBER),
    ]);
    const latestCheckpoint = latestCheckpointPda(setup.identity);

    await proofProgram.methods
      .checkpointHistory(
        new anchor.BN(EPOCH_NUMBER),
        Array.from(merkleTree.root),
        new anchor.BN(receiptLeaves.length)
      )
      .accountsStrict({
        authority,
        identity: setup.identity,
        checkpoint,
        latestCheckpoint,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    await proofProgram.methods
      .rotateCheckpoint(
        new anchor.BN(NEXT_EPOCH_NUMBER),
        bytes32(155),
        new anchor.BN(receiptLeaves.length + 1)
      )
      .accountsStrict({
        authority,
        identity: setup.identity,
        previousCheckpoint: checkpoint,
        checkpoint: nextCheckpoint,
        latestCheckpoint,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    const proof = merkleTree.getProof(0);
    await expectAnchorError(
      proofProgram.methods
        .verifyReceiptInclusion(
          Array.from(hashLeafBytes(receiptLeaves[0])),
          new anchor.BN(proof.index),
          proof.siblings.map((sibling) => Array.from(sibling))
        )
        .accountsStrict({
          checkpoint,
          latestCheckpoint,
        })
        .rpc(),
      "StaleCheckpoint"
    );
  });

  it("rejects duplicate task and reputation receipt applications", async () => {
    const setup = await createIdentityAndTask(161, 162);
    const domain = bytes32(163);
    const receiptId = bytes32(164);
    const [receipt] = pda(receiptProgram, [
      seed(RECEIPT_SEED),
      setup.identity.toBuffer(),
      setup.task.toBuffer(),
      asBuffer(receiptId),
    ]);
    const [reputation] = pda(reputationProgram, [
      seed(REPUTATION_SEED),
      setup.identity.toBuffer(),
      asBuffer(domain),
    ]);
    const taskReceiptApplication = taskReceiptApplicationPda(
      setup.task,
      receipt
    );
    const reputationReceiptApplication = reputationReceiptApplicationPda(
      reputation,
      receipt
    );

    await receiptProgram.methods
      .emitReceipt(
        receiptId,
        COMPLETION_RECEIPT_KIND,
        new anchor.BN(1),
        domain,
        bytes32(0),
        bytes32(165)
      )
      .accountsStrict({
        authority,
        identity: setup.identity,
        task: setup.task,
        receiptChain: receiptChainPda(setup.identity, setup.task),
        receipt,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    await taskProgram.methods
      .syncTaskStatus()
      .accountsStrict({
        authority,
        identity: setup.identity,
        task: setup.task,
        receipt,
        receiptApplication: taskReceiptApplication,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    await expectAnchorError(
      taskProgram.methods
        .syncTaskStatus()
        .accountsStrict({
          authority,
          identity: setup.identity,
          task: setup.task,
          receipt,
          receiptApplication: taskReceiptApplication,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc(),
      "ReceiptAlreadyAppliedToTask"
    );

    await reputationProgram.methods
      .createReputationDomain(
        domain,
        NO_WEIGHT_OVERRIDE,
        NO_WEIGHT_OVERRIDE,
        NO_WEIGHT_OVERRIDE
      )
      .accountsStrict({
        authority,
        identity: setup.identity,
        reputation,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    await reputationProgram.methods
      .applyReputationReceipt()
      .accountsStrict({
        authority,
        identity: setup.identity,
        receipt,
        reputation,
        receiptApplication: reputationReceiptApplication,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    await expectAnchorError(
      reputationProgram.methods
        .applyReputationReceipt()
        .accountsStrict({
          authority,
          identity: setup.identity,
          receipt,
          reputation,
          receiptApplication: reputationReceiptApplication,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc(),
      "ReceiptAlreadyAppliedToReputation"
    );
  });

  it("rejects reputation writes for the wrong agent identity", async () => {
    const setup = await createIdentityAndTask(121, 122);
    const otherSetup = await createIdentityAndTask(123, 124);
    const domain = bytes32(125);
    const receiptId = bytes32(126);
    const [receipt] = pda(receiptProgram, [
      seed(RECEIPT_SEED),
      setup.identity.toBuffer(),
      setup.task.toBuffer(),
      asBuffer(receiptId),
    ]);
    const [otherReputation] = pda(reputationProgram, [
      seed(REPUTATION_SEED),
      otherSetup.identity.toBuffer(),
      asBuffer(domain),
    ]);
    const otherReceiptApplication = reputationReceiptApplicationPda(
      otherReputation,
      receipt
    );

    await receiptProgram.methods
      .emitReceipt(
        receiptId,
        COMPLETION_RECEIPT_KIND,
        new anchor.BN(1),
        domain,
        bytes32(0),
        bytes32(127)
      )
      .accountsStrict({
        authority,
        identity: setup.identity,
        task: setup.task,
        receiptChain: receiptChainPda(setup.identity, setup.task),
        receipt,
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
        identity: otherSetup.identity,
        reputation: otherReputation,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    await expectAnchorError(
      reputationProgram.methods
        .applyReputationReceipt()
        .accountsStrict({
          authority,
          identity: setup.identity,
          receipt,
          reputation: otherReputation,
          receiptApplication: otherReceiptApplication,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc(),
      "ReputationIdentityMismatch"
    );
  });

  it("rejects receipt kinds that do not affect reputation", async () => {
    const setup = await createIdentityAndTask(141, 142);
    const domain = bytes32(143);
    const receiptId = bytes32(144);
    const [receipt] = pda(receiptProgram, [
      seed(RECEIPT_SEED),
      setup.identity.toBuffer(),
      setup.task.toBuffer(),
      asBuffer(receiptId),
    ]);
    const [reputation] = pda(reputationProgram, [
      seed(REPUTATION_SEED),
      setup.identity.toBuffer(),
      asBuffer(domain),
    ]);
    const receiptApplication = reputationReceiptApplicationPda(
      reputation,
      receipt
    );

    await receiptProgram.methods
      .emitReceipt(
        receiptId,
        ASSIGNMENT_RECEIPT_KIND,
        new anchor.BN(1),
        domain,
        bytes32(0),
        bytes32(145)
      )
      .accountsStrict({
        authority,
        identity: setup.identity,
        task: setup.task,
        receiptChain: receiptChainPda(setup.identity, setup.task),
        receipt,
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
        identity: setup.identity,
        reputation,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    await expectAnchorError(
      reputationProgram.methods
        .applyReputationReceipt()
        .accountsStrict({
          authority,
          identity: setup.identity,
          receipt,
          reputation,
          receiptApplication,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc(),
      "ReceiptKindNotAppliedToReputation"
    );
  });

  it("returns a specific task-state error when resolving without a dispute", async () => {
    const setup = await createIdentityAndTask(131, 132);
    const receiptId = bytes32(133);
    const [receipt] = pda(receiptProgram, [
      seed(RECEIPT_SEED),
      setup.identity.toBuffer(),
      setup.task.toBuffer(),
      asBuffer(receiptId),
    ]);
    const receiptApplication = taskReceiptApplicationPda(setup.task, receipt);

    await receiptProgram.methods
      .emitReceipt(
        receiptId,
        DISPUTE_RESOLVED_RECEIPT_KIND,
        new anchor.BN(1),
        bytes32(134),
        bytes32(0),
        bytes32(135)
      )
      .accountsStrict({
        authority,
        identity: setup.identity,
        task: setup.task,
        receiptChain: receiptChainPda(setup.identity, setup.task),
        receipt,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    await expectAnchorError(
      taskProgram.methods
        .syncTaskStatus()
        .accountsStrict({
          authority,
          identity: setup.identity,
          task: setup.task,
          receipt,
          receiptApplication,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc(),
      "TaskDisputeRequiredForResolution"
    );
  });

  async function createIdentityAndTask(agentByte: number, taskByte: number) {
    const agentId = bytes32(agentByte);
    const taskId = bytes32(taskByte);
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

    await identityProgram.methods
      .createIdentity(agentId, bytes32(agentByte + 1), bytes32(agentByte + 2))
      .accountsStrict({
        identity,
        authority,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    await taskProgram.methods
      .createTask(taskId, bytes32(taskByte + 1), SUBTASK_COUNT)
      .accountsStrict({
        authority,
        identity,
        task,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    return { agentId, taskId, identity, task };
  }

  async function fund(publicKey: anchor.web3.PublicKey) {
    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(
        publicKey,
        2 * anchor.web3.LAMPORTS_PER_SOL
      )
    );
  }

  function latestCheckpointPda(identity: anchor.web3.PublicKey) {
    const [latestCheckpoint] = pda(proofProgram, [
      seed(LATEST_CHECKPOINT_SEED),
      identity.toBuffer(),
    ]);
    return latestCheckpoint;
  }

  function taskReceiptApplicationPda(
    task: anchor.web3.PublicKey,
    receipt: anchor.web3.PublicKey
  ) {
    const [receiptApplication] = pda(taskProgram, [
      seed(TASK_RECEIPT_APPLICATION_SEED),
      task.toBuffer(),
      receipt.toBuffer(),
    ]);
    return receiptApplication;
  }

  function receiptChainPda(
    identity: anchor.web3.PublicKey,
    task: anchor.web3.PublicKey
  ) {
    const [receiptChain] = pda(receiptProgram, [
      seed(RECEIPT_CHAIN_SEED),
      identity.toBuffer(),
      task.toBuffer(),
    ]);
    return receiptChain;
  }

  function reputationReceiptApplicationPda(
    reputation: anchor.web3.PublicKey,
    receipt: anchor.web3.PublicKey
  ) {
    const [receiptApplication] = pda(reputationProgram, [
      seed(REPUTATION_RECEIPT_APPLICATION_SEED),
      reputation.toBuffer(),
      receipt.toBuffer(),
    ]);
    return receiptApplication;
  }
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

function pubkeyBytes(value: anchor.web3.PublicKey): number[] {
  return Array.from(value.toBuffer());
}

function u64(value: number): Buffer {
  return new anchor.BN(value).toArrayLike(Buffer, "le", 8);
}

function u64Bn(value: anchor.BN): Buffer {
  return value.toArrayLike(Buffer, "le", 8);
}

async function expectAnchorError(
  promise: Promise<unknown>,
  expectedCode: string
) {
  try {
    await promise;
  } catch (error) {
    const actualCode = (error as { error?: { errorCode?: { code?: string } } })
      .error?.errorCode?.code;
    strictEqual(actualCode, expectedCode);
    return;
  }

  throw new Error(`Expected Anchor error ${expectedCode}`);
}
