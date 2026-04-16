import * as anchor from "@anchor-lang/core";
import { Program } from "@anchor-lang/core";
import { strictEqual, ok } from "assert";
import { createHash } from "crypto";
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
import {
  ASSIGNMENT_KIND as ASSIGNMENT_RECEIPT_KIND,
  ASSIGNMENT_SCOPE_BIT,
  CHECKPOINT_SEED,
  COMPLETION_KIND as COMPLETION_RECEIPT_KIND,
  COMPLETION_SCOPE_BIT,
  DELEGATION_SEED,
  DISPUTE_RESOLVED_KIND as DISPUTE_RESOLVED_RECEIPT_KIND,
  HANDOFF_KIND as HANDOFF_RECEIPT_KIND,
  HANDOFF_SCOPE_BIT,
  IDENTITY_SEED,
  LATEST_CHECKPOINT_SEED,
  RECEIPT_SEED,
  REPUTATION_RECEIPT_APPLICATION_SEED,
  TASK_RECEIPT_APPLICATION_SEED,
  TASK_SEED,
  TASK_STATUS_COMPLETED,
} from "./helpers/protocol_constants";

const REPUTATION_SEED = "reputation";
const ASSIGNMENT_ACTION_MASK = ASSIGNMENT_SCOPE_BIT;
const HANDOFF_ACTION_MASK = HANDOFF_SCOPE_BIT;
const COMPLETION_ACTION_MASK = COMPLETION_SCOPE_BIT;
const INVALID_ACTION_MASK = 1 << 7;
const EPOCH_NUMBER = 1;
const NEXT_EPOCH_NUMBER = 2;
const SUBTASK_COUNT = 2;
const NO_WEIGHT_OVERRIDE = new anchor.BN(0);
const MAX_U64 = new anchor.BN("18446744073709551615");
const ZERO_BYTE = 0;
const TEST_RUN_NAMESPACE = anchor.web3.Keypair.generate().publicKey.toBase58();

describe("protocol_flow", () => {
  anchor.setProvider(anchor.AnchorProvider.env());
  let cpiAuthority: anchor.web3.PublicKey;
  let historyUpdater: anchor.web3.PublicKey;
  let domainCatalog: anchor.web3.PublicKey;
  before(async () => {
    const [pda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("cpi_authority", "utf8")],
      receiptProgram.programId
    );
    cpiAuthority = pda;
    try {
      await receiptProgram.account.cpiAuthority.fetch(cpiAuthority);
    } catch {
      await receiptProgram.methods
        .initializeCpiAuthority()
        .accountsStrict({
          payer: provider.wallet.publicKey,
          cpiAuthority,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();
    }

    const [historyPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("history_updater", "utf8")],
      proofProgram.programId
    );
    historyUpdater = historyPda;
    try {
      await proofProgram.account.historyUpdater.fetch(historyUpdater);
    } catch {
      await proofProgram.methods
        .initializeHistoryUpdater()
        .accountsStrict({
          payer: provider.wallet.publicKey,
          historyUpdater,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();
    }

    const [catalogPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("domain_catalog", "utf8")],
      reputationProgram.programId
    );
    domainCatalog = catalogPda;
    try {
      await reputationProgram.account.reputationDomainCatalog.fetch(
        domainCatalog
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

    for (const domainByte of [77, 105, 125, 134, 143, 163, 604]) {
      const domain = testBytes32(domainByte);
      try {
        const catalog =
          await reputationProgram.account.reputationDomainCatalog.fetch(
            domainCatalog
          );
        if (
          !catalog.domains.some((d: number[]) =>
            Buffer.from(d).equals(Buffer.from(domain))
          )
        ) {
          await reputationProgram.methods
            .registerDomain(domain)
            .accountsStrict({
              curator: authority,
              domainCatalog,
            })
            .rpc();
        }
      } catch {
        await reputationProgram.methods
          .registerDomain(domain)
          .accountsStrict({
            curator: authority,
            domainCatalog,
          })
          .rpc();
      }
    }
  });

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
    const agentId = testBytes32(11);
    const taskId = testBytes32(22);
    const completionReceiptId = testBytes32(33);
    const delegatedHandoffReceiptId = testBytes32(34);
    const policyRoot = testBytes32(44);
    const historyRoot = testBytes32(55);
    const subtaskRoot = testBytes32(66);
    const domain = testBytes32(77);
    const previousReceipt = bytes32(ZERO_BYTE);
    const payloadHash = testBytes32(88);
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
      .createTask(taskId, subtaskRoot, SUBTASK_COUNT, domain)
      .accountsStrict({
        authority,
        identity,
        task,
        identityRegistryProgram: identityProgram.programId,
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
        receipt: delegatedReceipt,
        domainCatalog,
        systemProgram: anchor.web3.SystemProgram.programId,
        cpiAuthority,
        taskRegistryProgram: taskProgram.programId,
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
        receipt,
        domainCatalog,
        systemProgram: anchor.web3.SystemProgram.programId,
        cpiAuthority,
        taskRegistryProgram: taskProgram.programId,
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
        identityRegistryProgram: identityProgram.programId,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    const receiptLeaves = [delegatedReceipt.toBuffer(), receipt.toBuffer()];
    const merkleTree = new OnchainMerkleTree(receiptLeaves);
    const leafCount = receiptLeaves.length;
    const checkpointRoot = Array.from(merkleTree.root);

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

    await proofProgram.methods
      .appendReceiptToCheckpoint()
      .accountsStrict({
        identity,
        checkpoint,
        latestCheckpoint,
        receipt: delegatedReceipt,
        historyUpdater,
        identityRegistryProgram: identityProgram.programId,
      })
      .rpc();

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
        domainCatalog,
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
    strictEqual(rotatedCheckpointAccount.leafCount.toNumber(), 0);
    ok(
      Buffer.from(rotatedCheckpointAccount.previousRoot).equals(
        Buffer.from(checkpointRoot)
      )
    );
    ok(Buffer.from(rotatedCheckpointAccount.root).equals(Buffer.alloc(32, 0)));
    strictEqual(reputationAccount.completed.toNumber(), 1);
    strictEqual(reputationAccount.disputed.toNumber(), 0);
    ok(reputationAccount.completionWeight.toNumber() > 0);
  });

  it("returns specific errors for invalid receipt and delegation actions", async () => {
    const delegateKeypair = anchor.web3.Keypair.generate();
    const domain = testBytes32(105);
    const setup = await createIdentityAndTask(101, 102, domain);
    const otherSetup = await createIdentityAndTask(103, 104, domain);
    const previousReceipt = bytes32(ZERO_BYTE);
    const payloadHash = testBytes32(106);

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
      asBuffer(testBytes32(107)),
    ]);

    await expectAnchorError(
      receiptProgram.methods
        .emitDelegatedReceipt(
          testBytes32(107),
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
          receipt: delegatedCompletionReceipt,
          domainCatalog,
          systemProgram: anchor.web3.SystemProgram.programId,
          cpiAuthority,
          taskRegistryProgram: taskProgram.programId,
        })
        .signers([delegateKeypair])
        .rpc(),
      "DelegationScopeMismatch"
    );

    const [invalidKindReceipt] = pda(receiptProgram, [
      seed(RECEIPT_SEED),
      setup.identity.toBuffer(),
      setup.task.toBuffer(),
      asBuffer(testBytes32(108)),
    ]);

    await expectAnchorError(
      receiptProgram.methods
        .emitReceipt(
          testBytes32(108),
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
          receipt: invalidKindReceipt,
          domainCatalog,
          systemProgram: anchor.web3.SystemProgram.programId,
          cpiAuthority,
          taskRegistryProgram: taskProgram.programId,
        })
        .rpc(),
      "InvalidReceiptKind"
    );

    const [wrongIdentityReceipt] = pda(receiptProgram, [
      seed(RECEIPT_SEED),
      setup.identity.toBuffer(),
      otherSetup.task.toBuffer(),
      asBuffer(testBytes32(109)),
    ]);

    await expectAnchorError(
      receiptProgram.methods
        .emitReceipt(
          testBytes32(109),
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
          receipt: wrongIdentityReceipt,
          domainCatalog,
          systemProgram: anchor.web3.SystemProgram.programId,
          cpiAuthority,
          taskRegistryProgram: taskProgram.programId,
        })
        .rpc(),
      "TaskIdentityMismatch"
    );
  });

  it("returns specific errors for stale checkpoint rotation", async () => {
    const taskDomain = testBytes32(105);
    const setup = await createIdentityAndTask(111, 112, taskDomain);
    const [checkpoint] = pda(proofProgram, [
      seed(CHECKPOINT_SEED),
      setup.identity.toBuffer(),
      u64(EPOCH_NUMBER),
    ]);
    const latestCheckpoint = latestCheckpointPda(setup.identity);

    await proofProgram.methods
      .initializeCheckpoint(new anchor.BN(EPOCH_NUMBER))
      .accountsStrict({
        authority,
        identity: setup.identity,
        checkpoint,
        latestCheckpoint,
        historyUpdater,
        identityRegistryProgram: identityProgram.programId,
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
        .rotateCheckpoint(new anchor.BN(3))
        .accountsStrict({
          authority,
          identity: setup.identity,
          previousCheckpoint: checkpoint,
          checkpoint: skippedCheckpoint,
          latestCheckpoint,
          historyUpdater,
          identityRegistryProgram: identityProgram.programId,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc(),
      "CheckpointEpochNotSequential"
    );

    const firstReceiptId = testBytes32(114);
    const secondReceiptId = testBytes32(115);
    const [firstReceipt] = pda(receiptProgram, [
      seed(RECEIPT_SEED),
      setup.identity.toBuffer(),
      setup.task.toBuffer(),
      asBuffer(firstReceiptId),
    ]);
    const [secondReceipt] = pda(receiptProgram, [
      seed(RECEIPT_SEED),
      setup.identity.toBuffer(),
      setup.task.toBuffer(),
      asBuffer(secondReceiptId),
    ]);

    await receiptProgram.methods
      .emitReceipt(
        firstReceiptId,
        ASSIGNMENT_RECEIPT_KIND,
        new anchor.BN(1),
        taskDomain,
        bytes32(ZERO_BYTE),
        testBytes32(116)
      )
      .accountsStrict({
        authority,
        identity: setup.identity,
        task: setup.task,
        receipt: firstReceipt,
        domainCatalog,
        systemProgram: anchor.web3.SystemProgram.programId,
        cpiAuthority,
        taskRegistryProgram: taskProgram.programId,
      })
      .rpc();

    await receiptProgram.methods
      .emitReceipt(
        secondReceiptId,
        COMPLETION_RECEIPT_KIND,
        new anchor.BN(2),
        taskDomain,
        pubkeyBytes(firstReceipt),
        testBytes32(117)
      )
      .accountsStrict({
        authority,
        identity: setup.identity,
        task: setup.task,
        receipt: secondReceipt,
        domainCatalog,
        systemProgram: anchor.web3.SystemProgram.programId,
        cpiAuthority,
        taskRegistryProgram: taskProgram.programId,
      })
      .rpc();

    await expectAnchorError(
      proofProgram.methods
        .appendReceiptToCheckpoint()
        .accountsStrict({
          identity: setup.identity,
          checkpoint,
          latestCheckpoint,
          receipt: secondReceipt,
          historyUpdater,
          identityRegistryProgram: identityProgram.programId,
        })
        .rpc(),
      "CheckpointOrderingViolation"
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
      .initializeCheckpoint(MAX_U64)
      .accountsStrict({
        authority,
        identity: overflowSetup.identity,
        checkpoint: maxEpochCheckpoint,
        latestCheckpoint: latestMaxEpochCheckpoint,
        historyUpdater,
        identityRegistryProgram: identityProgram.programId,
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
        .rotateCheckpoint(new anchor.BN(0))
        .accountsStrict({
          authority,
          identity: overflowSetup.identity,
          previousCheckpoint: maxEpochCheckpoint,
          checkpoint: overflowCheckpoint,
          latestCheckpoint: latestMaxEpochCheckpoint,
          historyUpdater,
          identityRegistryProgram: identityProgram.programId,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc(),
      "CheckpointEpochOverflow"
    );
  });

  it("grants task-scoped delegation through a handoff receipt", async () => {
    const domain = testBytes32(604);
    const setup = await createIdentityAndTask(612, 613, domain);
    const delegateKeypair = anchor.web3.Keypair.generate();
    const handoffReceiptId = testBytes32(614);
    const completionReceiptId = testBytes32(615);
    const handoffPayloadHash = testBytes32(616);
    const completionPayloadHash = testBytes32(617);
    const allowedActions = HANDOFF_ACTION_MASK | COMPLETION_ACTION_MASK;

    await fund(delegateKeypair.publicKey);

    const [handoffReceipt] = pda(receiptProgram, [
      seed(RECEIPT_SEED),
      setup.identity.toBuffer(),
      setup.task.toBuffer(),
      asBuffer(handoffReceiptId),
    ]);
    const [delegation] = pda(delegationProgram, [
      seed(DELEGATION_SEED),
      setup.identity.toBuffer(),
      delegateKeypair.publicKey.toBuffer(),
    ]);
    const [delegatedCompletionReceipt] = pda(receiptProgram, [
      seed(RECEIPT_SEED),
      setup.identity.toBuffer(),
      setup.task.toBuffer(),
      asBuffer(completionReceiptId),
    ]);

    await receiptProgram.methods
      .emitHandoffGrant(
        handoffReceiptId,
        new anchor.BN(1),
        domain,
        bytes32(ZERO_BYTE),
        handoffPayloadHash,
        allowedActions,
        new anchor.BN(0)
      )
      .accountsStrict({
        authority,
        identity: setup.identity,
        delegate: delegateKeypair.publicKey,
        task: setup.task,
        receipt: handoffReceipt,
        delegation,
        domainCatalog,
        cpiAuthority,
        taskRegistryProgram: taskProgram.programId,
        delegationEngineProgram: delegationProgram.programId,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    await receiptProgram.methods
      .emitDelegatedReceipt(
        completionReceiptId,
        COMPLETION_RECEIPT_KIND,
        new anchor.BN(2),
        domain,
        pubkeyBytes(handoffReceipt),
        completionPayloadHash
      )
      .accountsStrict({
        delegate: delegateKeypair.publicKey,
        identity: setup.identity,
        delegation,
        task: setup.task,
        receipt: delegatedCompletionReceipt,
        domainCatalog,
        systemProgram: anchor.web3.SystemProgram.programId,
        cpiAuthority,
        taskRegistryProgram: taskProgram.programId,
      })
      .signers([delegateKeypair])
      .rpc();

    const delegationAccount =
      await delegationProgram.account.delegationRecord.fetch(delegation);
    const handoffReceiptAccount =
      await receiptProgram.account.receiptRecord.fetch(handoffReceipt);
    const completionReceiptAccount =
      await receiptProgram.account.receiptRecord.fetch(
        delegatedCompletionReceipt
      );
    const taskAccount = await taskProgram.account.taskRecord.fetch(setup.task);

    strictEqual(delegationAccount.allowedActions, allowedActions);
    strictEqual(handoffReceiptAccount.kind, HANDOFF_RECEIPT_KIND);
    strictEqual(
      handoffReceiptAccount.viaDelegation.toBase58(),
      delegation.toBase58()
    );
    strictEqual(completionReceiptAccount.kind, COMPLETION_RECEIPT_KIND);
    strictEqual(
      completionReceiptAccount.actor.toBase58(),
      delegateKeypair.publicKey.toBase58()
    );
    strictEqual(taskAccount.lastSequence.toNumber(), 2);
    strictEqual(
      taskAccount.lastReceipt.toBase58(),
      delegatedCompletionReceipt.toBase58()
    );
  });

  it("rejects inclusion proofs against stale checkpoints", async () => {
    const domain = testBytes32(143);
    const setup = await createIdentityAndTask(151, 152, domain);
    const receiptId = testBytes32(153);
    const [receipt] = pda(receiptProgram, [
      seed(RECEIPT_SEED),
      setup.identity.toBuffer(),
      setup.task.toBuffer(),
      asBuffer(receiptId),
    ]);
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

    await receiptProgram.methods
      .emitReceipt(
        receiptId,
        COMPLETION_RECEIPT_KIND,
        new anchor.BN(1),
        domain,
        bytes32(ZERO_BYTE),
        testBytes32(154)
      )
      .accountsStrict({
        authority,
        identity: setup.identity,
        task: setup.task,
        receipt,
        domainCatalog,
        systemProgram: anchor.web3.SystemProgram.programId,
        cpiAuthority,
        taskRegistryProgram: taskProgram.programId,
      })
      .rpc();

    await proofProgram.methods
      .initializeCheckpoint(new anchor.BN(EPOCH_NUMBER))
      .accountsStrict({
        authority,
        identity: setup.identity,
        checkpoint,
        latestCheckpoint,
        historyUpdater,
        identityRegistryProgram: identityProgram.programId,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    await proofProgram.methods
      .appendReceiptToCheckpoint()
      .accountsStrict({
        identity: setup.identity,
        checkpoint,
        latestCheckpoint,
        receipt,
        historyUpdater,
        identityRegistryProgram: identityProgram.programId,
      })
      .rpc();

    await proofProgram.methods
      .rotateCheckpoint(new anchor.BN(NEXT_EPOCH_NUMBER))
      .accountsStrict({
        authority,
        identity: setup.identity,
        previousCheckpoint: checkpoint,
        checkpoint: nextCheckpoint,
        latestCheckpoint,
        historyUpdater,
        identityRegistryProgram: identityProgram.programId,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    const receiptLeaves = [receipt.toBuffer()];
    const merkleTree = new OnchainMerkleTree(receiptLeaves);
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
    const domain = testBytes32(163);
    const setup = await createIdentityAndTask(161, 162, domain);
    const receiptId = testBytes32(164);
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
        bytes32(ZERO_BYTE),
        testBytes32(165)
      )
      .accountsStrict({
        authority,
        identity: setup.identity,
        task: setup.task,
        receipt,
        domainCatalog,
        systemProgram: anchor.web3.SystemProgram.programId,
        cpiAuthority,
        taskRegistryProgram: taskProgram.programId,
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
        identityRegistryProgram: identityProgram.programId,
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
          identityRegistryProgram: identityProgram.programId,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc(),
      "AccountAlreadyInitialized"
    );

    await taskProgram.methods
      .taskReceiptAlreadyApplied()
      .accountsStrict({
        authority,
        identity: setup.identity,
        task: setup.task,
        receipt,
        receiptApplication: taskReceiptApplication,
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
        domainCatalog,
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
      "AccountAlreadyInitialized"
    );

    await reputationProgram.methods
      .reputationReceiptAlreadyApplied()
      .accountsStrict({
        authority,
        identity: setup.identity,
        receipt,
        reputation,
        receiptApplication: reputationReceiptApplication,
      })
      .rpc();
  });

  it("rejects reputation writes for the wrong agent identity", async () => {
    const domain = testBytes32(125);
    const setup = await createIdentityAndTask(121, 122, domain);
    const otherSetup = await createIdentityAndTask(123, 124, domain);
    const receiptId = testBytes32(126);
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
        bytes32(ZERO_BYTE),
        testBytes32(127)
      )
      .accountsStrict({
        authority,
        identity: setup.identity,
        task: setup.task,
        receipt,
        domainCatalog,
        systemProgram: anchor.web3.SystemProgram.programId,
        cpiAuthority,
        taskRegistryProgram: taskProgram.programId,
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
        domainCatalog,
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
    const domain = testBytes32(143);
    const setup = await createIdentityAndTask(141, 142, domain);
    const receiptId = testBytes32(144);
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
        bytes32(ZERO_BYTE),
        testBytes32(145)
      )
      .accountsStrict({
        authority,
        identity: setup.identity,
        task: setup.task,
        receipt,
        domainCatalog,
        systemProgram: anchor.web3.SystemProgram.programId,
        cpiAuthority,
        taskRegistryProgram: taskProgram.programId,
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
        domainCatalog,
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
    const domain = testBytes32(134);
    const setup = await createIdentityAndTask(131, 132, domain);
    const receiptId = testBytes32(133);
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
        domain,
        bytes32(ZERO_BYTE),
        testBytes32(135)
      )
      .accountsStrict({
        authority,
        identity: setup.identity,
        task: setup.task,
        receipt,
        domainCatalog,
        systemProgram: anchor.web3.SystemProgram.programId,
        cpiAuthority,
        taskRegistryProgram: taskProgram.programId,
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
          identityRegistryProgram: identityProgram.programId,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc(),
      "TaskDisputeRequiredForResolution"
    );
  });

  async function createIdentityAndTask(
    agentByte: number,
    taskByte: number,
    domain: number[] = testBytes32(ZERO_BYTE)
  ) {
    const agentId = testBytes32(agentByte);
    const taskId = testBytes32(taskByte);
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
      .createIdentity(
        agentId,
        testBytes32(agentByte + 1),
        testBytes32(agentByte + 2)
      )
      .accountsStrict({
        identity,
        authority,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    await taskProgram.methods
      .createTask(taskId, testBytes32(taskByte + 1), SUBTASK_COUNT, domain)
      .accountsStrict({
        authority,
        identity,
        task,
        identityRegistryProgram: identityProgram.programId,
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

  it("emits DelegationCreated and DelegationRevoked events", async () => {
    const setup = await createIdentityAndTask(501, 502);
    const delegateKeypair = anchor.web3.Keypair.generate();
    await fund(delegateKeypair.publicKey);

    const [delegation] = pda(delegationProgram, [
      seed(DELEGATION_SEED),
      setup.identity.toBuffer(),
      delegateKeypair.publicKey.toBuffer(),
    ]);

    const createdEvent = await captureEvent(
      delegationProgram,
      "delegationCreated",
      async () => {
        await delegationProgram.methods
          .createDelegation(ASSIGNMENT_ACTION_MASK, new anchor.BN(0))
          .accountsStrict({
            authority,
            identity: setup.identity,
            delegate: delegateKeypair.publicKey,
            delegation,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .rpc();
      }
    );

    strictEqual(createdEvent.identity.toBase58(), setup.identity.toBase58());
    strictEqual(
      createdEvent.delegate.toBase58(),
      delegateKeypair.publicKey.toBase58()
    );
    strictEqual(createdEvent.allowedActions, ASSIGNMENT_ACTION_MASK);
    ok(Number(createdEvent.slot) > 0);

    await new Promise((r) => setTimeout(r, 500));

    const revokedEvent = await captureEvent(
      delegationProgram,
      "delegationRevoked",
      async () => {
        await delegationProgram.methods
          .revokeDelegation(new anchor.BN(0))
          .accountsStrict({
            authority,
            identity: setup.identity,
            delegation,
          })
          .rpc();
      }
    );

    strictEqual(revokedEvent.identity.toBase58(), setup.identity.toBase58());
    strictEqual(
      revokedEvent.delegate.toBase58(),
      delegateKeypair.publicKey.toBase58()
    );
    ok(Number(revokedEvent.revokeAtSlot) > 0);
    ok(Number(revokedEvent.slot) > 0);
  });

  it("emits TaskStatusSynced event on receipt application", async () => {
    const receiptId = testBytes32(603);
    const domain = testBytes32(604);
    const setup = await createIdentityAndTask(601, 602, domain);
    const payloadHash = testBytes32(605);
    const [receipt] = pda(receiptProgram, [
      seed(RECEIPT_SEED),
      setup.identity.toBuffer(),
      setup.task.toBuffer(),
      asBuffer(receiptId),
    ]);
    const taskReceiptApplication = taskReceiptApplicationPda(
      setup.task,
      receipt
    );

    await receiptProgram.methods
      .emitReceipt(
        receiptId,
        COMPLETION_RECEIPT_KIND,
        new anchor.BN(1),
        domain,
        bytes32(ZERO_BYTE),
        payloadHash
      )
      .accountsStrict({
        authority,
        identity: setup.identity,
        task: setup.task,
        receipt,
        domainCatalog,
        systemProgram: anchor.web3.SystemProgram.programId,
        cpiAuthority,
        taskRegistryProgram: taskProgram.programId,
      })
      .rpc();

    const syncedEvent = await captureEvent(
      taskProgram,
      "taskStatusSynced",
      async () => {
        await taskProgram.methods
          .syncTaskStatus()
          .accountsStrict({
            authority,
            identity: setup.identity,
            task: setup.task,
            receipt,
            receiptApplication: taskReceiptApplication,
            identityRegistryProgram: identityProgram.programId,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .rpc();
      }
    );

    strictEqual(syncedEvent.identity.toBase58(), setup.identity.toBase58());
    strictEqual(syncedEvent.task.toBase58(), setup.task.toBase58());
    strictEqual(syncedEvent.receipt.toBase58(), receipt.toBase58());
    strictEqual(syncedEvent.kind, COMPLETION_RECEIPT_KIND);
    strictEqual(syncedEvent.newStatus, TASK_STATUS_COMPLETED);
    ok(Number(syncedEvent.slot) > 0);
  });

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

function testBytes32(value: number): number[] {
  return Array.from(
    createHash("sha256")
      .update(`trust_substrate:${TEST_RUN_NAMESPACE}:${value}`)
      .digest()
  );
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
  } catch (error: any) {
    const actualCode =
      error?.error?.errorCode?.code ?? error?.errorCode?.code ?? error?.code;
    if (actualCode === expectedCode) return;
    const msg = error?.message ?? "";
    if (msg.includes(expectedCode)) return;
    const logs: string[] = error?.logs ?? error?.error?.logs ?? [];
    if (
      expectedCode === "AccountAlreadyInitialized" &&
      (msg.includes("custom program error: 0x0") ||
        logs.some((l: string) => l.includes("already in use")))
    ) {
      return;
    }
    strictEqual(actualCode, expectedCode);
    return;
  }

  throw new Error(`Expected Anchor error ${expectedCode}`);
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
