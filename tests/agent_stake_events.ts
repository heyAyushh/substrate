import * as anchor from "@anchor-lang/core";
import { Program } from "@anchor-lang/core";
import { ok, strictEqual } from "assert";
import { createHash } from "crypto";
import { AgentStake } from "../target/types/agent_stake";
import { IdentityRegistry } from "../target/types/identity_registry";
import { ReceiptEmitter } from "../target/types/receipt_emitter";
import { ReputationAccumulator } from "../target/types/reputation_accumulator";
import { TaskRegistry } from "../target/types/task_registry";

const IDENTITY_SEED = "identity";
const TASK_SEED = "task";
const RECEIPT_SEED = "receipt";
const STAKE_SEED = "stake";
const SLASH_MARKER_SEED = "slash_marker";
const SUBTASK_COUNT = 0;
const STAKE_AMOUNT = new anchor.BN(1_000_000);
const UNSTAKE_AMOUNT = new anchor.BN(250_000);
const SLASH_AMOUNT = new anchor.BN(100_000);
const STAKE_INITIALIZED_EVENT = "StakeInitialized";
const STAKE_DEPOSITED_EVENT = "StakeDeposited";
const STAKE_UNSTAKE_REQUESTED_EVENT = "StakeUnstakeRequested";
const STAKE_UNSTAKE_FINALIZED_EVENT = "StakeUnstakeFinalized";
const STAKE_SLASHED_EVENT = "StakeSlashed";
const DISPUTE_RESOLVED_RECEIPT_KIND = 5;
const TEST_RUN_NAMESPACE = anchor.web3.Keypair.generate().publicKey.toBase58();

describe("agent_stake structured events", () => {
  anchor.setProvider(anchor.AnchorProvider.env());
  let cpiAuthority: anchor.web3.PublicKey;
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
          curator: provider.wallet.publicKey,
          domainCatalog,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();
    }

    const domain = bytes32(174);
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
            curator: provider.wallet.publicKey,
            domainCatalog,
          })
          .rpc();
      }
    } catch {
      await reputationProgram.methods
        .registerDomain(domain)
        .accountsStrict({
          curator: provider.wallet.publicKey,
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

  it("emits structured events for every stake lifecycle state change", async () => {
    const agentId = testBytes32(171);
    const taskId = testBytes32(172);
    const receiptId = testBytes32(173);
    const domain = bytes32(174);
    const payloadHash = testBytes32(175);

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
      .createIdentity(agentId, testBytes32(176), testBytes32(177))
      .accountsStrict({
        identity,
        authority: owner,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    await taskProgram.methods
      .createTask(taskId, testBytes32(178), SUBTASK_COUNT)
      .accountsStrict({
        authority: owner,
        identity,
        task,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    const initialized = await captureEvent(
      stakeProgram,
      STAKE_INITIALIZED_EVENT,
      async () => {
        return await stakeProgram.methods
          .initializeStake(owner)
          .accountsStrict({
            owner,
            identity,
            stake,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .rpc();
      }
    );

    strictEqual(initialized.identity.toBase58(), identity.toBase58());
    strictEqual(initialized.authority.toBase58(), owner.toBase58());
    strictEqual(initialized.slashAuthority.toBase58(), owner.toBase58());
    ok(Number(initialized.slot.toString()) > 0);

    const deposited = await captureEvent(
      stakeProgram,
      STAKE_DEPOSITED_EVENT,
      async () => {
        return await stakeProgram.methods
          .stake(STAKE_AMOUNT)
          .accountsStrict({
            owner,
            stake,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .rpc();
      }
    );

    strictEqual(deposited.identity.toBase58(), identity.toBase58());
    strictEqual(deposited.authority.toBase58(), owner.toBase58());
    strictEqual(deposited.amount.toString(), STAKE_AMOUNT.toString());
    ok(Number(deposited.slot.toString()) > 0);

    const requested = await captureEvent(
      stakeProgram,
      STAKE_UNSTAKE_REQUESTED_EVENT,
      async () => {
        return await stakeProgram.methods
          .requestUnstake(UNSTAKE_AMOUNT)
          .accountsStrict({
            owner,
            stake,
          })
          .rpc();
      }
    );

    strictEqual(requested.identity.toBase58(), identity.toBase58());
    strictEqual(requested.authority.toBase58(), owner.toBase58());
    strictEqual(requested.amount.toString(), UNSTAKE_AMOUNT.toString());
    strictEqual(
      requested.pendingUnstakeAmount.toString(),
      UNSTAKE_AMOUNT.toString()
    );
    ok(Number(requested.slot.toString()) > 0);

    await waitForSlot(Number(requested.unlocksAtSlot.toString()));

    const finalized = await captureEvent(
      stakeProgram,
      STAKE_UNSTAKE_FINALIZED_EVENT,
      async () => {
        return await stakeProgram.methods
          .finalizeUnstake()
          .accountsStrict({
            owner,
            stake,
          })
          .rpc();
      }
    );

    strictEqual(finalized.identity.toBase58(), identity.toBase58());
    strictEqual(finalized.authority.toBase58(), owner.toBase58());
    strictEqual(finalized.amount.toString(), UNSTAKE_AMOUNT.toString());
    ok(Number(finalized.slot.toString()) > 0);

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

    const slashed = await captureEvent(
      stakeProgram,
      STAKE_SLASHED_EVENT,
      async () => {
        return await stakeProgram.methods
          .slash(SLASH_AMOUNT)
          .accountsStrict({
            slashAuthority: owner,
            stake,
            disputeReceipt: receipt,
            slashMarker,
            treasury: owner,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .rpc();
      }
    );

    strictEqual(slashed.identity.toBase58(), identity.toBase58());
    strictEqual(slashed.authority.toBase58(), owner.toBase58());
    strictEqual(slashed.amount.toString(), SLASH_AMOUNT.toString());
    strictEqual(slashed.disputeReceipt.toBase58(), receipt.toBase58());
    ok(Number(slashed.slot.toString()) > 0);
  });
});

async function captureEvent(
  program: Program<any>,
  eventName: string,
  action: () => Promise<string>
): Promise<any> {
  const connection = anchor.AnchorProvider.env().connection;
  const parser = new anchor.EventParser(program.programId, program.coder);
  const signature = await action();
  const maxAttempts = 30;
  const pollDelayMs = 500;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const transaction = await connection.getTransaction(signature, {
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0,
    });
    const logs = transaction?.meta?.logMessages;

    if (logs) {
      for (const parsedEvent of parser.parseLogs(logs)) {
        if (parsedEvent.name.toLowerCase() === eventName.toLowerCase()) {
          return parsedEvent.data;
        }
      }
    }

    await new Promise((resolve) => setTimeout(resolve, pollDelayMs));
  }

  throw new Error(`Timeout waiting for ${eventName}`);
}

async function waitForSlot(targetSlot: number) {
  const connection = anchor.AnchorProvider.env().connection;
  while ((await connection.getSlot("confirmed")) <= targetSlot) {
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
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
      .update(`agent_stake_events:${TEST_RUN_NAMESPACE}:${value}`)
      .digest()
  );
}

function asBuffer(value: number[]): Buffer {
  return Buffer.from(value);
}
