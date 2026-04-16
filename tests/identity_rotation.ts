import * as anchor from "@anchor-lang/core";
import { Program } from "@anchor-lang/core";
import { strictEqual } from "assert";
import { IdentityRegistry } from "../target/types/identity_registry";

const IDENTITY_SEED = "identity";
const PENDING_ROTATION_SEED = "pending_rotation";
const ROTATION_COOLDOWN_SLOTS = 5;
const ROTATION_SLOT_BUFFER = 2;
const SLOT_ADVANCE_MAX_ATTEMPTS = 60;
const SLOT_ADVANCE_POLL_MS = 250;

describe("identity authority rotation", () => {
  anchor.setProvider(anchor.AnchorProvider.env());

  const provider = anchor.AnchorProvider.env();
  const authority = provider.wallet.publicKey;
  const identityProgram = anchor.workspace
    .identityRegistry as Program<IdentityRegistry>;

  it("rejects authority rotation requests before the cooldown window", async () => {
    const agentId = bytes32(221);
    const [identity] = pda(identityProgram, [
      seed(IDENTITY_SEED),
      authority.toBuffer(),
      asBuffer(agentId),
    ]);
    const [pendingRotation] = pda(identityProgram, [
      seed(PENDING_ROTATION_SEED),
      identity.toBuffer(),
    ]);
    const newAuthority = anchor.web3.Keypair.generate();

    await identityProgram.methods
      .createIdentity(agentId, bytes32(222), bytes32(223))
      .accountsStrict({
        identity,
        authority,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    const currentSlot = await provider.connection.getSlot("confirmed");
    await expectAnchorError(
      identityProgram.methods
        .rotateAuthority(
          newAuthority.publicKey,
          new anchor.BN(currentSlot + ROTATION_COOLDOWN_SLOTS - 1)
        )
        .accountsStrict({
          authority,
          identity,
          pendingRotation,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc(),
      "AuthorityRotationUnlockTooSoon"
    );
  });

  it("finalizes rotation after cooldown and swaps identity authority", async () => {
    const newAuthority = anchor.web3.Keypair.generate();
    await fund(newAuthority.publicKey);

    const finalizeCaller = anchor.web3.Keypair.generate();
    await fund(finalizeCaller.publicKey);

    const agentId = bytes32(231);
    const initialPolicyRoot = bytes32(232);
    const initialHistoryRoot = bytes32(233);
    const [identity] = pda(identityProgram, [
      seed(IDENTITY_SEED),
      authority.toBuffer(),
      asBuffer(agentId),
    ]);
    const [pendingRotation] = pda(identityProgram, [
      seed(PENDING_ROTATION_SEED),
      identity.toBuffer(),
    ]);

    await identityProgram.methods
      .createIdentity(agentId, initialPolicyRoot, initialHistoryRoot)
      .accountsStrict({
        identity,
        authority,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    const requestSlot = await provider.connection.getSlot("confirmed");
    const unlockSlot =
      requestSlot + ROTATION_COOLDOWN_SLOTS + ROTATION_SLOT_BUFFER;
    await identityProgram.methods
      .rotateAuthority(newAuthority.publicKey, new anchor.BN(unlockSlot))
      .accountsStrict({
        authority,
        identity,
        pendingRotation,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    const pendingAccount =
      await identityProgram.account.pendingAuthorityRotation.fetch(
        pendingRotation
      );
    strictEqual(
      pendingAccount.newAuthority.toBase58(),
      newAuthority.publicKey.toBase58()
    );
    strictEqual(pendingAccount.unlockSlot.toNumber(), unlockSlot);

    await advanceToSlot(unlockSlot);

    await identityProgram.methods
      .finalizeAuthorityRotation()
      .accountsStrict({
        caller: finalizeCaller.publicKey,
        identity,
        pendingRotation,
      })
      .signers([finalizeCaller])
      .rpc();

    const identityAccount = await identityProgram.account.agentIdentity.fetch(
      identity
    );
    strictEqual(
      identityAccount.authority.toBase58(),
      newAuthority.publicKey.toBase58()
    );

    try {
      await identityProgram.account.pendingAuthorityRotation.fetch(
        pendingRotation
      );
      throw new Error("pending rotation should be closed");
    } catch (error: any) {
      const message = String(error?.message ?? error);
      if (!message.includes("Account does not exist")) {
        throw error;
      }
    }

    await expectAnchorError(
      identityProgram.methods
        .updatePolicyRoot(bytes32(234))
        .accountsStrict({
          identity,
          authority,
        })
        .rpc(),
      "IdentityAuthorityMismatch"
    );

    await identityProgram.methods
      .updatePolicyRoot(bytes32(235))
      .accountsStrict({
        identity,
        authority: newAuthority.publicKey,
      })
      .signers([newAuthority])
      .rpc();
  });

  async function fund(publicKey: anchor.web3.PublicKey) {
    await provider.sendAndConfirm(
      new anchor.web3.Transaction().add(
        anchor.web3.SystemProgram.transfer({
          fromPubkey: authority,
          toPubkey: publicKey,
          lamports: 1_000_000_000,
        })
      )
    );
  }

  async function advanceToSlot(targetSlot: number) {
    for (let attempt = 0; attempt < SLOT_ADVANCE_MAX_ATTEMPTS; attempt += 1) {
      const currentSlot = await provider.connection.getSlot("confirmed");
      if (currentSlot >= targetSlot) return;
      await sleep(SLOT_ADVANCE_POLL_MS);
    }

    throw new Error(`failed to advance to slot ${targetSlot}`);
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
    const msg = error?.message ?? "";
    if (msg.includes(expectedCode)) return;
    strictEqual(actualCode, expectedCode);
    return;
  }

  throw new Error(`expected Anchor error ${expectedCode}`);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
