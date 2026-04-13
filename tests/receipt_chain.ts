import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { strictEqual } from "assert";
import { DelegationEngine } from "../target/types/delegation_engine";
import { IdentityRegistry } from "../target/types/identity_registry";
import { ReceiptEmitter } from "../target/types/receipt_emitter";
import { TaskRegistry } from "../target/types/task_registry";

const IDENTITY_SEED = "identity";
const TASK_SEED = "task";
const RECEIPT_SEED = "receipt";
const DELEGATION_SEED = "delegation";
const ASSIGNMENT_KIND = 1;
const HANDOFF_KIND = 2;
const HANDOFF_SCOPE_BIT = 1 << 1;

describe("receipt_chain", () => {
  anchor.setProvider(anchor.AnchorProvider.env());
  let cpiAuthority: anchor.web3.PublicKey;
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

  it("requires receipts to extend the previous task receipt", async () => {
    const setup = await createTaskFixture(181, 182, 183);

    const firstReceipt = setup.receipts[0];
    const secondReceipt = setup.receipts[1];

    await receiptProgram.methods
      .emitReceipt(
        setup.firstReceiptId,
        ASSIGNMENT_KIND,
        new anchor.BN(1),
        setup.domain,
        bytes32(0),
        setup.payloadHash
      )
      .accountsStrict({
        authority,
        identity: setup.identity,
        task: setup.task,
        receipt: firstReceipt,
        systemProgram: anchor.web3.SystemProgram.programId,
        cpiAuthority,
        taskRegistryProgram: taskProgram.programId,
      })
      .rpc();

    await receiptProgram.methods
      .emitDelegatedReceipt(
        setup.secondReceiptId,
        HANDOFF_KIND,
        new anchor.BN(2),
        setup.domain,
        pubkeyBytes(setup.firstReceipt),
        setup.payloadHash
      )
      .accountsStrict({
        delegate: delegate.publicKey,
        identity: setup.identity,
        delegation: setup.delegation,
        task: setup.task,
        receipt: secondReceipt,
        systemProgram: anchor.web3.SystemProgram.programId,
        cpiAuthority,
        taskRegistryProgram: taskProgram.programId,
      })
      .signers([delegate])
      .rpc();

    const taskState = await taskProgram.account.taskRecord.fetch(setup.task);
    strictEqual(
      (taskState as any).lastReceipt.toBase58(),
      setup.secondReceipt.toBase58()
    );
    strictEqual((taskState as any).lastSequence.toString(), "2");
  });

  it("rejects a receipt with a non-monotonic sequence", async () => {
    const setup = await createTaskFixture(186, 187, 188);

    await receiptProgram.methods
      .emitReceipt(
        setup.firstReceiptId,
        ASSIGNMENT_KIND,
        new anchor.BN(1),
        setup.domain,
        bytes32(0),
        setup.payloadHash
      )
      .accountsStrict({
        authority,
        identity: setup.identity,
        task: setup.task,
        receipt: setup.receipts[0],
        systemProgram: anchor.web3.SystemProgram.programId,
        cpiAuthority,
        taskRegistryProgram: taskProgram.programId,
      })
      .rpc();

    await expectAnchorError(
      receiptProgram.methods
        .emitReceipt(
          setup.secondReceiptId,
          HANDOFF_KIND,
          new anchor.BN(3),
          setup.domain,
          pubkeyBytes(setup.firstReceipt),
          setup.payloadHash
        )
        .accountsStrict({
          authority,
          identity: setup.identity,
          task: setup.task,
          receipt: setup.receipts[1],
          systemProgram: anchor.web3.SystemProgram.programId,
          cpiAuthority,
        taskRegistryProgram: taskProgram.programId,
        })
        .rpc(),
      "ReceiptSequenceNotMonotonic"
    );
  });

  it("rejects a receipt that does not extend the previous receipt key", async () => {
    const setup = await createTaskFixture(191, 192, 193);
    const wrongPreviousReceipt = bytes32(200);

    await receiptProgram.methods
      .emitReceipt(
        setup.firstReceiptId,
        ASSIGNMENT_KIND,
        new anchor.BN(1),
        setup.domain,
        bytes32(0),
        setup.payloadHash
      )
      .accountsStrict({
        authority,
        identity: setup.identity,
        task: setup.task,
        receipt: setup.receipts[0],
        systemProgram: anchor.web3.SystemProgram.programId,
        cpiAuthority,
        taskRegistryProgram: taskProgram.programId,
      })
      .rpc();

    await expectAnchorError(
      receiptProgram.methods
        .emitDelegatedReceipt(
          setup.secondReceiptId,
          HANDOFF_KIND,
          new anchor.BN(2),
          setup.domain,
          wrongPreviousReceipt,
          setup.payloadHash
        )
        .accountsStrict({
          delegate: delegate.publicKey,
          identity: setup.identity,
          delegation: setup.delegation,
          task: setup.task,
          receipt: setup.receipts[1],
          systemProgram: anchor.web3.SystemProgram.programId,
          cpiAuthority,
        taskRegistryProgram: taskProgram.programId,
        })
        .signers([delegate])
        .rpc(),
      "ReceiptChainBroken"
    );
  });

  it("rejects a second fork that reuses the same previous receipt", async () => {
    const setup = await createTaskFixture(196, 197, 198);

    await receiptProgram.methods
      .emitReceipt(
        setup.firstReceiptId,
        ASSIGNMENT_KIND,
        new anchor.BN(1),
        setup.domain,
        bytes32(0),
        setup.payloadHash
      )
      .accountsStrict({
        authority,
        identity: setup.identity,
        task: setup.task,
        receipt: setup.receipts[0],
        systemProgram: anchor.web3.SystemProgram.programId,
        cpiAuthority,
        taskRegistryProgram: taskProgram.programId,
      })
      .rpc();

    await receiptProgram.methods
      .emitDelegatedReceipt(
        setup.secondReceiptId,
        HANDOFF_KIND,
        new anchor.BN(2),
        setup.domain,
        pubkeyBytes(setup.firstReceipt),
        setup.payloadHash
      )
      .accountsStrict({
        delegate: delegate.publicKey,
        identity: setup.identity,
        delegation: setup.delegation,
        task: setup.task,
        receipt: setup.receipts[1],
        systemProgram: anchor.web3.SystemProgram.programId,
        cpiAuthority,
        taskRegistryProgram: taskProgram.programId,
      })
      .signers([delegate])
      .rpc();

    await expectAnchorError(
      receiptProgram.methods
        .emitDelegatedReceipt(
          setup.thirdReceiptId,
          HANDOFF_KIND,
          new anchor.BN(3),
          setup.domain,
          pubkeyBytes(setup.firstReceipt),
          setup.payloadHash
        )
        .accountsStrict({
          delegate: delegate.publicKey,
          identity: setup.identity,
          delegation: setup.delegation,
          task: setup.task,
          receipt: setup.receipts[2],
          systemProgram: anchor.web3.SystemProgram.programId,
          cpiAuthority,
        taskRegistryProgram: taskProgram.programId,
        })
        .signers([delegate])
        .rpc(),
      "ReceiptChainBroken"
    );
  });

  async function createTaskFixture(
    agentByte: number,
    taskByte: number,
    receiptByte: number
  ) {
    await fund(delegate.publicKey);

    const agentId = bytes32(agentByte);
    const taskId = bytes32(taskByte);
    const firstReceiptId = bytes32(receiptByte);
    const secondReceiptId = bytes32(receiptByte + 1);
    const thirdReceiptId = bytes32(receiptByte + 2);
    const domain = bytes32(receiptByte + 10);
    const payloadHash = bytes32(receiptByte + 20);
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
    const [delegation] = pda(delegationProgram, [
      seed(DELEGATION_SEED),
      identity.toBuffer(),
      delegate.publicKey.toBuffer(),
    ]);
    const [firstReceipt] = pda(receiptProgram, [
      seed(RECEIPT_SEED),
      identity.toBuffer(),
      task.toBuffer(),
      asBuffer(firstReceiptId),
    ]);
    const [secondReceipt] = pda(receiptProgram, [
      seed(RECEIPT_SEED),
      identity.toBuffer(),
      task.toBuffer(),
      asBuffer(secondReceiptId),
    ]);
    const [thirdReceipt] = pda(receiptProgram, [
      seed(RECEIPT_SEED),
      identity.toBuffer(),
      task.toBuffer(),
      asBuffer(thirdReceiptId),
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
      .createTask(taskId, bytes32(taskByte + 1), 0)
      .accountsStrict({
        authority,
        identity,
        task,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    await delegationProgram.methods
      .createDelegation(HANDOFF_SCOPE_BIT, new anchor.BN(0))
      .accountsStrict({
        authority,
        identity,
        delegate: delegate.publicKey,
        delegation,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    return {
      identity,
      task,
      delegation,
      domain,
      payloadHash,
      firstReceiptId,
      secondReceiptId,
      thirdReceiptId,
      firstReceipt,
      secondReceipt,
      thirdReceipt,
      receipts: [firstReceipt, secondReceipt, thirdReceipt] as const,
    };
  }

  async function fund(publicKey: anchor.web3.PublicKey) {
    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(
        publicKey,
        2 * anchor.web3.LAMPORTS_PER_SOL
      )
    );
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
