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
const TOKEN_STAKE_SEED = "token_stake";
const TOKEN_STAKE_VAULT_SEED = "token_stake_vault";
const TOKEN_TREASURY_VAULT_SEED = "token_treasury_vault";
const SLASH_MARKER_SEED = "slash_marker";
const ADJUDICATOR_CONFIG_SEED = "adjudicator_config";
const TREASURY_VAULT_SEED = "treasury";
const TOKEN_PROGRAM_ID = new anchor.web3.PublicKey(
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
);
const ZERO_PUBLIC_KEY = new anchor.web3.PublicKey(
  "11111111111111111111111111111111",
);
const TOKEN_MINT_SPACE = 82;
const TOKEN_ACCOUNT_SPACE = 165;
const TOKEN_DECIMALS = 0;
const TOKEN_INSTRUCTION_INITIALIZE_MINT = 0;
const TOKEN_INSTRUCTION_INITIALIZE_ACCOUNT = 1;
const TOKEN_INSTRUCTION_MINT_TO = 7;
const TOKEN_OPTION_NONE = 0;
const COMPLETION_RECEIPT_KIND = 3;
const DISPUTE_RESOLVED_RECEIPT_KIND = 5;
const SUBTASK_COUNT = 0;
const STAKE_AMOUNT = new anchor.BN(1_000_000);
const UNSTAKE_AMOUNT = new anchor.BN(250_000);
const SLASH_AMOUNT = new anchor.BN(100_000);
const TRUST_MODE_AUTHORITY = 1;
const STAKE_INITIALIZED_EVENT = "StakeInitialized";
const STAKE_DEPOSITED_EVENT = "StakeDeposited";
const STAKE_UNSTAKE_REQUESTED_EVENT = "StakeUnstakeRequested";
const STAKE_UNSTAKE_FINALIZED_EVENT = "StakeUnstakeFinalized";
const STAKE_SLASHED_EVENT = "StakeSlashedByAuthority";

describe("agent_stake", () => {
  anchor.setProvider(anchor.AnchorProvider.env());
  let cpiAuthority: anchor.web3.PublicKey;
  let domainCatalog: anchor.web3.PublicKey;
  let treasuryVault: anchor.web3.PublicKey;
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

    const [catalogPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("domain_catalog", "utf8")],
      reputationProgram.programId,
    );
    domainCatalog = catalogPda;
    try {
      await reputationProgram.account.reputationDomainCatalog.fetch(
        domainCatalog,
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

    await ensureDomainRegistered(bytes32(74));
  });

  const provider = anchor.AnchorProvider.env();
  const owner = provider.wallet.publicKey;
  const reputationProgram = anchor.workspace
    .reputationAccumulator as Program<ReputationAccumulator>;
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

    await ensureDomainRegistered(domain);

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
        identity,
        stake,
        identityRegistryProgram: identityProgram.programId,
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
        .accountsStrict({
          owner,
          identity,
          stake,
          identityRegistryProgram: identityProgram.programId,
        })
        .rpc(),
      "StakeCooldownNotElapsed",
    );

    stakeAccount = await stakeProgram.account.stakeAccount.fetch(stake);
    await waitForSlot(Number(stakeAccount.unstakeUnlocksAt));

    await stakeProgram.methods
      .finalizeUnstake()
      .accountsStrict({
        owner,
        identity,
        stake,
        identityRegistryProgram: identityProgram.programId,
      })
      .rpc();

    stakeAccount = await stakeProgram.account.stakeAccount.fetch(stake);
    strictEqual(
      stakeAccount.amount.toString(),
      STAKE_AMOUNT.sub(UNSTAKE_AMOUNT).toString(),
    );

    await receiptProgram.methods
      .emitReceipt(
        receiptId,
        DISPUTE_RESOLVED_RECEIPT_KIND,
        new anchor.BN(1),
        domain,
        bytes32(0),
        payloadHash,
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
        identity,
        stake,
        disputeReceipt: receipt,
        slashMarker,
        treasuryVault,
        identityRegistryProgram: identityProgram.programId,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    stakeAccount = await stakeProgram.account.stakeAccount.fetch(stake);
    strictEqual(
      stakeAccount.amount.toString(),
      STAKE_AMOUNT.sub(UNSTAKE_AMOUNT).sub(SLASH_AMOUNT).toString(),
    );
    strictEqual(stakeAccount.slashedTotal.toString(), SLASH_AMOUNT.toString());

    const markerAccount =
      await stakeProgram.account.slashMarker.fetch(slashMarker);
    strictEqual(markerAccount.disputeReceipt.toBase58(), receipt.toBase58());

    await expectAnchorError(
      stakeProgram.methods
        .slashWithAuthority(SLASH_AMOUNT)
        .accountsStrict({
          slashAuthority: owner,
          identity,
          stake,
          disputeReceipt: receipt,
          slashMarker,
          treasuryVault,
          identityRegistryProgram: identityProgram.programId,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc(),
      "AccountAlreadyInitialized",
    );
  });

  it("stakes SPL tokens, separates unstake from slash, and pays the token treasury", async () => {
    const agentId = bytes32(181);
    const taskId = bytes32(182);
    const receiptId = bytes32(183);
    const domain = bytes32(74);
    const payloadHash = bytes32(184);
    const mint = await createMint(owner);
    const ownerTokenAccount = await createTokenAccount(mint, owner);

    await mintTo(mint, ownerTokenAccount, STAKE_AMOUNT);

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
    const [tokenStake] = pda(stakeProgram, [
      seed(TOKEN_STAKE_SEED),
      identity.toBuffer(),
      task.toBuffer(),
      mint.toBuffer(),
    ]);
    const [vault] = pda(stakeProgram, [
      seed(TOKEN_STAKE_VAULT_SEED),
      tokenStake.toBuffer(),
    ]);
    const [treasuryTokenVault] = pda(stakeProgram, [
      seed(TOKEN_TREASURY_VAULT_SEED),
      mint.toBuffer(),
    ]);
    const [slashMarker] = pda(stakeProgram, [
      seed(SLASH_MARKER_SEED),
      tokenStake.toBuffer(),
      receipt.toBuffer(),
    ]);

    await identityProgram.methods
      .createIdentity(agentId, bytes32(185), bytes32(186))
      .accountsStrict({
        identity,
        authority: owner,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    await taskProgram.methods
      .createTask(taskId, bytes32(187), SUBTASK_COUNT, domain)
      .accountsStrict({
        authority: owner,
        identity,
        task,
        identityRegistryProgram: identityProgram.programId,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    await stakeProgram.methods
      .initializeTokenStake(task, owner, TRUST_MODE_AUTHORITY)
      .accountsStrict({
        owner,
        identity,
        mint,
        tokenStake,
        vault,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    await stakeProgram.methods
      .stakeToken(STAKE_AMOUNT)
      .accountsStrict({
        owner,
        identity,
        tokenStake,
        mint,
        ownerTokenAccount,
        vault,
        tokenProgram: TOKEN_PROGRAM_ID,
        identityRegistryProgram: identityProgram.programId,
      })
      .rpc();

    let tokenStakeAccount =
      await stakeProgram.account.tokenStakeAccount.fetch(tokenStake);
    strictEqual(tokenStakeAccount.amount.toString(), STAKE_AMOUNT.toString());
    strictEqual(await tokenBalance(vault), BigInt(STAKE_AMOUNT.toString()));
    strictEqual(await tokenBalance(ownerTokenAccount), 0n);

    await stakeProgram.methods
      .requestUnstakeToken(UNSTAKE_AMOUNT)
      .accountsStrict({ owner, tokenStake })
      .rpc();

    await expectAnchorError(
      stakeProgram.methods
        .finalizeUnstakeToken()
        .accountsStrict({
          owner,
          tokenStake,
          identity,
          mint,
          ownerTokenAccount,
          vault,
          tokenProgram: TOKEN_PROGRAM_ID,
          identityRegistryProgram: identityProgram.programId,
        })
        .rpc(),
      "StakeCooldownNotElapsed",
    );

    tokenStakeAccount =
      await stakeProgram.account.tokenStakeAccount.fetch(tokenStake);
    await waitForSlot(Number(tokenStakeAccount.unstakeUnlocksAt));

    await stakeProgram.methods
      .finalizeUnstakeToken()
      .accountsStrict({
        owner,
        tokenStake,
        identity,
        mint,
        ownerTokenAccount,
        vault,
        tokenProgram: TOKEN_PROGRAM_ID,
        identityRegistryProgram: identityProgram.programId,
      })
      .rpc();

    tokenStakeAccount =
      await stakeProgram.account.tokenStakeAccount.fetch(tokenStake);
    strictEqual(
      tokenStakeAccount.amount.toString(),
      STAKE_AMOUNT.sub(UNSTAKE_AMOUNT).toString(),
    );
    strictEqual(
      await tokenBalance(ownerTokenAccount),
      BigInt(UNSTAKE_AMOUNT.toString()),
    );

    await receiptProgram.methods
      .emitReceipt(
        receiptId,
        DISPUTE_RESOLVED_RECEIPT_KIND,
        new anchor.BN(1),
        domain,
        bytes32(0),
        payloadHash,
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
      .initializeTokenTreasuryVault()
      .accountsStrict({
        payer: owner,
        treasuryVault,
        mint,
        treasuryTokenVault,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    await stakeProgram.methods
      .slashTokenWithAuthority(SLASH_AMOUNT)
      .accountsStrict({
        slashAuthority: owner,
        identity,
        tokenStake,
        disputeReceipt: receipt,
        slashMarker,
        mint,
        vault,
        treasuryTokenVault,
        tokenProgram: TOKEN_PROGRAM_ID,
        identityRegistryProgram: identityProgram.programId,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    tokenStakeAccount =
      await stakeProgram.account.tokenStakeAccount.fetch(tokenStake);
    strictEqual(
      tokenStakeAccount.amount.toString(),
      STAKE_AMOUNT.sub(UNSTAKE_AMOUNT).sub(SLASH_AMOUNT).toString(),
    );
    strictEqual(
      tokenStakeAccount.slashedTotal.toString(),
      SLASH_AMOUNT.toString(),
    );
    strictEqual(
      await tokenBalance(vault),
      BigInt(STAKE_AMOUNT.sub(UNSTAKE_AMOUNT).sub(SLASH_AMOUNT).toString()),
    );
    strictEqual(
      await tokenBalance(ownerTokenAccount),
      BigInt(UNSTAKE_AMOUNT.toString()),
    );
    strictEqual(
      await tokenBalance(treasuryTokenVault),
      BigInt(SLASH_AMOUNT.toString()),
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
          identity,
          stake,
          identityRegistryProgram: identityProgram.programId,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc(),
      "StakeAmountMustBePositive",
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
        identity: agent.identity,
        stake,
        identityRegistryProgram: identityProgram.programId,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    await ensureTreasuryVault(disputeProgram, owner);

    await expectAnchorError(
      stakeProgram.methods
        .slashWithAuthority(SLASH_AMOUNT)
        .accountsStrict({
          slashAuthority: wrongSlashAuthority.publicKey,
          identity: agent.identity,
          stake,
          disputeReceipt: agent.receipt,
          slashMarker: completionSlashMarker,
          treasuryVault,
          identityRegistryProgram: identityProgram.programId,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([wrongSlashAuthority])
        .rpc(),
      "StakeSlashAuthorityMismatch",
    );

    await expectAnchorError(
      stakeProgram.methods
        .slashWithAuthority(SLASH_AMOUNT)
        .accountsStrict({
          slashAuthority: owner,
          identity: agent.identity,
          stake,
          disputeReceipt: agent.receipt,
          slashMarker: completionSlashMarker,
          treasuryVault,
          identityRegistryProgram: identityProgram.programId,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc(),
      "StakeReceiptKindMismatch",
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
          identity: agent.identity,
          stake,
          disputeReceipt: foreignAgent.receipt,
          slashMarker: foreignSlashMarker,
          treasuryVault,
          identityRegistryProgram: identityProgram.programId,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc(),
      "StakeReceiptIdentityMismatch",
    );
  });

  it("emits structured events for the authority-driven stake lifecycle", async () => {
    const agentId = bytes32(171);
    const taskId = bytes32(172);
    const receiptId = bytes32(173);
    const domain = bytes32(74);
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

    await identityProgram.methods
      .createIdentity(agentId, bytes32(176), bytes32(177))
      .accountsStrict({
        identity,
        authority: owner,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    await taskProgram.methods
      .createTask(taskId, bytes32(178), SUBTASK_COUNT, domain)
      .accountsStrict({
        authority: owner,
        identity,
        task,
        identityRegistryProgram: identityProgram.programId,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    const initialized = await captureEvent(
      stakeProgram,
      STAKE_INITIALIZED_EVENT,
      async () =>
        stakeProgram.methods
          .initializeStake(owner, TRUST_MODE_AUTHORITY)
          .accountsStrict({
            owner,
            identity,
            stake,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .rpc(),
    );
    strictEqual(initialized.identity.toBase58(), identity.toBase58());
    strictEqual(initialized.authority.toBase58(), owner.toBase58());
    strictEqual(initialized.slashAuthority.toBase58(), owner.toBase58());
    strictEqual(Number(initialized.trustMode), TRUST_MODE_AUTHORITY);
    ok(Number(initialized.slot.toString()) > 0);

    const deposited = await captureEvent(
      stakeProgram,
      STAKE_DEPOSITED_EVENT,
      async () =>
        stakeProgram.methods
          .stake(STAKE_AMOUNT)
          .accountsStrict({
            owner,
            identity,
            stake,
            identityRegistryProgram: identityProgram.programId,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .rpc(),
    );
    strictEqual(deposited.identity.toBase58(), identity.toBase58());
    strictEqual(deposited.authority.toBase58(), owner.toBase58());
    strictEqual(deposited.amount.toString(), STAKE_AMOUNT.toString());
    ok(Number(deposited.slot.toString()) > 0);

    const requested = await captureEvent(
      stakeProgram,
      STAKE_UNSTAKE_REQUESTED_EVENT,
      async () =>
        stakeProgram.methods
          .requestUnstake(UNSTAKE_AMOUNT)
          .accountsStrict({ owner, stake })
          .rpc(),
    );
    strictEqual(requested.identity.toBase58(), identity.toBase58());
    strictEqual(requested.authority.toBase58(), owner.toBase58());
    strictEqual(requested.amount.toString(), UNSTAKE_AMOUNT.toString());
    strictEqual(
      requested.pendingUnstakeAmount.toString(),
      UNSTAKE_AMOUNT.toString(),
    );
    ok(Number(requested.slot.toString()) > 0);

    await waitForSlot(Number(requested.unlocksAtSlot.toString()));

    const finalized = await captureEvent(
      stakeProgram,
      STAKE_UNSTAKE_FINALIZED_EVENT,
      async () =>
        stakeProgram.methods
          .finalizeUnstake()
          .accountsStrict({
            owner,
            identity,
            stake,
            identityRegistryProgram: identityProgram.programId,
          })
          .rpc(),
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
        payloadHash,
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

    const slashed = await captureEvent(
      stakeProgram,
      STAKE_SLASHED_EVENT,
      async () =>
        stakeProgram.methods
          .slashWithAuthority(SLASH_AMOUNT)
          .accountsStrict({
            slashAuthority: owner,
            identity,
            stake,
            disputeReceipt: receipt,
            slashMarker,
            treasuryVault,
            identityRegistryProgram: identityProgram.programId,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .rpc(),
    );
    strictEqual(slashed.identity.toBase58(), identity.toBase58());
    strictEqual(slashed.slashAuthority.toBase58(), owner.toBase58());
    strictEqual(slashed.disputeReceipt.toBase58(), receipt.toBase58());
    strictEqual(slashed.amount.toString(), SLASH_AMOUNT.toString());
    strictEqual(Number(slashed.trustMode), TRUST_MODE_AUTHORITY);
    ok(Number(slashed.slot.toString()) > 0);
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
        }),
      ),
    );
  }

  async function createMint(
    mintAuthority: anchor.web3.PublicKey,
  ): Promise<anchor.web3.PublicKey> {
    const mint = anchor.web3.Keypair.generate();
    const lamports =
      await provider.connection.getMinimumBalanceForRentExemption(
        TOKEN_MINT_SPACE,
      );

    await provider.sendAndConfirm(
      new anchor.web3.Transaction().add(
        anchor.web3.SystemProgram.createAccount({
          fromPubkey: owner,
          newAccountPubkey: mint.publicKey,
          lamports,
          space: TOKEN_MINT_SPACE,
          programId: TOKEN_PROGRAM_ID,
        }),
        new anchor.web3.TransactionInstruction({
          programId: TOKEN_PROGRAM_ID,
          keys: [
            { pubkey: mint.publicKey, isSigner: false, isWritable: true },
            {
              pubkey: anchor.web3.SYSVAR_RENT_PUBKEY,
              isSigner: false,
              isWritable: false,
            },
          ],
          data: Buffer.concat([
            Buffer.from([TOKEN_INSTRUCTION_INITIALIZE_MINT, TOKEN_DECIMALS]),
            mintAuthority.toBuffer(),
            Buffer.from([TOKEN_OPTION_NONE]),
            ZERO_PUBLIC_KEY.toBuffer(),
          ]),
        }),
      ),
      [mint],
    );

    return mint.publicKey;
  }

  async function createTokenAccount(
    mint: anchor.web3.PublicKey,
    tokenOwner: anchor.web3.PublicKey,
  ): Promise<anchor.web3.PublicKey> {
    const tokenAccount = anchor.web3.Keypair.generate();
    const lamports =
      await provider.connection.getMinimumBalanceForRentExemption(
        TOKEN_ACCOUNT_SPACE,
      );

    await provider.sendAndConfirm(
      new anchor.web3.Transaction().add(
        anchor.web3.SystemProgram.createAccount({
          fromPubkey: owner,
          newAccountPubkey: tokenAccount.publicKey,
          lamports,
          space: TOKEN_ACCOUNT_SPACE,
          programId: TOKEN_PROGRAM_ID,
        }),
        new anchor.web3.TransactionInstruction({
          programId: TOKEN_PROGRAM_ID,
          keys: [
            {
              pubkey: tokenAccount.publicKey,
              isSigner: false,
              isWritable: true,
            },
            { pubkey: mint, isSigner: false, isWritable: false },
            { pubkey: tokenOwner, isSigner: false, isWritable: false },
            {
              pubkey: anchor.web3.SYSVAR_RENT_PUBKEY,
              isSigner: false,
              isWritable: false,
            },
          ],
          data: Buffer.from([TOKEN_INSTRUCTION_INITIALIZE_ACCOUNT]),
        }),
      ),
      [tokenAccount],
    );

    return tokenAccount.publicKey;
  }

  async function mintTo(
    mint: anchor.web3.PublicKey,
    destination: anchor.web3.PublicKey,
    amount: anchor.BN,
  ) {
    await provider.sendAndConfirm(
      new anchor.web3.Transaction().add(
        new anchor.web3.TransactionInstruction({
          programId: TOKEN_PROGRAM_ID,
          keys: [
            { pubkey: mint, isSigner: false, isWritable: true },
            { pubkey: destination, isSigner: false, isWritable: true },
            { pubkey: owner, isSigner: true, isWritable: false },
          ],
          data: Buffer.concat([
            Buffer.from([TOKEN_INSTRUCTION_MINT_TO]),
            encodeU64(amount),
          ]),
        }),
      ),
    );
  }

  async function tokenBalance(account: anchor.web3.PublicKey): Promise<bigint> {
    const balance = await provider.connection.getTokenAccountBalance(account);
    return BigInt(balance.value.amount);
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
    const domain = bytes32(0);
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
        bytes32(input.agentId + 20),
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
        domain,
        bytes32(0),
        bytes32(input.receiptId + 30),
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
    adjudicator: anchor.web3.PublicKey,
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

  async function ensureDomainRegistered(domain: number[]) {
    const catalog =
      await reputationProgram.account.reputationDomainCatalog.fetch(
        domainCatalog,
      );
    const isRegistered = catalog.domains.some((entry: number[]) =>
      Buffer.from(entry).equals(Buffer.from(domain)),
    );
    if (isRegistered) {
      return;
    }

    await reputationProgram.methods
      .registerDomain(domain)
      .accountsStrict({
        curator: owner,
        domainCatalog,
      })
      .rpc();
  }

  async function captureEvent(
    program: Program<any>,
    eventName: string,
    action: () => Promise<string>,
  ): Promise<any> {
    const parser = new anchor.EventParser(program.programId, program.coder);
    const signature = await action();
    const maxAttempts = 30;
    const pollDelayMs = 500;

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const transaction = await provider.connection.getTransaction(signature, {
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

function encodeU64(value: anchor.BN): Buffer {
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64LE(BigInt(value.toString()));
  return buffer;
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
