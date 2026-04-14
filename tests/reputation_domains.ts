import * as anchor from "@anchor-lang/core";
import { Program } from "@anchor-lang/core";
import { strictEqual } from "assert";
import { IdentityRegistry } from "../target/types/identity_registry";
import { ReceiptEmitter } from "../target/types/receipt_emitter";
import { ReputationAccumulator } from "../target/types/reputation_accumulator";
import { TaskRegistry } from "../target/types/task_registry";

const IDENTITY_SEED = "identity";
const TASK_SEED = "task";
const RECEIPT_SEED = "receipt";
const REPUTATION_SEED = "reputation";
const DOMAIN_CATALOG_SEED = "domain_catalog";
const COMPLETION_RECEIPT_KIND = 3;

function bytes32(value: number): number[] {
  return Array.from(Buffer.alloc(32, value));
}

function seed(value: string): Buffer {
  return Buffer.from(value, "utf8");
}

function pda<T>(
  program: Program<T>,
  seeds: Array<Buffer>
): [anchor.web3.PublicKey, number] {
  return anchor.web3.PublicKey.findProgramAddressSync(seeds, program.programId);
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
    strictEqual(actualCode, expectedCode);
    return;
  }

  throw new Error(`Expected Anchor error ${expectedCode}`);
}

describe("reputation domain catalog", () => {
  anchor.setProvider(anchor.AnchorProvider.env());
  const provider = anchor.AnchorProvider.env();
  const authority = provider.wallet.publicKey;

  const identityProgram = anchor.workspace
    .identityRegistry as Program<IdentityRegistry>;
  const taskProgram = anchor.workspace.taskRegistry as Program<TaskRegistry>;
  const receiptProgram = anchor.workspace
    .receiptEmitter as Program<ReceiptEmitter>;
  const reputationProgram = anchor.workspace
    .reputationAccumulator as Program<ReputationAccumulator>;

  const [domainCatalog] = pda(reputationProgram, [seed(DOMAIN_CATALOG_SEED)]);

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
  });

  async function createIdentityAndTask(
    agentByte: number,
    taskByte: number
  ): Promise<{
    identity: anchor.web3.PublicKey;
    task: anchor.web3.PublicKey;
  }> {
    const agentId = bytes32(agentByte);
    const taskId = bytes32(taskByte);
    const [identity] = pda(identityProgram, [
      seed(IDENTITY_SEED),
      authority.toBuffer(),
      Buffer.from(agentId),
    ]);
    const [task] = pda(taskProgram, [
      seed(TASK_SEED),
      identity.toBuffer(),
      Buffer.from(taskId),
    ]);

    try {
      await identityProgram.account.agentIdentity.fetch(identity);
    } catch {
      await identityProgram.methods
        .createIdentity(agentId, bytes32(agentByte + 1), bytes32(agentByte + 2))
        .accountsStrict({
          identity,
          authority,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();
    }

    try {
      await taskProgram.account.taskRecord.fetch(task);
    } catch {
      await taskProgram.methods
        .createTask(taskId, bytes32(taskByte + 1), 2)
        .accountsStrict({
          authority,
          identity,
          task,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();
    }

    return { identity, task };
  }

  it("creating reputation accumulator for unregistered domain fails", async () => {
    const { identity } = await createIdentityAndTask(200, 201);
    const unregisteredDomain = bytes32(202);
    const [reputation] = pda(reputationProgram, [
      seed(REPUTATION_SEED),
      identity.toBuffer(),
      Buffer.from(unregisteredDomain),
    ]);

    await expectAnchorError(
      reputationProgram.methods
        .createReputationDomain(
          unregisteredDomain,
          new anchor.BN(0),
          new anchor.BN(0),
          new anchor.BN(0)
        )
        .accountsStrict({
          authority,
          identity,
          reputation,
          domainCatalog,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc(),
      "DomainNotRegistered"
    );
  });

  it("emitting receipt with unregistered non-empty domain fails", async () => {
    const { identity, task } = await createIdentityAndTask(210, 211);
    const unregisteredDomain = bytes32(212);
    const receiptId = bytes32(213);
    const [receipt] = pda(receiptProgram, [
      seed(RECEIPT_SEED),
      identity.toBuffer(),
      task.toBuffer(),
      Buffer.from(receiptId),
    ]);

    await expectAnchorError(
      receiptProgram.methods
        .emitReceipt(
          receiptId,
          COMPLETION_RECEIPT_KIND,
          new anchor.BN(1),
          unregisteredDomain,
          bytes32(0),
          bytes32(214)
        )
        .accountsStrict({
          authority,
          identity,
          task,
          receipt,
          cpiAuthority,
          domainCatalog,
          taskRegistryProgram: taskProgram.programId,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc(),
      "DomainNotRegistered"
    );
  });

  it("deprecated domain still validates receipts but rejects new create_reputation_domain calls", async () => {
    const domain = bytes32(220);

    const catalog =
      await reputationProgram.account.reputationDomainCatalog.fetch(
        domainCatalog
      );
    const alreadyRegistered = catalog.domains.some((d: number[]) =>
      Buffer.from(d).equals(Buffer.from(domain))
    );
    if (!alreadyRegistered) {
      await reputationProgram.methods
        .registerDomain(domain)
        .accountsStrict({
          curator: authority,
          domainCatalog,
        })
        .rpc();
    }

    const { identity, task } = await createIdentityAndTask(221, 222);
    const receiptId = bytes32(223);
    const [receipt] = pda(receiptProgram, [
      seed(RECEIPT_SEED),
      identity.toBuffer(),
      task.toBuffer(),
      Buffer.from(receiptId),
    ]);

    await receiptProgram.methods
      .emitReceipt(
        receiptId,
        COMPLETION_RECEIPT_KIND,
        new anchor.BN(1),
        domain,
        bytes32(0),
        bytes32(224)
      )
      .accountsStrict({
        authority,
        identity,
        task,
        receipt,
        cpiAuthority,
        domainCatalog,
        taskRegistryProgram: taskProgram.programId,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    const [reputation] = pda(reputationProgram, [
      seed(REPUTATION_SEED),
      identity.toBuffer(),
      Buffer.from(domain),
    ]);

    await reputationProgram.methods
      .createReputationDomain(
        domain,
        new anchor.BN(0),
        new anchor.BN(0),
        new anchor.BN(0)
      )
      .accountsStrict({
        authority,
        identity,
        reputation,
        domainCatalog,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    const { identity: identity2, task: task2 } = await createIdentityAndTask(
      225,
      226
    );
    const [reputation2] = pda(reputationProgram, [
      seed(REPUTATION_SEED),
      identity2.toBuffer(),
      Buffer.from(domain),
    ]);

    await reputationProgram.methods
      .deprecateDomain(domain)
      .accountsStrict({
        curator: authority,
        domainCatalog,
      })
      .rpc();

    await expectAnchorError(
      reputationProgram.methods
        .createReputationDomain(
          domain,
          new anchor.BN(0),
          new anchor.BN(0),
          new anchor.BN(0)
        )
        .accountsStrict({
          authority,
          identity: identity2,
          reputation: reputation2,
          domainCatalog,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc(),
      "DomainNotRegistered"
    );
    const receiptId2 = bytes32(227);
    const [receipt2] = pda(receiptProgram, [
      seed(RECEIPT_SEED),
      identity2.toBuffer(),
      task2.toBuffer(),
      Buffer.from(receiptId2),
    ]);

    await receiptProgram.methods
      .emitReceipt(
        receiptId2,
        COMPLETION_RECEIPT_KIND,
        new anchor.BN(1),
        domain,
        bytes32(0),
        bytes32(228)
      )
      .accountsStrict({
        authority,
        identity: identity2,
        task: task2,
        receipt: receipt2,
        cpiAuthority,
        domainCatalog,
        taskRegistryProgram: taskProgram.programId,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();
  });
});
