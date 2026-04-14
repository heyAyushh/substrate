import * as anchor from "@anchor-lang/core";
import { Program } from "@anchor-lang/core";
import { ok, strictEqual } from "assert";
import { createHash } from "crypto";
import { IdentityRegistry } from "../target/types/identity_registry";
import { ReceiptEmitter } from "../target/types/receipt_emitter";
import { ReputationAccumulator } from "../target/types/reputation_accumulator";
import { TaskRegistry } from "../target/types/task_registry";

const IDENTITY_SEED = "identity";
const TASK_SEED = "task";
const RECEIPT_SEED = "receipt";
const AUDIT_RECEIPT_SEED = "audit_receipt";
const COMPLETION_KIND = 3;
const CHALLENGE_KIND = 6;
const ATTESTATION_KIND = 8;
const ZERO_BYTE = 0;
const TEST_RUN_NAMESPACE = anchor.web3.Keypair.generate().publicKey.toBase58();

describe("audit_receipts", () => {
  anchor.setProvider(anchor.AnchorProvider.env());

  const provider = anchor.AnchorProvider.env();
  const builderAuthority = provider.wallet.publicKey;
  const reviewerAuthority = anchor.web3.Keypair.generate();
  const identityProgram = anchor.workspace
    .identityRegistry as Program<IdentityRegistry>;
  const taskProgram = anchor.workspace.taskRegistry as Program<TaskRegistry>;
  const receiptProgram = anchor.workspace
    .receiptEmitter as Program<ReceiptEmitter>;
  const reputationProgram = anchor.workspace
    .reputationAccumulator as Program<ReputationAccumulator>;

  let domainCatalog: anchor.web3.PublicKey;
  let cpiAuthority: anchor.web3.PublicKey;

  before(async () => {
    await fund(reviewerAuthority.publicKey);

    cpiAuthority = cpiAuthorityPda();
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

    const [catalogPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [seed("domain_catalog")],
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
          curator: builderAuthority,
          domainCatalog,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();
    }
  });

  it("allows a reviewer identity to challenge another agent receipt", async () => {
    const fixture = await createAuditFixture(1);
    const auditReceipt = auditReceiptPda(
      fixture.reviewerIdentity,
      fixture.targetReceipt,
      CHALLENGE_KIND,
      0
    );

    await receiptProgram.methods
      .emitAuditReceipt(
        CHALLENGE_KIND,
        fixture.domain,
        fixture.auditPayloadHash,
        new anchor.BN(0),
        0
      )
      .accountsStrict({
        authority: reviewerAuthority.publicKey,
        auditorIdentity: fixture.reviewerIdentity,
        targetIdentity: fixture.builderIdentity,
        targetReceipt: fixture.targetReceipt,
        auditReceipt,
        domainCatalog,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([reviewerAuthority])
      .rpc();

    const auditRecord = await receiptProgram.account.receiptRecord.fetch(
      auditReceipt
    );

    strictEqual(
      auditRecord.identity.toBase58(),
      fixture.builderIdentity.toBase58()
    );
    strictEqual(
      auditRecord.auditorIdentity.toBase58(),
      fixture.reviewerIdentity.toBase58()
    );
    strictEqual(
      auditRecord.targetReceipt.toBase58(),
      fixture.targetReceipt.toBase58()
    );
    strictEqual(auditRecord.kind, CHALLENGE_KIND);
    strictEqual(auditRecord.round, 0);
    strictEqual(auditRecord.sequence.toString(), "0");
  });

  it("rejects a duplicate challenge from the same reviewer and round", async () => {
    const fixture = await createAuditFixture(11);
    const auditReceipt = auditReceiptPda(
      fixture.reviewerIdentity,
      fixture.targetReceipt,
      CHALLENGE_KIND,
      0
    );

    await emitAuditReceipt(fixture, auditReceipt, CHALLENGE_KIND, 0);

    await expectError(
      emitAuditReceipt(fixture, auditReceipt, CHALLENGE_KIND, 0),
      "already in use"
    );
  });

  it("rejects audit receipt kinds that are reserved for self receipts", async () => {
    const fixture = await createAuditFixture(21);
    const auditReceipt = auditReceiptPda(
      fixture.reviewerIdentity,
      fixture.targetReceipt,
      COMPLETION_KIND,
      0
    );

    await expectAnchorError(
      emitAuditReceipt(fixture, auditReceipt, COMPLETION_KIND, 0),
      "ReceiptKindNotAuditable"
    );
  });

  it("rejects a builder challenging its own receipt", async () => {
    const fixture = await createAuditFixture(31);
    const auditReceipt = auditReceiptPda(
      fixture.builderIdentity,
      fixture.targetReceipt,
      CHALLENGE_KIND,
      0
    );

    await expectAnchorError(
      receiptProgram.methods
        .emitAuditReceipt(
          CHALLENGE_KIND,
          fixture.domain,
          fixture.auditPayloadHash,
          new anchor.BN(0),
          0
        )
        .accountsStrict({
          authority: builderAuthority,
          auditorIdentity: fixture.builderIdentity,
          targetIdentity: fixture.builderIdentity,
          targetReceipt: fixture.targetReceipt,
          auditReceipt,
          domainCatalog,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc(),
      "ReceiptAuditorCannotTargetOwnReceipt"
    );
  });

  it("allows attestation receipts against another agent receipt", async () => {
    const fixture = await createAuditFixture(41);
    const auditReceipt = auditReceiptPda(
      fixture.reviewerIdentity,
      fixture.targetReceipt,
      ATTESTATION_KIND,
      0
    );

    await emitAuditReceipt(fixture, auditReceipt, ATTESTATION_KIND, 0);

    const auditRecord = await receiptProgram.account.receiptRecord.fetch(
      auditReceipt
    );
    strictEqual(auditRecord.kind, ATTESTATION_KIND);
    strictEqual(
      auditRecord.auditorIdentity.toBase58(),
      fixture.reviewerIdentity.toBase58()
    );
  });

  it("rejects audit receipts against a missing target receipt account", async () => {
    const fixture = await createAuditFixture(51);
    const missingTarget = pda(receiptProgram, [
      seed(RECEIPT_SEED),
      fixture.builderIdentity.toBuffer(),
      fixture.task.toBuffer(),
      asBuffer(testBytes32(52)),
    ])[0];
    const auditReceipt = auditReceiptPda(
      fixture.reviewerIdentity,
      missingTarget,
      CHALLENGE_KIND,
      0
    );

    await expectError(
      receiptProgram.methods
        .emitAuditReceipt(
          CHALLENGE_KIND,
          fixture.domain,
          fixture.auditPayloadHash,
          new anchor.BN(0),
          0
        )
        .accountsStrict({
          authority: reviewerAuthority.publicKey,
          auditorIdentity: fixture.reviewerIdentity,
          targetIdentity: fixture.builderIdentity,
          targetReceipt: missingTarget,
          auditReceipt,
          domainCatalog,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([reviewerAuthority])
        .rpc(),
      "AccountNotInitialized"
    );
  });

  async function createAuditFixture(offset: number) {
    const builderAgentId = testBytes32(100 + offset);
    const reviewerAgentId = testBytes32(101 + offset);
    const taskId = testBytes32(102 + offset);
    const receiptId = testBytes32(103 + offset);
    const domain = bytes32(ZERO_BYTE);
    const targetPayloadHash = testBytes32(104 + offset);
    const auditPayloadHash = testBytes32(105 + offset);

    const [builderIdentity] = pda(identityProgram, [
      seed(IDENTITY_SEED),
      builderAuthority.toBuffer(),
      asBuffer(builderAgentId),
    ]);
    const [reviewerIdentity] = pda(identityProgram, [
      seed(IDENTITY_SEED),
      reviewerAuthority.publicKey.toBuffer(),
      asBuffer(reviewerAgentId),
    ]);
    const [task] = pda(taskProgram, [
      seed(TASK_SEED),
      builderIdentity.toBuffer(),
      asBuffer(taskId),
    ]);
    const [targetReceipt] = pda(receiptProgram, [
      seed(RECEIPT_SEED),
      builderIdentity.toBuffer(),
      task.toBuffer(),
      asBuffer(receiptId),
    ]);

    await identityProgram.methods
      .createIdentity(builderAgentId, testBytes32(106 + offset), bytes32(0))
      .accountsStrict({
        identity: builderIdentity,
        authority: builderAuthority,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    await identityProgram.methods
      .createIdentity(reviewerAgentId, testBytes32(107 + offset), bytes32(0))
      .accountsStrict({
        identity: reviewerIdentity,
        authority: reviewerAuthority.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([reviewerAuthority])
      .rpc();

    await taskProgram.methods
      .createTask(taskId, testBytes32(108 + offset), 0)
      .accountsStrict({
        authority: builderAuthority,
        identity: builderIdentity,
        task,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    await receiptProgram.methods
      .emitReceipt(
        receiptId,
        COMPLETION_KIND,
        new anchor.BN(1),
        domain,
        bytes32(0),
        targetPayloadHash
      )
      .accountsStrict({
        authority: builderAuthority,
        identity: builderIdentity,
        task,
        receipt: targetReceipt,
        domainCatalog,
        systemProgram: anchor.web3.SystemProgram.programId,
        cpiAuthority,
        taskRegistryProgram: taskProgram.programId,
      })
      .rpc();

    return {
      builderIdentity,
      reviewerIdentity,
      task,
      targetReceipt,
      domain,
      auditPayloadHash,
    };
  }

  async function emitAuditReceipt(
    fixture: Awaited<ReturnType<typeof createAuditFixture>>,
    auditReceipt: anchor.web3.PublicKey,
    kind: number,
    round: number
  ) {
    return receiptProgram.methods
      .emitAuditReceipt(
        kind,
        fixture.domain,
        fixture.auditPayloadHash,
        new anchor.BN(0),
        round
      )
      .accountsStrict({
        authority: reviewerAuthority.publicKey,
        auditorIdentity: fixture.reviewerIdentity,
        targetIdentity: fixture.builderIdentity,
        targetReceipt: fixture.targetReceipt,
        auditReceipt,
        domainCatalog,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([reviewerAuthority])
      .rpc();
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

function cpiAuthorityPda(): anchor.web3.PublicKey {
  const receiptProgram = anchor.workspace
    .receiptEmitter as Program<ReceiptEmitter>;
  return pda(receiptProgram, [seed("cpi_authority")])[0];
}

function auditReceiptPda(
  auditorIdentity: anchor.web3.PublicKey,
  targetReceipt: anchor.web3.PublicKey,
  kind: number,
  round: number
): anchor.web3.PublicKey {
  const receiptProgram = anchor.workspace
    .receiptEmitter as Program<ReceiptEmitter>;
  return pda(receiptProgram, [
    seed(AUDIT_RECEIPT_SEED),
    auditorIdentity.toBuffer(),
    targetReceipt.toBuffer(),
    Buffer.from([kind]),
    u16Le(round),
  ])[0];
}

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
      .update(`audit_receipts:${TEST_RUN_NAMESPACE}:${value}`)
      .digest()
  );
}

function asBuffer(value: number[]): Buffer {
  return Buffer.from(value);
}

function u16Le(value: number): Buffer {
  const buffer = Buffer.alloc(2);
  buffer.writeUInt16LE(value);
  return buffer;
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

async function expectError(promise: Promise<unknown>, expectedText: string) {
  try {
    await promise;
  } catch (error: any) {
    const message = error?.message ?? "";
    ok(
      message.includes(expectedText),
      `Expected error containing ${expectedText}, got: ${message}`
    );
    return;
  }

  throw new Error(`Expected error containing ${expectedText}`);
}
