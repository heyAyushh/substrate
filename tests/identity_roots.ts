import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { strictEqual } from "assert";
import { IdentityRegistry } from "../target/types/identity_registry";
import { ProofVerifier } from "../target/types/proof_verifier";

const IDENTITY_SEED = "identity";
const CHECKPOINT_SEED = "checkpoint";
const LATEST_CHECKPOINT_SEED = "latest_checkpoint";

describe("identity root updates", () => {
  anchor.setProvider(anchor.AnchorProvider.env());

  const provider = anchor.AnchorProvider.env();
  const authority = provider.wallet.publicKey;
  const identityProgram = anchor.workspace
    .identityRegistry as Program<IdentityRegistry>;
  const proofProgram = anchor.workspace
    .proofVerifier as Program<ProofVerifier>;

  let historyUpdater: anchor.web3.PublicKey;
  before(async () => {
    const [pda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("history_updater", "utf8")],
      proofProgram.programId
    );
    historyUpdater = pda;
    try {
      await proofProgram.account.historyUpdater.fetch(historyUpdater);
    } catch {
      await proofProgram.methods
        .initializeHistoryUpdater()
        .accountsStrict({
          payer: provider.wallet.publicKey,
          historyUpdater,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();
    }
  });

  it("updates policy root for the identity authority and preserves history root", async () => {
    const agentId = bytes32(201);
    const initialPolicyRoot = bytes32(202);
    const initialHistoryRoot = bytes32(203);
    const updatedPolicyRoot = bytes32(204);

    const [identity] = pda(identityProgram, [
      seed(IDENTITY_SEED),
      authority.toBuffer(),
      asBuffer(agentId),
    ]);

    await identityProgram.methods
      .createIdentity(agentId, initialPolicyRoot, initialHistoryRoot)
      .accountsStrict({
        identity,
        authority,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    await (
      identityProgram.methods as unknown as {
        updatePolicyRoot: (newRoot: number[]) => {
          accountsStrict(accounts: {
            identity: anchor.web3.PublicKey;
            authority: anchor.web3.PublicKey;
          }): { rpc(): Promise<string> };
        };
      }
    )
      .updatePolicyRoot(updatedPolicyRoot)
      .accountsStrict({
        identity,
        authority,
      })
      .rpc();

    const identityAccount = await identityProgram.account.agentIdentity.fetch(
      identity
    );

    strictEqual(
      Buffer.from(identityAccount.policyRoot).equals(
        Buffer.from(updatedPolicyRoot)
      ),
      true
    );
    strictEqual(
      Buffer.from(identityAccount.historyRoot).equals(
        Buffer.from(initialHistoryRoot)
      ),
      true
    );
  });

  it("rejects policy root updates from a non-authority signer", async () => {
    const foreignAuthority = anchor.web3.Keypair.generate();
    await fund(foreignAuthority.publicKey);

    const agentId = bytes32(211);
    const initialPolicyRoot = bytes32(212);
    const initialHistoryRoot = bytes32(213);
    const updatedPolicyRoot = bytes32(214);

    const [identity] = pda(identityProgram, [
      seed(IDENTITY_SEED),
      authority.toBuffer(),
      asBuffer(agentId),
    ]);

    await identityProgram.methods
      .createIdentity(agentId, initialPolicyRoot, initialHistoryRoot)
      .accountsStrict({
        identity,
        authority,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    await expectAnchorError(
      (
        identityProgram.methods as unknown as {
          updatePolicyRoot: (newRoot: number[]) => {
            accountsStrict(accounts: {
              identity: anchor.web3.PublicKey;
              authority: anchor.web3.PublicKey;
            }): {
              signers(signers: anchor.web3.Signer[]): {
                rpc(): Promise<string>;
              };
            };
          };
        }
      )
        .updatePolicyRoot(updatedPolicyRoot)
        .accountsStrict({
          identity,
          authority: foreignAuthority.publicKey,
        })
        .signers([foreignAuthority])
        .rpc(),
      "IdentityAuthorityMismatch"
    );
  });

  it("syncs history_root via checkpoint_history and rotate_checkpoint", async () => {
    const agentId = bytes32(301);
    const policyRoot = bytes32(302);
    const historyRoot = bytes32(303);
    const checkpointRoot = bytes32(304);
    const rotatedRoot = bytes32(305);

    const [identity] = pda(identityProgram, [
      seed(IDENTITY_SEED),
      authority.toBuffer(),
      asBuffer(agentId),
    ]);

    await identityProgram.methods
      .createIdentity(agentId, policyRoot, historyRoot)
      .accountsStrict({
        identity,
        authority,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    const [checkpoint] = pda(proofProgram, [
      seed(CHECKPOINT_SEED),
      identity.toBuffer(),
      u64(1),
    ]);
    const [latestCheckpoint] = pda(proofProgram, [
      seed(LATEST_CHECKPOINT_SEED),
      identity.toBuffer(),
    ]);

    await proofProgram.methods
      .checkpointHistory(new anchor.BN(1), checkpointRoot, new anchor.BN(5))
      .accountsStrict({
        authority,
        identity,
        checkpoint,
        latestCheckpoint,
        historyUpdater,
        identityRegistryProgram: identityProgram.programId,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    let identityAccount = await identityProgram.account.agentIdentity.fetch(
      identity
    );
    strictEqual(
      Buffer.from(identityAccount.historyRoot).equals(Buffer.from(checkpointRoot)),
      true
    );

    const [nextCheckpoint] = pda(proofProgram, [
      seed(CHECKPOINT_SEED),
      identity.toBuffer(),
      u64(2),
    ]);

    await proofProgram.methods
      .rotateCheckpoint(new anchor.BN(2), rotatedRoot, new anchor.BN(6))
      .accountsStrict({
        authority,
        identity,
        previousCheckpoint: checkpoint,
        checkpoint: nextCheckpoint,
        latestCheckpoint,
        historyUpdater,
        identityRegistryProgram: identityProgram.programId,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    identityAccount = await identityProgram.account.agentIdentity.fetch(identity);
    strictEqual(
      Buffer.from(identityAccount.historyRoot).equals(Buffer.from(rotatedRoot)),
      true
    );
  });

  it("rejects direct update_history_root from non-history-updater signer", async () => {
    const agentId = bytes32(311);
    const policyRoot = bytes32(312);
    const historyRoot = bytes32(313);
    const newRoot = bytes32(314);

    const [identity] = pda(identityProgram, [
      seed(IDENTITY_SEED),
      authority.toBuffer(),
      asBuffer(agentId),
    ]);

    await identityProgram.methods
      .createIdentity(agentId, policyRoot, historyRoot)
      .accountsStrict({
        identity,
        authority,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    await expectAnchorError(
      (
        identityProgram.methods as unknown as {
          updateHistoryRoot: (newRoot: number[]) => {
            accountsStrict(accounts: {
              identity: anchor.web3.PublicKey;
              historyUpdater: anchor.web3.PublicKey;
            }): { rpc(): Promise<string> };
          };
        }
      )
        .updateHistoryRoot(newRoot)
        .accountsStrict({
          identity,
          historyUpdater: authority,
        })
        .rpc(),
      "InvalidHistoryUpdater"
    );
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

function u64(value: number): Buffer {
  return new anchor.BN(value).toArrayLike(Buffer, "le", 8);
}

async function expectAnchorError(
  promise: Promise<unknown>,
  expectedCode: string
) {
  try {
    await promise;
  } catch (error: any) {
    const actualCode =
      error?.error?.errorCode?.code ??
      error?.errorCode?.code ??
      error?.code;
    if (actualCode === expectedCode) return;
    const msg = error?.message ?? "";
    if (msg.includes(expectedCode)) return;
    strictEqual(actualCode, expectedCode);
    return;
  }

  throw new Error(`Expected Anchor error ${expectedCode}`);
}
