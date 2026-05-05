import * as anchor from "@anchor-lang/core";
import { Program } from "@anchor-lang/core";
import { strictEqual } from "assert";
import { IdentityRegistry } from "../target/types/identity_registry";

const IDENTITY_SEED = "identity";
const GUARDIAN_SET_SEED = "guardian_set";
const PENDING_ROTATION_SEED = "pending_rotation";
const ROTATION_COOLDOWN_SLOTS = 5;
const ROTATION_SLOT_BUFFER = 10;
const SLOT_ADVANCE_MAX_ATTEMPTS = 60;
const SLOT_ADVANCE_POLL_MS = 250;
const SLOT_ADVANCE_AIRDROP_LAMPORTS = 1;

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
          new anchor.BN(currentSlot + ROTATION_COOLDOWN_SLOTS - 1),
        )
        .accountsStrict({
          authority,
          identity,
          pendingRotation,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc(),
      "AuthorityRotationUnlockTooSoon",
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
        pendingRotation,
      );
    strictEqual(
      pendingAccount.newAuthority.toBase58(),
      newAuthority.publicKey.toBase58(),
    );
    strictEqual(pendingAccount.unlockSlot.toNumber(), unlockSlot);

    await advanceToSlot(unlockSlot);

    try {
      await identityProgram.methods
        .finalizeAuthorityRotation()
        .accountsStrict({
          caller: finalizeCaller.publicKey,
          identity,
          pendingRotation,
        })
        .signers([finalizeCaller])
        .rpc();
    } catch (error: any) {
      const message = String(error?.message ?? error);
      if (!message.includes("TransactionExpiredTimeoutError")) {
        throw error;
      }
    }

    const identityAccount =
      await identityProgram.account.agentIdentity.fetch(identity);
    strictEqual(
      identityAccount.authority.toBase58(),
      newAuthority.publicKey.toBase58(),
    );

    try {
      await identityProgram.account.pendingAuthorityRotation.fetch(
        pendingRotation,
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
      "IdentityAuthorityMismatch",
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

  it("requires guardian threshold and authorized signers for emergency rotation", async () => {
    const agentId = bytes32(241);
    const [identity] = pda(identityProgram, [
      seed(IDENTITY_SEED),
      authority.toBuffer(),
      asBuffer(agentId),
    ]);
    const [guardianSet] = pda(identityProgram, [
      seed(GUARDIAN_SET_SEED),
      identity.toBuffer(),
    ]);
    const newAuthority = anchor.web3.Keypair.generate();
    const refundRecipient = anchor.web3.Keypair.generate();
    const guardianA = anchor.web3.Keypair.generate();
    const guardianB = anchor.web3.Keypair.generate();
    const guardianC = anchor.web3.Keypair.generate();
    const unauthorizedGuardian = anchor.web3.Keypair.generate();

    await Promise.all([
      fund(newAuthority.publicKey),
      fund(refundRecipient.publicKey),
      fund(guardianA.publicKey),
      fund(guardianB.publicKey),
      fund(guardianC.publicKey),
      fund(unauthorizedGuardian.publicKey),
    ]);

    await identityProgram.methods
      .createIdentity(agentId, bytes32(242), bytes32(243))
      .accountsStrict({
        identity,
        authority,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    await identityProgram.methods
      .initializeGuardianSet(
        [guardianA.publicKey, guardianB.publicKey, guardianC.publicKey],
        2,
      )
      .accountsStrict({
        authority,
        identity,
        guardianSet,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    await expectAnchorError(
      identityProgram.methods
        .emergencyRotateAuthority(newAuthority.publicKey)
        .accountsPartial({
          identity,
          guardianSet,
          refundRecipient: refundRecipient.publicKey,
          pendingRotation: null,
        })
        .remainingAccounts([signerMeta(guardianA.publicKey)])
        .signers([guardianA])
        .rpc(),
      "GuardianSignatureThresholdNotMet",
    );

    await expectAnchorError(
      identityProgram.methods
        .emergencyRotateAuthority(newAuthority.publicKey)
        .accountsPartial({
          identity,
          guardianSet,
          refundRecipient: refundRecipient.publicKey,
          pendingRotation: null,
        })
        .remainingAccounts([
          signerMeta(guardianA.publicKey),
          signerMeta(unauthorizedGuardian.publicKey),
        ])
        .signers([guardianA, unauthorizedGuardian])
        .rpc(),
      "GuardianSignerNotAuthorized",
    );
  });

  it("emergency rotation swaps authority immediately and closes pending rotation", async () => {
    const agentId = bytes32(251);
    const [identity] = pda(identityProgram, [
      seed(IDENTITY_SEED),
      authority.toBuffer(),
      asBuffer(agentId),
    ]);
    const [guardianSet] = pda(identityProgram, [
      seed(GUARDIAN_SET_SEED),
      identity.toBuffer(),
    ]);
    const [pendingRotation] = pda(identityProgram, [
      seed(PENDING_ROTATION_SEED),
      identity.toBuffer(),
    ]);
    const stagedAuthority = anchor.web3.Keypair.generate();
    const newAuthority = anchor.web3.Keypair.generate();
    const refundRecipient = anchor.web3.Keypair.generate();
    const guardianA = anchor.web3.Keypair.generate();
    const guardianB = anchor.web3.Keypair.generate();
    const guardianC = anchor.web3.Keypair.generate();

    await Promise.all([
      fund(stagedAuthority.publicKey),
      fund(newAuthority.publicKey),
      fund(refundRecipient.publicKey),
      fund(guardianA.publicKey),
      fund(guardianB.publicKey),
      fund(guardianC.publicKey),
    ]);

    await identityProgram.methods
      .createIdentity(agentId, bytes32(252), bytes32(253))
      .accountsStrict({
        identity,
        authority,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    await identityProgram.methods
      .initializeGuardianSet(
        [guardianA.publicKey, guardianB.publicKey, guardianC.publicKey],
        2,
      )
      .accountsStrict({
        authority,
        identity,
        guardianSet,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    const requestSlot = await provider.connection.getSlot("confirmed");
    const unlockSlot =
      requestSlot + ROTATION_COOLDOWN_SLOTS + ROTATION_SLOT_BUFFER;
    await identityProgram.methods
      .rotateAuthority(stagedAuthority.publicKey, new anchor.BN(unlockSlot))
      .accountsStrict({
        authority,
        identity,
        pendingRotation,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    try {
      await identityProgram.methods
        .emergencyRotateAuthority(newAuthority.publicKey)
        .accountsPartial({
          identity,
          guardianSet,
          refundRecipient: refundRecipient.publicKey,
          pendingRotation,
        })
        .remainingAccounts([
          signerMeta(guardianA.publicKey),
          signerMeta(guardianB.publicKey),
        ])
        .signers([guardianA, guardianB])
        .rpc();
    } catch (error: any) {
      const message = String(error?.message ?? error);
      if (!message.includes("TransactionExpiredTimeoutError")) {
        throw error;
      }
    }

    const identityAccount =
      await identityProgram.account.agentIdentity.fetch(identity);
    strictEqual(
      identityAccount.authority.toBase58(),
      newAuthority.publicKey.toBase58(),
    );

    try {
      await identityProgram.account.pendingAuthorityRotation.fetch(
        pendingRotation,
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
        .updatePolicyRoot(bytes32(254))
        .accountsStrict({
          identity,
          authority,
        })
        .rpc(),
      "IdentityAuthorityMismatch",
    );

    await identityProgram.methods
      .updatePolicyRoot(bytes32(255))
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
        }),
      ),
    );
  }

  async function advanceToSlot(targetSlot: number) {
    for (let attempt = 0; attempt < SLOT_ADVANCE_MAX_ATTEMPTS; attempt += 1) {
      const currentSlot = await provider.connection.getSlot("confirmed");
      if (currentSlot >= targetSlot) return;

      await provider.connection.requestAirdrop(
        authority,
        SLOT_ADVANCE_AIRDROP_LAMPORTS,
      );
      await sleep(SLOT_ADVANCE_POLL_MS);
    }

    throw new Error(`failed to advance to slot ${targetSlot}`);
  }
});

function pda<T>(
  program: Program<T>,
  seeds: Array<Buffer>,
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
  expectedCode: string,
) {
  try {
    await promise;
  } catch (error: any) {
    const actualCode =
      error?.error?.errorCode?.code ?? error?.errorCode?.code ?? error?.code;
    if (actualCode === expectedCode) return;
    const logLines = [
      ...(error?.logs ?? []),
      ...(error?.error?.logs ?? []),
      ...(error?.simulationResponse?.logs ?? []),
      ...(error?.simulationResponse?.value?.logs ?? []),
      ...(error?.transactionLogs ?? []),
    ]
      .filter((line: unknown): line is string => typeof line === "string")
      .join("\n");
    const serializedError = JSON.stringify(
      error,
      Object.getOwnPropertyNames(error ?? {}),
      2,
    );
    const msg = [error?.message ?? "", logLines]
      .filter((entry) => entry.length > 0)
      .join("\n");
    if (msg.includes(expectedCode)) return;
    if (serializedError.includes(expectedCode)) return;
    strictEqual(actualCode, expectedCode);
    return;
  }

  throw new Error(`expected Anchor error ${expectedCode}`);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function signerMeta(pubkey: anchor.web3.PublicKey) {
  return {
    pubkey,
    isSigner: true,
    isWritable: false,
  };
}
