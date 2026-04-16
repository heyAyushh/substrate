import * as anchor from "@anchor-lang/core";
import { Program } from "@anchor-lang/core";
import { strictEqual } from "assert";
import { AttesterRegistry } from "../target/types/attester_registry";
import { IdentityRegistry } from "../target/types/identity_registry";
import { ReceiptEmitter } from "../target/types/receipt_emitter";
import { ReputationAccumulator } from "../target/types/reputation_accumulator";
import { TaskRegistry } from "../target/types/task_registry";

const IDENTITY_SEED = "identity";
const IDENTITY_BOND_SEED = "bond";
const TASK_SEED = "task";
const RECEIPT_SEED = "receipt";
const AUDIT_RECEIPT_SEED = "audit_receipt";
const RUNTIME_ATTESTATION_SEED = "runtime_attestation";
const DOMAIN_CATALOG_SEED = "domain_catalog";
const ATTESTER_CONFIG_SEED = "attester_config";
const ATTESTER_RECORD_SEED = "attester";
const COMPLETION_KIND = 3;
const CHALLENGE_KIND = 6;

describe("hardening W6/W7", () => {
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
  const attesterProgram = anchor.workspace
    .attesterRegistry as Program<AttesterRegistry>;

  let cpiAuthority: anchor.web3.PublicKey;
  let domainCatalog: anchor.web3.PublicKey;
  let attesterConfig: anchor.web3.PublicKey;

  before(async () => {
    await fund(reviewerAuthority.publicKey);

    cpiAuthority = pda(receiptProgram.programId, [seed("cpi_authority")])[0];
    try {
      await receiptProgram.account.cpiAuthority.fetch(cpiAuthority);
    } catch {
      await receiptProgram.methods
        .initializeCpiAuthority()
        .accountsStrict({
          payer: builderAuthority,
          cpiAuthority,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();
    }

    domainCatalog = pda(reputationProgram.programId, [
      seed(DOMAIN_CATALOG_SEED),
    ])[0];
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

    const domain = bytes32(77);
    const catalog = await reputationProgram.account.reputationDomainCatalog.fetch(
      domainCatalog
    );
    if (
      !catalog.domains.some((value: number[]) =>
        Buffer.from(value).equals(Buffer.from(domain))
      )
    ) {
      await reputationProgram.methods
        .registerDomain(domain)
        .accountsStrict({
          curator: builderAuthority,
          domainCatalog,
        })
        .rpc();
    }

    attesterConfig = pda(attesterProgram.programId, [
      seed(ATTESTER_CONFIG_SEED),
    ])[0];
    try {
      await attesterProgram.account.attesterRegistryConfig.fetch(attesterConfig);
    } catch {
      await attesterProgram.methods
        .initializeRegistry()
        .accountsStrict({
          curator: builderAuthority,
          config: attesterConfig,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();
    }
  });

  it("enforces sybil gating and records runtime provenance", async () => {
    const builderAgentId = testBytes32(171);
    const reviewerAgentId = testBytes32(172);
    const taskId = testBytes32(173);
    const receiptId = testBytes32(174);
    const domain = bytes32(77);
    const completionPayload = testBytes32(175);
    const runtimeCommit = testBytes32(176);

    const builderIdentity = identityPda(builderAuthority, builderAgentId);
    const reviewerIdentity = identityPda(
      reviewerAuthority.publicKey,
      reviewerAgentId
    );
    const reviewerBond = identityBondPda(reviewerIdentity);
    const task = taskPda(builderIdentity, taskId);
    const targetReceipt = receiptPda(builderIdentity, task, receiptId);
    const auditReceipt = auditReceiptPda(
      reviewerIdentity,
      targetReceipt,
      CHALLENGE_KIND,
      0
    );
    const runtimeAttestation = runtimeAttestationPda(
      builderIdentity,
      runtimeCommit
    );
    const attesterRecord = attesterRecordPda(reviewerIdentity);

    await identityProgram.methods
      .createIdentity(builderAgentId, testBytes32(10), testBytes32(11))
      .accountsStrict({
        authority: builderAuthority,
        identity: builderIdentity,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();
    await identityProgram.methods
      .createIdentity(reviewerAgentId, testBytes32(12), testBytes32(13))
      .accountsStrict({
        authority: reviewerAuthority.publicKey,
        identity: reviewerIdentity,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([reviewerAuthority])
      .rpc();

    await taskProgram.methods
      .createTask(taskId, testBytes32(14), 0, domain)
      .accountsStrict({
        authority: builderAuthority,
        identity: builderIdentity,
        task,
        identityRegistryProgram: identityProgram.programId,
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
        completionPayload
      )
      .accountsStrict({
        authority: builderAuthority,
        identity: builderIdentity,
        task,
        receipt: targetReceipt,
        domainCatalog,
        cpiAuthority,
        taskRegistryProgram: taskProgram.programId,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    await identityProgram.methods
      .appendRuntimeAttestation(runtimeCommit, builderAuthority)
      .accountsStrict({
        authority: builderAuthority,
        identity: builderIdentity,
        runtimeAttestation,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    const runtimeRecord =
      await identityProgram.account.runtimeAttestation.fetch(runtimeAttestation);
    strictEqual(runtimeRecord.identity.toBase58(), builderIdentity.toBase58());
    strictEqual(
      Buffer.from(runtimeRecord.runtimeCommit).equals(Buffer.from(runtimeCommit)),
      true
    );

    await expectAnchorError(
      receiptProgram.methods
        .emitAuditReceipt(
          CHALLENGE_KIND,
          domain,
          testBytes32(177),
          new anchor.BN(0),
          0,
          new anchor.BN(20)
        )
        .accountsStrict({
          authority: reviewerAuthority.publicKey,
          auditorIdentity: reviewerIdentity,
          identityBond: reviewerBond,
          targetIdentity: builderIdentity,
          targetReceipt,
          auditReceipt,
          domainCatalog,
          cpiAuthority,
          identityRegistryProgram: identityProgram.programId,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([reviewerAuthority])
        .rpc(),
      "IdentityBondRequired"
    );

    await identityProgram.methods
      .depositIdentityBond()
      .accountsStrict({
        authority: reviewerAuthority.publicKey,
        identity: reviewerIdentity,
        identityBond: reviewerBond,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([reviewerAuthority])
      .rpc();

    await receiptProgram.methods
      .emitAuditReceipt(
        CHALLENGE_KIND,
        domain,
        testBytes32(178),
        new anchor.BN(0),
        0,
        new anchor.BN(20)
      )
      .accountsStrict({
        authority: reviewerAuthority.publicKey,
        auditorIdentity: reviewerIdentity,
        identityBond: reviewerBond,
        targetIdentity: builderIdentity,
        targetReceipt,
        auditReceipt,
        domainCatalog,
        cpiAuthority,
        identityRegistryProgram: identityProgram.programId,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([reviewerAuthority])
      .rpc();

    await attesterProgram.methods
      .registerAttester("review", 1)
      .accountsStrict({
        authority: reviewerAuthority.publicKey,
        identity: reviewerIdentity,
        identityBond: reviewerBond,
        config: attesterConfig,
        attester: attesterRecord,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([reviewerAuthority])
      .rpc();
    await attesterProgram.methods
      .setAttesterTier(2)
      .accountsStrict({
        curator: builderAuthority,
        config: attesterConfig,
        attester: attesterRecord,
      })
      .rpc();

    const reviewerIdentityRecord =
      await identityProgram.account.agentIdentity.fetch(reviewerIdentity);
    strictEqual(reviewerIdentityRecord.tier, 1);
    const targetIdentityRecord =
      await identityProgram.account.agentIdentity.fetch(builderIdentity);
    strictEqual(targetIdentityRecord.openChallengeCount, 1);

    const attester =
      await attesterProgram.account.attesterRecord.fetch(attesterRecord);
    strictEqual(attester.effectiveTier, 2);
  });
});

function identityPda(authority: anchor.web3.PublicKey, agentId: Uint8Array) {
  return pda(anchor.workspace.identityRegistry.programId, [
    seed(IDENTITY_SEED),
    authority.toBuffer(),
    Buffer.from(agentId),
  ])[0];
}

function identityBondPda(identity: anchor.web3.PublicKey) {
  return pda(anchor.workspace.identityRegistry.programId, [
    seed(IDENTITY_BOND_SEED),
    identity.toBuffer(),
  ])[0];
}

function taskPda(identity: anchor.web3.PublicKey, taskId: Uint8Array) {
  return pda(anchor.workspace.taskRegistry.programId, [
    seed(TASK_SEED),
    identity.toBuffer(),
    Buffer.from(taskId),
  ])[0];
}

function receiptPda(
  identity: anchor.web3.PublicKey,
  task: anchor.web3.PublicKey,
  receiptId: Uint8Array
) {
  return pda(anchor.workspace.receiptEmitter.programId, [
    seed(RECEIPT_SEED),
    identity.toBuffer(),
    task.toBuffer(),
    Buffer.from(receiptId),
  ])[0];
}

function auditReceiptPda(
  auditorIdentity: anchor.web3.PublicKey,
  targetReceipt: anchor.web3.PublicKey,
  kind: number,
  round: number
) {
  return pda(anchor.workspace.receiptEmitter.programId, [
    seed(AUDIT_RECEIPT_SEED),
    auditorIdentity.toBuffer(),
    targetReceipt.toBuffer(),
    Buffer.from([kind]),
    u16(round),
  ])[0];
}

function runtimeAttestationPda(
  identity: anchor.web3.PublicKey,
  runtimeCommit: Uint8Array
) {
  return pda(anchor.workspace.identityRegistry.programId, [
    seed(RUNTIME_ATTESTATION_SEED),
    identity.toBuffer(),
    Buffer.from(runtimeCommit),
  ])[0];
}

function attesterRecordPda(identity: anchor.web3.PublicKey) {
  return pda(anchor.workspace.attesterRegistry.programId, [
    seed(ATTESTER_RECORD_SEED),
    identity.toBuffer(),
  ])[0];
}

function pda(programId: anchor.web3.PublicKey, seeds: Buffer[]) {
  return anchor.web3.PublicKey.findProgramAddressSync(seeds, programId);
}

function seed(value: string) {
  return Buffer.from(value);
}

function u16(value: number) {
  const buffer = Buffer.alloc(2);
  buffer.writeUInt16LE(value, 0);
  return buffer;
}

function bytes32(byte: number) {
  return Buffer.alloc(32, byte);
}

function testBytes32(byte: number) {
  return bytes32(byte & 0xff);
}

async function fund(recipient: anchor.web3.PublicKey) {
  const signature = await anchor
    .getProvider()
    .connection.requestAirdrop(recipient, anchor.web3.LAMPORTS_PER_SOL);
  await anchor.getProvider().connection.confirmTransaction(signature);
}

async function expectAnchorError<T>(promise: Promise<T>, errorName: string) {
  try {
    await promise;
  } catch (error) {
    const message = String(error);
    if (message.includes(errorName)) {
      return;
    }
    throw error;
  }

  throw new Error(`expected Anchor error ${errorName}`);
}
