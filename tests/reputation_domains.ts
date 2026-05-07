import * as anchor from "@anchor-lang/core";
import { Program } from "@anchor-lang/core";
import { strictEqual } from "assert";
import { createHash } from "crypto";
import { IdentityRegistry } from "../target/types/identity_registry";
import { ReceiptEmitter } from "../target/types/receipt_emitter";
import { ReputationAccumulator } from "../target/types/reputation_accumulator";
import { TaskRegistry } from "../target/types/task_registry";
import { DisputeResolver } from "../target/types/dispute_resolver";
import { AttesterRegistry } from "../target/types/attester_registry";

const IDENTITY_SEED = "identity";
const IDENTITY_BOND_SEED = "bond";
const TASK_SEED = "task";
const RECEIPT_SEED = "receipt";
const REPUTATION_SEED = "reputation";
const DOMAIN_CATALOG_SEED = "domain_catalog";
const DOMAIN_STATS_SEED = "domain_stats";
const ADJUDICATOR_CONFIG_SEED = "adjudicator_config";
const AUDIT_RECEIPT_SEED = "audit_receipt";
const ATTESTER_CONFIG_SEED = "attester_config";
const ATTESTER_RECORD_SEED = "attester";
const VERDICT_SEED = "verdict";
const COMPLETION_RECEIPT_KIND = 3;
const DISPUTE_RECEIPT_KIND = 4;
const ATTESTATION_RECEIPT_KIND = 8;
const AGENT_LOST_OUTCOME = 1;
const VERDICT_CLASS_SAFETY = 0;
const TEST_RUN_NAMESPACE = anchor.web3.Keypair.generate().publicKey.toBase58();

function bytes32(value: number): number[] {
  return Array.from(Buffer.alloc(32, value));
}

function scopedBytes32(label: string): number[] {
  return Array.from(
    createHash("sha256")
      .update(`reputation_domains:${TEST_RUN_NAMESPACE}:${label}`)
      .digest(),
  );
}

function seed(value: string): Buffer {
  return Buffer.from(value, "utf8");
}

function u16Le(value: number): Buffer {
  const buffer = Buffer.alloc(2);
  buffer.writeUInt16LE(value);
  return buffer;
}

function u64Le(value: number): Buffer {
  return new anchor.BN(value).toArrayLike(Buffer, "le", 8);
}

function pda<T>(
  program: Program<T>,
  seeds: Array<Buffer>,
): [anchor.web3.PublicKey, number] {
  return anchor.web3.PublicKey.findProgramAddressSync(seeds, program.programId);
}

async function expectAnchorError(
  promise: Promise<unknown>,
  expectedCode: string,
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
  const disputeProgram = anchor.workspace
    .disputeResolver as Program<DisputeResolver>;
  const attesterProgram = anchor.workspace
    .attesterRegistry as Program<AttesterRegistry>;

  const [domainCatalog] = pda(reputationProgram, [seed(DOMAIN_CATALOG_SEED)]);
  const [attesterConfig] = pda(attesterProgram, [seed(ATTESTER_CONFIG_SEED)]);

  let cpiAuthority: anchor.web3.PublicKey;

  before(async () => {
    const [pda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("cpi_authority", "utf8")],
      receiptProgram.programId,
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

    try {
      await attesterProgram.account.attesterRegistryConfig.fetch(
        attesterConfig,
      );
    } catch {
      await attesterProgram.methods
        .initializeRegistry()
        .accountsStrict({
          curator: authority,
          config: attesterConfig,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();
    }
  });

  async function ensureDomainRegistered(domain: number[]) {
    const catalog =
      await reputationProgram.account.reputationDomainCatalog.fetch(
        domainCatalog,
      );
    const alreadyRegistered = catalog.domains.some((registered: number[]) =>
      Buffer.from(registered).equals(Buffer.from(domain)),
    );
    if (alreadyRegistered) {
      return;
    }

    await reputationProgram.methods
      .registerDomain(domain)
      .accountsStrict({
        curator: authority,
        domainCatalog,
      })
      .rpc();
  }

  async function createIdentityAndTask(
    agentByte: number,
    taskByte: number,
    domain: number[] = bytes32(taskByte + 2),
  ): Promise<{
    identity: anchor.web3.PublicKey;
    task: anchor.web3.PublicKey;
  }> {
    const agentId = scopedBytes32(`agent:${agentByte}`);
    const taskId = scopedBytes32(`task:${taskByte}`);
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
        .createIdentity(
          agentId,
          scopedBytes32(`policy:${agentByte}`),
          scopedBytes32(`history:${agentByte}`),
        )
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
        .createTask(taskId, scopedBytes32(`subtasks:${taskByte}`), 2, domain)
        .accountsStrict({
          authority,
          identity,
          task,
          identityRegistryProgram: identityProgram.programId,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();
    }

    return { identity, task };
  }

  async function ensureBondedAttester(
    identity: anchor.web3.PublicKey,
    tier: number,
  ): Promise<{
    identityBond: anchor.web3.PublicKey;
    attesterRecord: anchor.web3.PublicKey;
  }> {
    const [identityBond] = pda(identityProgram, [
      seed(IDENTITY_BOND_SEED),
      identity.toBuffer(),
    ]);
    try {
      await identityProgram.account.identityBond.fetch(identityBond);
    } catch {
      await identityProgram.methods
        .depositIdentityBond()
        .accountsStrict({
          authority,
          identity,
          identityBond,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();
    }

    const [attesterRecord] = pda(attesterProgram, [
      seed(ATTESTER_RECORD_SEED),
      identity.toBuffer(),
    ]);
    try {
      await attesterProgram.account.attesterRecord.fetch(attesterRecord);
    } catch {
      await attesterProgram.methods
        .registerAttester("review", tier)
        .accountsStrict({
          authority,
          identity,
          identityBond,
          config: attesterConfig,
          attester: attesterRecord,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();
    }

    await attesterProgram.methods
      .setAttesterTier(tier)
      .accountsStrict({
        curator: authority,
        config: attesterConfig,
        attester: attesterRecord,
      })
      .rpc();

    return { identityBond, attesterRecord };
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
          new anchor.BN(0),
        )
        .accountsStrict({
          authority,
          identity,
          reputation,
          domainCatalog,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc(),
      "DomainNotRegistered",
    );
  });

  it("emitting receipt with unregistered non-empty domain fails", async () => {
    const unregisteredDomain = bytes32(212);
    const { identity, task } = await createIdentityAndTask(
      210,
      211,
      unregisteredDomain,
    );
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
          bytes32(214),
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
      "DomainNotRegistered",
    );
  });

  it("deprecated domain still validates receipts but rejects new create_reputation_domain calls", async () => {
    const domain = bytes32(220);
    await ensureDomainRegistered(domain);

    const { identity, task } = await createIdentityAndTask(221, 222, domain);
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
        bytes32(224),
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
        new anchor.BN(0),
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
      226,
      domain,
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
          new anchor.BN(0),
        )
        .accountsStrict({
          authority,
          identity: identity2,
          reputation: reputation2,
          domainCatalog,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc(),
      "DomainNotRegistered",
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
        bytes32(228),
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

  it("allows a third-party caller to apply verified reputation receipts", async () => {
    const domain = bytes32(230);
    const outsider = anchor.web3.Keypair.generate();
    await ensureDomainRegistered(domain);

    const { identity, task } = await createIdentityAndTask(231, 232, domain);
    const receiptId = bytes32(233);
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
        bytes32(234),
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
    const [receiptApplication] = pda(reputationProgram, [
      Buffer.from("reputation_receipt_application", "utf8"),
      reputation.toBuffer(),
      receipt.toBuffer(),
    ]);

    await reputationProgram.methods
      .createReputationDomain(
        domain,
        new anchor.BN(0),
        new anchor.BN(0),
        new anchor.BN(0),
      )
      .accountsStrict({
        authority,
        identity,
        reputation,
        domainCatalog,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    await fund(outsider.publicKey);

    await reputationProgram.methods
      .applyReputationReceipt()
      .accountsStrict({
        authority: outsider.publicKey,
        identity,
        receipt,
        reputation,
        receiptApplication,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([outsider])
      .rpc();

    const reputationAccount =
      await reputationProgram.account.reputationAccumulator.fetch(reputation);
    strictEqual(reputationAccount.completed.toNumber(), 1);
    strictEqual(reputationAccount.weightedCompleted.toNumber(), 1);
    strictEqual(reputationAccount.reviewerWeightSum.toNumber(), 1);
    strictEqual(reputationAccount.disputed.toNumber(), 0);
  });

  it("weights bonded attester audit receipts on-chain", async () => {
    const domain = bytes32(235);
    await ensureDomainRegistered(domain);
    const builder = await createIdentityAndTask(236, 237, domain);
    const reviewerAgentId = scopedBytes32("reviewer:238");
    const [reviewerIdentity] = pda(identityProgram, [
      seed(IDENTITY_SEED),
      authority.toBuffer(),
      Buffer.from(reviewerAgentId),
    ]);

    try {
      await identityProgram.account.agentIdentity.fetch(reviewerIdentity);
    } catch {
      await identityProgram.methods
        .createIdentity(
          reviewerAgentId,
          scopedBytes32("reviewer-policy:239"),
          scopedBytes32("reviewer-history:240"),
        )
        .accountsStrict({
          identity: reviewerIdentity,
          authority,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();
    }
    const { identityBond: reviewerBond, attesterRecord } =
      await ensureBondedAttester(reviewerIdentity, 2);

    const completionReceiptId = bytes32(241);
    const [completionReceipt] = pda(receiptProgram, [
      seed(RECEIPT_SEED),
      builder.identity.toBuffer(),
      builder.task.toBuffer(),
      Buffer.from(completionReceiptId),
    ]);
    await receiptProgram.methods
      .emitReceipt(
        completionReceiptId,
        COMPLETION_RECEIPT_KIND,
        new anchor.BN(1),
        domain,
        bytes32(0),
        bytes32(242),
      )
      .accountsStrict({
        authority,
        identity: builder.identity,
        task: builder.task,
        receipt: completionReceipt,
        cpiAuthority,
        domainCatalog,
        taskRegistryProgram: taskProgram.programId,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    const [attestationReceipt] = pda(receiptProgram, [
      seed(AUDIT_RECEIPT_SEED),
      reviewerIdentity.toBuffer(),
      completionReceipt.toBuffer(),
      Buffer.from([ATTESTATION_RECEIPT_KIND]),
      u16Le(0),
    ]);
    await receiptProgram.methods
      .emitAuditReceipt(
        ATTESTATION_RECEIPT_KIND,
        domain,
        bytes32(243),
        new anchor.BN(2),
        0,
        new anchor.BN(0),
      )
      .accountsStrict({
        authority,
        auditorIdentity: reviewerIdentity,
        identityBond: reviewerBond,
        targetIdentity: builder.identity,
        targetReceipt: completionReceipt,
        auditReceipt: attestationReceipt,
        domainCatalog,
        cpiAuthority,
        identityRegistryProgram: identityProgram.programId,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    const [reputation] = pda(reputationProgram, [
      seed(REPUTATION_SEED),
      builder.identity.toBuffer(),
      Buffer.from(domain),
    ]);
    const [receiptApplication] = pda(reputationProgram, [
      Buffer.from("reputation_receipt_application", "utf8"),
      reputation.toBuffer(),
      attestationReceipt.toBuffer(),
    ]);
    await reputationProgram.methods
      .createReputationDomain(
        domain,
        new anchor.BN(0),
        new anchor.BN(0),
        new anchor.BN(0),
      )
      .accountsStrict({
        authority,
        identity: builder.identity,
        reputation,
        domainCatalog,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    await reputationProgram.methods
      .applyReputationReceipt()
      .accountsStrict({
        authority,
        identity: builder.identity,
        receipt: attestationReceipt,
        reputation,
        receiptApplication,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .remainingAccounts([
        { pubkey: reviewerIdentity, isSigner: false, isWritable: false },
        { pubkey: reviewerBond, isSigner: false, isWritable: false },
        { pubkey: attesterRecord, isSigner: false, isWritable: false },
      ])
      .rpc();

    const reputationAccount =
      await reputationProgram.account.reputationAccumulator.fetch(reputation);
    strictEqual(reputationAccount.attested.toNumber(), 1);
    strictEqual(reputationAccount.weightedAttested.toNumber(), 4);
    strictEqual(reputationAccount.reviewerWeightSum.toNumber(), 4);
  });

  it("requires a verdict before dispute receipts can degrade reputation", async () => {
    const domain = bytes32(240);
    await ensureDomainRegistered(domain);
    const builder = await createIdentityAndTask(241, 242, domain);
    const reviewerAgentId = scopedBytes32("reviewer:243");
    const [reviewerIdentity] = pda(identityProgram, [
      seed(IDENTITY_SEED),
      authority.toBuffer(),
      Buffer.from(reviewerAgentId),
    ]);

    try {
      await identityProgram.account.agentIdentity.fetch(reviewerIdentity);
    } catch {
      await identityProgram.methods
        .createIdentity(
          reviewerAgentId,
          scopedBytes32("reviewer-policy:244"),
          scopedBytes32("reviewer-history:245"),
        )
        .accountsStrict({
          identity: reviewerIdentity,
          authority,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();
    }

    const completionReceiptId = bytes32(246);
    const [completionReceipt] = pda(receiptProgram, [
      seed(RECEIPT_SEED),
      builder.identity.toBuffer(),
      builder.task.toBuffer(),
      Buffer.from(completionReceiptId),
    ]);

    await receiptProgram.methods
      .emitReceipt(
        completionReceiptId,
        COMPLETION_RECEIPT_KIND,
        new anchor.BN(1),
        domain,
        bytes32(0),
        bytes32(247),
      )
      .accountsStrict({
        authority,
        identity: builder.identity,
        task: builder.task,
        receipt: completionReceipt,
        cpiAuthority,
        domainCatalog,
        taskRegistryProgram: taskProgram.programId,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    const [disputeReceipt] = pda(receiptProgram, [
      seed(AUDIT_RECEIPT_SEED),
      reviewerIdentity.toBuffer(),
      completionReceipt.toBuffer(),
      Buffer.from([DISPUTE_RECEIPT_KIND]),
      u16Le(0),
    ]);
    const { identityBond: reviewerBond, attesterRecord } =
      await ensureBondedAttester(reviewerIdentity, 2);

    await receiptProgram.methods
      .emitAuditReceipt(
        DISPUTE_RECEIPT_KIND,
        domain,
        bytes32(248),
        new anchor.BN(1),
        0,
        new anchor.BN(0),
      )
      .accountsStrict({
        authority,
        auditorIdentity: reviewerIdentity,
        identityBond: reviewerBond,
        targetIdentity: builder.identity,
        targetReceipt: completionReceipt,
        auditReceipt: disputeReceipt,
        domainCatalog,
        cpiAuthority,
        identityRegistryProgram: identityProgram.programId,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    const [reputation] = pda(reputationProgram, [
      seed(REPUTATION_SEED),
      builder.identity.toBuffer(),
      Buffer.from(domain),
    ]);
    const [receiptApplication] = pda(reputationProgram, [
      Buffer.from("reputation_receipt_application", "utf8"),
      reputation.toBuffer(),
      disputeReceipt.toBuffer(),
    ]);

    await reputationProgram.methods
      .createReputationDomain(
        domain,
        new anchor.BN(0),
        new anchor.BN(0),
        new anchor.BN(0),
      )
      .accountsStrict({
        authority,
        identity: builder.identity,
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
          identity: builder.identity,
          receipt: disputeReceipt,
          reputation,
          receiptApplication,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc(),
      "ReputationVerdictMissing",
    );

    const [adjudicatorConfig] = pda(disputeProgram, [
      seed(ADJUDICATOR_CONFIG_SEED),
    ]);
    const [treasuryVault] = pda(disputeProgram, [seed("treasury")]);
    const [verdict] = pda(disputeProgram, [
      seed(VERDICT_SEED),
      disputeReceipt.toBuffer(),
    ]);

    try {
      await disputeProgram.account.adjudicatorConfig.fetch(adjudicatorConfig);
    } catch {
      await disputeProgram.methods
        .registerAdjudicator(authority)
        .accountsStrict({
          governance: authority,
          adjudicatorConfig,
          treasuryVault,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();
    }

    await disputeProgram.methods
      .recordVerdict(
        AGENT_LOST_OUTCOME,
        new anchor.BN(1),
        VERDICT_CLASS_SAFETY,
        new anchor.BN(0),
      )
      .accountsStrict({
        adjudicator: authority,
        adjudicatorConfig,
        disputeReceipt,
        verdict,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    await reputationProgram.methods
      .applyReputationReceipt()
      .accountsStrict({
        authority,
        identity: builder.identity,
        receipt: disputeReceipt,
        reputation,
        receiptApplication,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .remainingAccounts([
        { pubkey: verdict, isSigner: false, isWritable: false },
        { pubkey: reviewerIdentity, isSigner: false, isWritable: false },
        { pubkey: reviewerBond, isSigner: false, isWritable: false },
        { pubkey: attesterRecord, isSigner: false, isWritable: false },
      ])
      .rpc();

    const reputationAccount =
      await reputationProgram.account.reputationAccumulator.fetch(reputation);
    strictEqual(reputationAccount.disputed.toNumber(), 1);
    strictEqual(reputationAccount.weightedDisputed.toNumber(), 4);
    strictEqual(reputationAccount.reviewerWeightSum.toNumber(), 4);
  });

  it("writes signed domain stats snapshots for registered domains", async () => {
    const domain = bytes32(250);
    const snapshotSlot = 251;
    const receiptCount = 12;
    const taskCount = 4;
    const agentCount = 3;
    const payloadHash = bytes32(252);

    await ensureDomainRegistered(domain);

    const [domainStatsSnapshot] = pda(reputationProgram, [
      seed(DOMAIN_STATS_SEED),
      Buffer.from(domain),
      authority.toBuffer(),
      u64Le(snapshotSlot),
    ]);

    await reputationProgram.methods
      .writeDomainStatsSnapshot(
        domain,
        new anchor.BN(receiptCount),
        new anchor.BN(taskCount),
        new anchor.BN(agentCount),
        new anchor.BN(snapshotSlot),
        payloadHash,
      )
      .accountsStrict({
        operator: authority,
        domainCatalog,
        domainStatsSnapshot,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    const snapshot =
      await reputationProgram.account.domainStatsSnapshot.fetch(
        domainStatsSnapshot,
      );

    strictEqual(
      Buffer.from(snapshot.domain).toString("hex"),
      Buffer.from(domain).toString("hex"),
    );
    strictEqual(snapshot.operator.toBase58(), authority.toBase58());
    strictEqual(snapshot.receiptCount.toNumber(), receiptCount);
    strictEqual(snapshot.taskCount.toNumber(), taskCount);
    strictEqual(snapshot.agentCount.toNumber(), agentCount);
    strictEqual(snapshot.snapshotSlot.toNumber(), snapshotSlot);
    strictEqual(
      Buffer.from(snapshot.payloadHash).toString("hex"),
      Buffer.from(payloadHash).toString("hex"),
    );
  });

  async function fund(publicKey: anchor.web3.PublicKey) {
    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(
        publicKey,
        2 * anchor.web3.LAMPORTS_PER_SOL,
      ),
    );
  }
});
