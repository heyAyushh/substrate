import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { strictEqual } from "assert";
import { IdentityRegistry } from "../target/types/identity_registry";

const IDENTITY_SEED = "identity";

describe("identity root updates", () => {
  anchor.setProvider(anchor.AnchorProvider.env());

  const provider = anchor.AnchorProvider.env();
  const authority = provider.wallet.publicKey;
  const identityProgram = anchor.workspace
    .identityRegistry as Program<IdentityRegistry>;

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

async function expectAnchorError(
  promise: Promise<unknown>,
  expectedCode: string
) {
  try {
    await promise;
  } catch (error) {
    const actualCode = (error as { error?: { errorCode?: { code?: string } } })
      .error?.errorCode?.code;
    strictEqual(actualCode, expectedCode);
    return;
  }

  throw new Error(`Expected Anchor error ${expectedCode}`);
}
