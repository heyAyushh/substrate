import * as anchor from "@anchor-lang/core";
import { Program } from "@anchor-lang/core";
import { strictEqual, ok } from "assert";
import { AgentStake } from "../target/types/agent_stake";
import { DisputeResolver } from "../target/types/dispute_resolver";
import { IdentityRegistry } from "../target/types/identity_registry";
import { ReceiptEmitter } from "../target/types/receipt_emitter";
import { ReputationAccumulator } from "../target/types/reputation_accumulator";
import { TaskRegistry } from "../target/types/task_registry";

const IDENTITY_SEED = "identity";
const TASK_SEED = "task";
const RECEIPT_SEED = "receipt";
const STAKE_SEED = "stake";
const SLASH_MARKER_SEED = "slash_marker";
const ADJUDICATOR_CONFIG_SEED = "adjudicator_config";
const TREASURY_VAULT_SEED = "treasury";
const COMPLETION_RECEIPT_KIND = 3;
const DISPUTE_RESOLVED_RECEIPT_KIND = 5;
const SUBTASK_COUNT = 0;
const STAKE_AMOUNT = new anchor.BN(1_000_000);
const UNSTAKE_AMOUNT = new anchor.BN(250_000);
const SLASH_AMOUNT = new anchor.BN(100_000);
const TRUST_MODE_AUTHORITY = 1;

describe("agent_stake", () => {
  anchor.setProvider(anchor.AnchorProvider.env());
  let cpiAuthority: anchor.web3.PublicKey;
  let domainCatalog: anchor.web3.PublicKey;
  let treasuryVault: anchor.web3.PublicKey;
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

    const reputationProgram = anchor.workspace
      .reputationAccumulator as Program<ReputationAccumulator>;
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
          curator: owner,
          domainCatalog,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();
    }

    const domain = bytes32(74);
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
            curator: owner,
            domainCatalog,
          })
          .rpc();
      }
    } catch {
      await reputationProgram.methods
        .registerDomain(domain)
        .accountsStrict({
          curator: owner,
          domainCatalog,
        })
        .rpc();
    }
  });

  const provider = anchor.AnchorProvider.env();
  const owner = provider.wallet.publicKey;
  const identityProgram = anchor.workspace
    .identityRegistry as Program<IdentityRegistry>;
  const taskProgram = anchor.workspace.taskRegistry as Program<TaskRegistry>;
  const receiptProgram = anchor.workspace
    .receiptEmitter as Program<ReceiptEmitter>;
  const stakeProgram = anchor.workspace.agentStake as Program<AgentStake>;
  const disputeProgram = anchor.workspace
    .disputeResolver as Program<DisputeResolver>;

  it("stakes, cooldown-unstakes, and slash-binds to a dispute receipt", async () => {
    const agentId = bytes32(71);
    const taskId = bytes32(72);
    const receiptId = bytes32(73);
    const domain = bytes32(74);
    const payloadHash = bytes32(75);

    const [identity] = pda(identityProgram, [
      seed(IDENTITY_SEED),
      owner.toBuffer(),
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
    const [stake] = pda(stakeProgram, [seed(STAKE_SEED), identity.toBuffer()]);
    const [slashMarker] = pda(stakeProgram, [
      seed(SLASH_MARKER_SEED),
      stake.toBuffer(),
      receipt.toBuffer(),
    ]);

    await identityProgram.methods
      .createIdentity(agentId, bytes32(76), bytes32(77))
      .accountsStrict({
        identity,
        authority: owner,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    await taskProgram.methods
      .createTask(taskId, bytes32(78), SUBTASK_COUNT, domain)
      .accountsStrict({
        authority: owner,
        identity,
        task,
        identityRegistryProgram: identityProgram.programId,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    await stakeProgram.methods
      .initializeStake(owner, TRUST_MODE_AUTHORITY)
      .accountsStrict({
        owner,
        identity,
        stake,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    await stakeProgram.methods
      .stake(STAKE_AMOUNT)
      .accountsStrict({
        owner,
        stake,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    let stakeAccount = await stakeProgram.account.stakeAccount.fetch(stake);
    strictEqual(stakeAccount.amount.toString(), STAKE_AMOUNT.toString());

    await stakeProgram.methods
      .requestUnstake(UNSTAKE_AMOUNT)
      .accountsStrict({ owner, stake })
      .rpc();

    await expectAnchorError(
      stakeProgram.methods
        .finalizeUnstake()
        .accountsStrict({ owner, stake })
        .rpc(),
      "StakeCooldownNotElapsed"
    );

    stakeAccount = await stakeProgram.account.stakeAccount.fetch(stake);
    await waitForSlot(Number(stakeAccount.unstakeUnlocksAt));

    await stakeProgram.methods
      .finalizeUnstake()
      .accountsStrict({ owner, stake })
      .rpc();

    stakeAccount = await stakeProgram.account.stakeAccount.fetch(stake);
    strictEqual(
      stakeAccount.amount.toString(),
      STAKE_AMOUNT.sub(UNSTAKE_AMOUNT).toString()
    );

    await receiptProgram.methods
      .emitReceipt(
        receiptId,
        DISPUTE_RESOLVED_RECEIPT_KIND,
        new anchor.BN(1),
        domain,
        bytes32(0),
        payloadHash
      )
      .accountsStrict({
        authority: owner,
        identity,
        task,
        receipt,
        domainCatalog,
        systemProgram: anchor.web3.SystemProgram.programId,
        cpiAuthority,
        taskRegistryProgram: taskProgram.programId,
      })
      .rpc();

    await ensureTreasuryVault(disputeProgram, owner);

    await stakeProgram.methods
      .slashWithAuthority(SLASH_AMOUNT)
      .accountsStrict({
        slashAuthority: owner,
        stake,
        disputeReceipt: receipt,
        slashMarker,
        treasuryVault,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    stakeAccount = await stakeProgram.account.stakeAccount.fetch(stake);
    strictEqual(
      stakeAccount.amount.toString(),
      STAKE_AMOUNT.sub(UNSTAKE_AMOUNT).sub(SLASH_AMOUNT).toString()
    );
    strictEqual(stakeAccount.slashedTotal.toString(), SLASH_AMOUNT.toString());

    const markerAccount = await stakeProgram.account.slashMarker.fetch(
      slashMarker
    );
    strictEqual(markerAccount.disputeReceipt.toBase58(), receipt.toBase58());

    await expectAnchorError(
      stakeProgram.methods
        .slashWithAuthority(SLASH_AMOUNT)
        .accountsStrict({
          slashAuthority: owner,
          stake,
          disputeReceipt: receipt,
          slashMarker,
          treasuryVault,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc(),
      "AccountAlreadyInitialized"
    );

  });

  it("rejects zero-lamport stake writes with a program error", async () => {
    const agentId = bytes32(81);
    const [identity] = pda(identityProgram, [
      seed(IDENTITY_SEED),
      owner.toBuffer(),
      asBuffer(agentId),
    ]);
    const [stake] = pda(stakeProgram, [seed(STAKE_SEED), identity.toBuffer()]);

    await identityProgram.methods
      .createIdentity(agentId, bytes32(82), bytes32(83))
      .accountsStrict({
        identity,
        authority: owner,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    await stakeProgram.methods
      .initializeStake(owner, TRUST_MODE_AUTHORITY)
      .accountsStrict({
        owner,
        identity,
        stake,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    await expectAnchorError(
      stakeProgram.methods
        .stake(new anchor.BN(0))
        .accountsStrict({
          owner,
          stake,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc(),
      "StakeAmountMustBePositive"
    );
  });

  it("rejects invalid slash signers, receipt kinds, and receipt identities", async () => {
    const wrongSlashAuthority = anchor.web3.Keypair.generate();
    await fund(wrongSlashAuthority.publicKey);

    const agent = await createIdentityTaskAndReceipt({
      agentId: 91,
      taskId: 92,
      receiptId: 93,
      receiptKind: COMPLETION_RECEIPT_KIND,
    });
    const [stake] = pda(stakeProgram, [
      seed(STAKE_SEED),
      agent.identity.toBuffer(),
    ]);
    const [completionSlashMarker] = pda(stakeProgram, [
      seed(SLASH_MARKER_SEED),
      stake.toBuffer(),
      agent.receipt.toBuffer(),
    ]);

    await stakeProgram.methods
      .initializeStake(owner, TRUST_MODE_AUTHORITY)
      .accountsStrict({
        owner,
        identity: agent.identity,
        stake,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    await stakeProgram.methods
      .stake(STAKE_AMOUNT)
      .accountsStrict({
        owner,
        stake,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    await ensureTreasuryVault(disputeProgram, owner);

    await expectAnchorError(
      stakeProgram.methods
        .slashWithAuthority(SLASH_AMOUNT)
        .accountsStrict({
          slashAuthority: wrongSlashAuthority.publicKey,
          stake,
          disputeReceipt: agent.receipt,
          slashMarker: completionSlashMarker,
          treasuryVault,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([wrongSlashAuthority])
        .rpc(),
      "StakeSlashAuthorityMismatch"
    );

    await expectAnchorError(
      stakeProgram.methods
        .slashWithAuthority(SLASH_AMOUNT)
        .accountsStrict({
          slashAuthority: owner,
          stake,
          disputeReceipt: agent.receipt,
          slashMarker: completionSlashMarker,
          treasuryVault,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc(),
      "StakeReceiptKindMismatch"
    );

    const foreignAgent = await createIdentityTaskAndReceipt({
      agentId: 94,
      taskId: 95,
      receiptId: 96,
      receiptKind: DISPUTE_RESOLVED_RECEIPT_KIND,
    });
    const [foreignSlashMarker] = pda(stakeProgram, [
      seed(SLASH_MARKER_SEED),
      stake.toBuffer(),
      foreignAgent.receipt.toBuffer(),
    ]);

    await expectAnchorError(
      stakeProgram.methods
        .slashWithAuthority(SLASH_AMOUNT)
        .accountsStrict({
          slashAuthority: owner,
          stake,
          disputeReceipt: foreignAgent.receipt,
          slashMarker: foreignSlashMarker,
          treasuryVault,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc(),
      "StakeReceiptIdentityMismatch"
    );
  });

  async function waitForSlot(targetSlot: number) {
    while ((await provider.connection.getSlot()) < targetSlot) {
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
    ok((await provider.connection.getSlot()) >= targetSlot);
  }

  async function fund(publicKey: anchor.web3.PublicKey) {
    await provider.sendAndConfirm(
      new anchor.web3.Transaction().add(
        anchor.web3.SystemProgram.transfer({
          fromPubkey: owner,
          toPubkey: publicKey,
          lamports: 1_000_000_000,
        })
      )
    );
  }

  async function createIdentityTaskAndReceipt(input: {
    agentId: number;
    taskId: number;
    receiptId: number;
    receiptKind: number;
  }) {
    const agentId = bytes32(input.agentId);
    const taskId = bytes32(input.taskId);
    const receiptId = bytes32(input.receiptId);
    const [identity] = pda(identityProgram, [
      seed(IDENTITY_SEED),
      owner.toBuffer(),
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

    await identityProgram.methods
      .createIdentity(
        agentId,
        bytes32(input.agentId + 10),
        bytes32(input.agentId + 20)
      )
      .accountsStrict({
        identity,
        authority: owner,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    await taskProgram.methods
      .createTask(taskId, bytes32(input.taskId + 20), SUBTASK_COUNT, domain)
      .accountsStrict({
        authority: owner,
        identity,
        task,
        identityRegistryProgram: identityProgram.programId,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    await receiptProgram.methods
      .emitReceipt(
        receiptId,
        input.receiptKind,
        new anchor.BN(1),
        bytes32(0),
        bytes32(0),
        bytes32(input.receiptId + 30)
      )
      .accountsStrict({
        authority: owner,
        identity,
        task,
        receipt,
        domainCatalog,
        systemProgram: anchor.web3.SystemProgram.programId,
        cpiAuthority,
        taskRegistryProgram: taskProgram.programId,
      })
      .rpc();

    return { identity, task, receipt };
  }

  async function ensureTreasuryVault(
    program: Program<DisputeResolver>,
    adjudicator: anchor.web3.PublicKey
  ) {
    if (treasuryVault) {
      return;
    }

    const [adjudicatorConfig] = pda(program, [seed(ADJUDICATOR_CONFIG_SEED)]);
    const [treasury] = pda(program, [seed(TREASURY_VAULT_SEED)]);

    try {
      await program.account.treasuryVault.fetch(treasury);
    } catch {
      await program.methods
        .registerAdjudicator(adjudicator)
        .accountsStrict({
          governance: owner,
          adjudicatorConfig,
          treasuryVault: treasury,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();
    }

    treasuryVault = treasury;
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
    const message = String(error?.message ?? "");
    const logs: string[] = error?.logs ?? error?.error?.logs ?? [];
    const combined = message + " " + logs.join(" ");
    if (combined.includes(expectedCode)) return;
    if (
      expectedCode === "AccountAlreadyInitialized" &&
      (message.includes("custom program error: 0x0") ||
        logs.some((l: string) => l.includes("already in use")))
    ) {
      return;
    }
    strictEqual(actualCode, expectedCode);
    return;
  }

  throw new Error(`Expected Anchor error ${expectedCode}`);
}
