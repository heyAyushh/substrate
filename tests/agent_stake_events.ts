import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { ok, strictEqual } from "assert";
import { AgentStake } from "../target/types/agent_stake";
import { IdentityRegistry } from "../target/types/identity_registry";
import { ReceiptEmitter } from "../target/types/receipt_emitter";
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
const COMPLETION_RECEIPT_KIND = 3;
const DISPUTE_RESOLVED_RECEIPT_KIND = 5;

describe("agent_stake structured events", () => {
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
  const owner = provider.wallet.publicKey;
  const identityProgram = anchor.workspace
    .identityRegistry as Program<IdentityRegistry>;
  const taskProgram = anchor.workspace.taskRegistry as Program<TaskRegistry>;
  const receiptProgram = anchor.workspace
    .receiptEmitter as Program<ReceiptEmitter>;
  const stakeProgram = anchor.workspace.agentStake as Program<AgentStake>;

  it("emits structured events for every stake lifecycle state change", async () => {
    const agentId = bytes32(171);
    const taskId = bytes32(172);
    const receiptId = bytes32(173);
    const domain = bytes32(174);
    const payloadHash = bytes32(175);

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

    const initialized = await captureEvent(
      STAKE_INITIALIZED_EVENT,
      async () => {
        await identityProgram.methods
          .createIdentity(agentId, bytes32(176), bytes32(177))
          .accountsStrict({
            identity,
            authority: owner,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .rpc();

        await taskProgram.methods
          .createTask(taskId, bytes32(178), SUBTASK_COUNT)
          .accountsStrict({
            authority: owner,
            identity,
            task,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .rpc();

        return await stakeProgram.methods
          .initializeStake(owner)
          .accountsStrict({
            owner,
            identity,
            stake,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .simulate();
      },
      async () => {
        await stakeProgram.methods
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

    strictEqual(initialized.event.identity.toBase58(), identity.toBase58());
    strictEqual(initialized.event.authority.toBase58(), owner.toBase58());
    strictEqual(initialized.event.slashAuthority.toBase58(), owner.toBase58());
    ok(Number(initialized.event.slot.toString()) > 0);

    const deposited = await captureEvent(
      STAKE_DEPOSITED_EVENT,
      () =>
        stakeProgram.methods
          .stake(STAKE_AMOUNT)
          .accountsStrict({
            owner,
            stake,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .simulate(),
      async () => {
        await stakeProgram.methods
          .stake(STAKE_AMOUNT)
          .accountsStrict({
            owner,
            stake,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .rpc();
      }
    );

    strictEqual(deposited.event.identity.toBase58(), identity.toBase58());
    strictEqual(deposited.event.authority.toBase58(), owner.toBase58());
    strictEqual(deposited.event.amount.toString(), STAKE_AMOUNT.toString());
    ok(Number(deposited.event.slot.toString()) > 0);

    const requested = await captureEvent(
      STAKE_UNSTAKE_REQUESTED_EVENT,
      () =>
        stakeProgram.methods
          .requestUnstake(UNSTAKE_AMOUNT)
          .accountsStrict({
            owner,
            stake,
          })
          .simulate(),
      async () => {
        await stakeProgram.methods
          .requestUnstake(UNSTAKE_AMOUNT)
          .accountsStrict({
            owner,
            stake,
          })
          .rpc();
      }
    );

    strictEqual(requested.event.identity.toBase58(), identity.toBase58());
    strictEqual(requested.event.authority.toBase58(), owner.toBase58());
    strictEqual(requested.event.amount.toString(), UNSTAKE_AMOUNT.toString());
    strictEqual(
      requested.event.pendingUnstakeAmount.toString(),
      UNSTAKE_AMOUNT.toString()
    );
    ok(Number(requested.event.slot.toString()) > 0);

    await waitForSlot(Number(requested.event.unlocksAtSlot.toString()));

    const finalized = await captureEvent(
      STAKE_UNSTAKE_FINALIZED_EVENT,
      () =>
        stakeProgram.methods
          .finalizeUnstake()
          .accountsStrict({
            owner,
            stake,
          })
          .simulate(),
      async () => {
        await stakeProgram.methods
          .finalizeUnstake()
          .accountsStrict({
            owner,
            stake,
          })
          .rpc();
      }
    );

    strictEqual(finalized.event.identity.toBase58(), identity.toBase58());
    strictEqual(finalized.event.authority.toBase58(), owner.toBase58());
    strictEqual(finalized.event.amount.toString(), UNSTAKE_AMOUNT.toString());
    ok(Number(finalized.event.slot.toString()) > 0);

    const slashed = await captureEvent(
      STAKE_SLASHED_EVENT,
      async () => {
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
            systemProgram: anchor.web3.SystemProgram.programId,
            cpiAuthority,
          taskRegistryProgram: taskProgram.programId,
          })
          .rpc();

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
          .simulate();
      },
      async () => {
        await stakeProgram.methods
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

    strictEqual(slashed.event.identity.toBase58(), identity.toBase58());
    strictEqual(slashed.event.authority.toBase58(), owner.toBase58());
    strictEqual(slashed.event.amount.toString(), SLASH_AMOUNT.toString());
    strictEqual(slashed.event.disputeReceipt.toBase58(), receipt.toBase58());
    ok(Number(slashed.event.slot.toString()) > 0);
  });
});

async function captureEvent(
  eventName: string,
  simulateAction: () => Promise<{
    events?: Array<{ name: string; data: any }>;
  }>,
  rpcAction: () => Promise<void>
): Promise<{ event: any }> {
  const simulation = await simulateAction();
  const parsedEvents = simulation.events ?? [];
  for (const event of parsedEvents) {
    if (event.name.toLowerCase() === eventName.toLowerCase()) {
      await rpcAction();
      return { event: event.data };
    }
  }

  throw new Error(
    `Missing ${eventName} event in simulation; parsed ${parsedEvents
      .map((event) => event.name)
      .join(", ")}`
  );
}

async function waitForSlot(targetSlot: number) {
  const connection = anchor.AnchorProvider.env().connection;

  while ((await connection.getSlot()) < targetSlot) {
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

function asBuffer(value: number[]): Buffer {
  return Buffer.from(value);
}
