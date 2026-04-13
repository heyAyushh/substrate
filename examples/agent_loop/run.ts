import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  OnchainMerkleTree,
  ReceiptLedger,
  TrustSubstrateClient,
  hashLeafBytes,
  verifyOnchainInclusion,
} from "../../packages/sdk/dist/packages/sdk/src/index.js";
import type {
  ReceiptKind,
  ReceiptRecord,
} from "../../packages/sdk/dist/packages/sdk/src/index.js";
import {
  LocalDurableIndexer,
  type LocalReceiptRecord,
} from "../../packages/indexer/dist/packages/indexer/src/index.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const SNAPSHOT_DIR = join(HERE, ".snapshot");
const SNAPSHOT_PATH = join(SNAPSHOT_DIR, "indexer.json");
const DOMAIN = "research";

const client = new TrustSubstrateClient();

const planner = client.identity.create({
  authority: "wallet-planner",
  label: "planner-agent",
});

const builder = client.identity.create({
  authority: "wallet-builder",
  label: "builder-agent",
});

const task = client.task.create({
  identityId: planner.identityId,
  title: "Compile weekly research digest",
  subtasks: ["collect sources", "synthesize findings"],
});

const ledger = new ReceiptLedger();
let sequence = 0;
const appendReceipt = (
  actorId: string,
  kind: ReceiptKind,
  payload: Record<string, unknown>
): ReceiptRecord => {
  sequence += 1;
  const receipt = client.receipt.create({
    actorId,
    kind,
    taskId: task.taskId,
    sequence,
    payload: { domain: DOMAIN, ...payload },
  });
  return ledger.append(receipt);
};

const assignment = appendReceipt(planner.identityId, "assignment", {
  note: "kickoff planning",
  stakeEvents: [
    client.stake.createEvent({
      kind: "initialized",
      identityId: planner.identityId,
      ownerId: planner.authority,
      slashAuthorityId: "arbiter-agent",
    }),
    client.stake.createEvent({
      kind: "deposited",
      identityId: planner.identityId,
      amountLamports: 750_000n,
    }),
  ],
});
const handoff = appendReceipt(planner.identityId, "handoff", {
  toAgentId: builder.identityId,
  note: "routing to builder",
  stakeEvents: [
    client.stake.createEvent({
      kind: "initialized",
      identityId: builder.identityId,
      ownerId: builder.authority,
      slashAuthorityId: "arbiter-agent",
    }),
    client.stake.createEvent({
      kind: "deposited",
      identityId: builder.identityId,
      amountLamports: 1_000_000n,
    }),
  ],
});
const completion = appendReceipt(builder.identityId, "completion", {
  outcome: "digest published",
});
const dispute = appendReceipt(planner.identityId, "dispute", {
  targetReceiptId: completion.receiptId,
  reason: "source attribution missing from digest",
  evidenceHash: "sha256:evidence-attribution-gap",
});
const resolution = appendReceipt(planner.identityId, "dispute_resolved", {
  targetReceiptId: dispute.receiptId,
  resolution: {
    outcome: "agent_lost",
    slashedAgentId: builder.identityId,
    slashAmountLamports: "125000",
    note: "builder accepted work without required citations",
  },
});

const receipts = ledger.list();

const indexer = new LocalDurableIndexer();
indexer.ingest(
  receipts.map<LocalReceiptRecord>((receipt, offset) => ({
    receiptId: receipt.receiptId,
    slot: 100 + offset,
    taskId: receipt.taskId,
    actorId: receipt.actorId,
    kind: receipt.kind,
    domain: receipt.domain,
    payload: { ...receipt.payload },
  }))
);

mkdirSync(SNAPSHOT_DIR, { recursive: true });
indexer.saveSnapshot(SNAPSHOT_PATH);

const merkle = new OnchainMerkleTree(
  receipts.map((receipt) => Buffer.from(receipt.hash, "hex"))
);
const completionIndex = receipts.findIndex(
  (receipt) => receipt.receiptId === completion.receiptId
);
const completionProof = merkle.getProof(completionIndex);
const completionLeafHash = hashLeafBytes(Buffer.from(completion.hash, "hex"));
const included = verifyOnchainInclusion(
  completionLeafHash,
  completionProof,
  receipts.length,
  merkle.root
);

const reputation = client.reputation.derive(receipts);
const handoffChain = indexer.getHandoffChain(task.taskId);
const stakeEvents = receipts.flatMap((receipt) =>
  client.stake.extractEvents(receipt)
);
const sdkStake = {
  planner: client.stake.deriveState(planner.identityId, stakeEvents),
  builder: client.stake.deriveState(builder.identityId, stakeEvents),
};
const jsonStake = {
  planner: {
    ...sdkStake.planner,
    activeLamports: sdkStake.planner.activeLamports.toString(),
    pendingUnstakeLamports: sdkStake.planner.pendingUnstakeLamports.toString(),
    slashedLamports: sdkStake.planner.slashedLamports.toString(),
  },
  builder: {
    ...sdkStake.builder,
    activeLamports: sdkStake.builder.activeLamports.toString(),
    pendingUnstakeLamports: sdkStake.builder.pendingUnstakeLamports.toString(),
    slashedLamports: sdkStake.builder.slashedLamports.toString(),
  },
};

const restored = LocalDurableIndexer.loadSnapshot(SNAPSHOT_PATH);
const restoredGraph = restored.getExecutionGraph();

console.log(
  JSON.stringify(
    {
      planner: planner.identityId,
      builder: builder.identityId,
      task: task.taskId,
      receipts: receipts.map((receipt) => ({
        receiptId: receipt.receiptId,
        kind: receipt.kind,
        actor: receipt.actorId,
      })),
      assignmentReceiptId: assignment.receiptId,
      handoffReceiptId: handoff.receiptId,
      completionReceiptId: completion.receiptId,
      disputeReceiptId: dispute.receiptId,
      resolutionReceiptId: resolution.receiptId,
      handoffChain,
      stake: {
        sdk: jsonStake,
        indexer: {
          planner: indexer.getStakeState(planner.identityId),
          builder: indexer.getStakeState(builder.identityId),
        },
      },
      merkleRoot: merkle.root.toString("hex"),
      completionIncluded: included,
      reputation,
      restoredReceiptCount: restoredGraph.receipts.length,
      snapshotPath: SNAPSHOT_PATH,
    },
    null,
    2
  )
);
