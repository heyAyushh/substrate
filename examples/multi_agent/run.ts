import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createChallengeReceipt,
  createDisputeReceipt,
  createReceiptFromExecution,
  createStakeEvent,
  createUnansweredChallengeDispute,
  createVerifiedReceiptFromExecution,
  DataAvailabilityError,
  deriveReputation,
  deriveStakeState,
  extractStakeEventsFromReceipt,
  hashExecutionRecord,
  ReceiptLedger,
  TrustSubstrateClient,
  type DelegationRecord,
  type ExecutionRecord,
  type ExecutionStep,
  type ExecutionStepKind,
  type ReceiptRecord,
} from "@trust-substrate/sdk";
import { hashCanonical } from "@trust-substrate/sdk/canonical";
import {
  LocalDurableIndexer,
  type LocalReceiptRecord,
} from "@trust-substrate/indexer";

const HERE = dirname(fileURLToPath(import.meta.url));
const SNAPSHOT_DIR = join(HERE, ".snapshot");
const SNAPSHOT_PATH = join(SNAPSHOT_DIR, "indexer.json");
const DOMAIN = "coding";
const DEADLINE_SLOT = 210;
const CURRENT_SLOT = 300;

type CodingTool = "read" | "write" | "edit" | "bash";

interface ToolInvocation {
  readonly tool: CodingTool;
  readonly args: Record<string, unknown>;
  readonly startedAt: string;
  readonly model?: string;
}

const TOOL_TO_STEP_KIND: Record<CodingTool, ExecutionStepKind> = {
  read: "tool_call",
  write: "file_edit",
  edit: "file_edit",
  bash: "command",
};

const toStep = (seq: number, invocation: ToolInvocation): ExecutionStep => ({
  seq,
  kind: TOOL_TO_STEP_KIND[invocation.tool],
  startedAt: invocation.startedAt,
  tool: invocation.tool,
  model: invocation.model,
  payload: { ...invocation.args, tool: invocation.tool },
});

const buildRecord = (
  recordId: string,
  identityId: string,
  taskId: string,
  invocations: readonly ToolInvocation[]
): ExecutionRecord => ({
  recordId,
  identityId,
  taskId,
  steps: invocations.map((invocation, index) => toStep(index + 1, invocation)),
});

const client = new TrustSubstrateClient();

const planner = client.identity.create({
  authority: "wallet-planner",
  label: "planner",
});
const alpha = client.identity.create({
  authority: "wallet-alpha",
  label: "builder-alpha",
});
const beta = client.identity.create({
  authority: "wallet-beta",
  label: "builder-beta",
});
const reviewer = client.identity.create({
  authority: "wallet-reviewer",
  label: "reviewer",
});

const task = client.task.create({
  identityId: planner.identityId,
  title: "Refactor logging module",
  domain: DOMAIN,
  subtasks: ["draft change", "land change", "review change"],
});

const ledger = new ReceiptLedger();
let sequence = 0;
const nextSequence = () => {
  sequence += 1;
  return sequence;
};

const appendLedger = (receipt: ReceiptRecord) => ledger.append(receipt);

interface DelegationSummary {
  readonly delegatorId: string;
  readonly delegateId: string;
  readonly allowedActions: ReadonlyArray<string>;
  readonly taskId: string;
  readonly domain: string;
  readonly expiresAtSlot?: number;
}

interface DelegationAssertionSummary {
  readonly actorId: string;
  readonly action: string;
  readonly taskId: string;
  readonly domain: string;
  readonly currentSlot: number;
}

const delegationChain: DelegationSummary[] = [];
const delegationAssertions: DelegationAssertionSummary[] = [];

const assertDelegatedReceipt = ({
  actorId,
  action,
  delegation,
  receipt,
  currentSlot,
}: {
  readonly actorId: string;
  readonly action: "handoff" | "completion";
  readonly delegation: DelegationRecord;
  readonly receipt: ReceiptRecord;
  readonly currentSlot: number;
}): ReceiptRecord => {
  client.delegation.assertAllowed({
    delegation,
    action,
    taskId: receipt.taskId,
    domain: receipt.domain,
    currentSlot,
  });
  delegationAssertions.push({
    actorId,
    action,
    taskId: receipt.taskId,
    domain: receipt.domain,
    currentSlot,
  });
  return appendLedger(receipt);
};

const stakeInitAndDeposit = (
  identityId: string,
  owner: string,
  amount: bigint
) => [
  createStakeEvent({
    kind: "initialized",
    identityId,
    ownerId: owner,
    slashAuthorityId: "arbiter",
  }),
  createStakeEvent({
    kind: "deposited",
    identityId,
    amountLamports: amount,
  }),
];

const assignmentRecord = buildRecord(
  "rec-plan",
  planner.identityId,
  task.taskId,
  [
    {
      tool: "read",
      startedAt: "2026-04-13T10:00:00Z",
      args: { path: "src/logging.ts" },
    },
    {
      tool: "bash",
      startedAt: "2026-04-13T10:00:01Z",
      args: { cmd: "git log -n 5 src/logging.ts" },
    },
  ]
);

const assignment = appendLedger(
  createReceiptFromExecution({
    record: assignmentRecord,
    kind: "assignment",
    domain: DOMAIN,
    actorId: planner.identityId,
    sequence: nextSequence(),
  })
);

const plannerStakeSeed: ReceiptRecord = {
  ...assignment,
  payload: {
    ...assignment.payload,
    stakeEvents: stakeInitAndDeposit(
      planner.identityId,
      planner.authority,
      500_000n
    ),
  },
};

const handoffToAlphaRecord = buildRecord(
  "rec-handoff-alpha",
  planner.identityId,
  task.taskId,
  [
    {
      tool: "bash",
      startedAt: "2026-04-13T10:01:00Z",
      args: { cmd: "git checkout -b alpha/logging-refactor" },
    },
  ]
);

const handoffToAlpha = appendLedger(
  createReceiptFromExecution({
    record: handoffToAlphaRecord,
    kind: "handoff",
    domain: DOMAIN,
    actorId: planner.identityId,
    sequence: nextSequence(),
  })
);

const plannerToAlphaDelegation = client.delegation.create({
  delegatorId: planner.identityId,
  delegateId: alpha.identityId,
  allowedActions: ["handoff", "completion"],
  taskIds: [task.taskId],
  domains: [DOMAIN],
  expiresAtSlot: 260,
});
delegationChain.push({
  delegatorId: plannerToAlphaDelegation.delegatorId,
  delegateId: plannerToAlphaDelegation.delegateId,
  allowedActions: plannerToAlphaDelegation.scope.allowedActions,
  taskId: task.taskId,
  domain: DOMAIN,
  expiresAtSlot: plannerToAlphaDelegation.expiresAtSlot,
});

const alphaStakeSeedPayload = {
  ...handoffToAlpha.payload,
  toAgentId: alpha.identityId,
  stakeEvents: stakeInitAndDeposit(
    alpha.identityId,
    alpha.authority,
    1_000_000n
  ),
};
const alphaStakeSeed: ReceiptRecord = {
  ...handoffToAlpha,
  payload: alphaStakeSeedPayload,
};

const alphaWorkRecord = buildRecord(
  "rec-alpha-work",
  alpha.identityId,
  task.taskId,
  [
    {
      tool: "edit",
      startedAt: "2026-04-13T10:05:00Z",
      args: { path: "src/logging.ts", after: "--hidden--" },
    },
    {
      tool: "bash",
      startedAt: "2026-04-13T10:05:30Z",
      args: { cmd: "pnpm test --filter logging" },
    },
  ]
);

let alphaSubmitError: string | undefined;
try {
  await createVerifiedReceiptFromExecution({
    record: alphaWorkRecord,
    kind: "completion",
    domain: DOMAIN,
    actorId: alpha.identityId,
    sequence: 0,
    storage: {
      uri: "memory://alpha-blob",
      verify: true,
      hash: hashCanonical(alphaWorkRecord),
      fetcher: async () => {
        throw new Error("blob not pinned");
      },
    },
  });
} catch (error) {
  if (error instanceof DataAvailabilityError) {
    alphaSubmitError = `${error.reason}: ${error.message}`;
  } else {
    throw error;
  }
}

const alphaCompletion = assertDelegatedReceipt({
  actorId: alpha.identityId,
  action: "completion",
  delegation: plannerToAlphaDelegation,
  currentSlot: 150,
  receipt: createReceiptFromExecution({
    record: alphaWorkRecord,
    kind: "completion",
    domain: DOMAIN,
    actorId: alpha.identityId,
    sequence: nextSequence(),
    storage: { uri: "memory://alpha-blob" },
  }),
});

const challenge = appendLedger(
  createChallengeReceipt({
    actorId: reviewer.identityId,
    taskId: task.taskId,
    sequence: nextSequence(),
    domain: DOMAIN,
    targetReceiptId: alphaCompletion.receiptId,
    deadlineSlot: DEADLINE_SLOT,
  })
);

const alphaDispute = appendLedger(
  createUnansweredChallengeDispute({
    actorId: reviewer.identityId,
    taskId: task.taskId,
    sequence: nextSequence(),
    domain: DOMAIN,
    challengeReceiptId: challenge.receiptId,
    targetReceiptId: alphaCompletion.receiptId,
  })
);

const slashResolution = appendLedger(
  createDisputeReceipt({
    actorId: reviewer.identityId,
    sequence: nextSequence(),
    domain: DOMAIN,
    targetReceiptId: alphaDispute.receiptId,
    record: alphaWorkRecord,
    stepSeq: 1,
    evidenceHash: "sha256:alpha-missing-blob",
    resolution: { outcome: "agent_lost", slashAmount: 400_000n },
  })
);

const slashResolutionWithEvents: ReceiptRecord = {
  ...slashResolution,
  payload: {
    ...slashResolution.payload,
    resolution: {
      outcome: "agent_lost",
      slashedAgentId: alpha.identityId,
      slashAmountLamports: "400000",
    },
  },
};

const alphaToBetaDelegation = client.delegation.create({
  delegatorId: alpha.identityId,
  delegateId: beta.identityId,
  allowedActions: ["handoff", "completion"],
  taskIds: [task.taskId],
  domains: [DOMAIN],
  expiresAtSlot: 300,
});
delegationChain.push({
  delegatorId: alphaToBetaDelegation.delegatorId,
  delegateId: alphaToBetaDelegation.delegateId,
  allowedActions: alphaToBetaDelegation.scope.allowedActions,
  taskId: task.taskId,
  domain: DOMAIN,
  expiresAtSlot: alphaToBetaDelegation.expiresAtSlot,
});

const handoffToBetaRecord = buildRecord(
  "rec-handoff-beta",
  alpha.identityId,
  task.taskId,
  [
    {
      tool: "bash",
      startedAt: "2026-04-13T11:00:00Z",
      args: { cmd: "git checkout -b beta/logging-refactor" },
    },
  ]
);

const handoffToBeta = assertDelegatedReceipt({
  actorId: alpha.identityId,
  action: "handoff",
  delegation: plannerToAlphaDelegation,
  currentSlot: 240,
  receipt: createReceiptFromExecution({
    record: handoffToBetaRecord,
    kind: "handoff",
    domain: DOMAIN,
    actorId: alpha.identityId,
    sequence: nextSequence(),
  }),
});

const betaStakeSeed: ReceiptRecord = {
  ...handoffToBeta,
  payload: {
    ...handoffToBeta.payload,
    toAgentId: beta.identityId,
    stakeEvents: stakeInitAndDeposit(
      beta.identityId,
      beta.authority,
      1_000_000n
    ),
  },
};

const betaWorkRecord = buildRecord(
  "rec-beta-work",
  beta.identityId,
  task.taskId,
  [
    {
      tool: "read",
      startedAt: "2026-04-13T11:05:00Z",
      args: { path: "src/logging.ts" },
    },
    {
      tool: "edit",
      startedAt: "2026-04-13T11:06:00Z",
      args: { path: "src/logging.ts", afterHash: "sha256:beta-after" },
    },
    {
      tool: "bash",
      startedAt: "2026-04-13T11:07:00Z",
      args: { cmd: "pnpm test" },
    },
  ]
);

const betaBlob = hashCanonical(betaWorkRecord);
const betaCompletion = assertDelegatedReceipt({
  actorId: beta.identityId,
  action: "completion",
  delegation: alphaToBetaDelegation,
  currentSlot: 260,
  receipt: await createVerifiedReceiptFromExecution({
    record: betaWorkRecord,
    kind: "completion",
    domain: DOMAIN,
    actorId: beta.identityId,
    sequence: nextSequence(),
    storage: {
      uri: "memory://beta-blob",
      verify: true,
      hash: betaBlob,
      fetcher: async () => ({
        bytes: new TextEncoder().encode(JSON.stringify(betaWorkRecord)),
        text: JSON.stringify(betaWorkRecord),
      }),
    },
  }),
});

const attestation = appendLedger(
  client.receipt.create({
    actorId: reviewer.identityId,
    kind: "completion",
    taskId: task.taskId,
    sequence: nextSequence(),
    payload: {
      domain: DOMAIN,
      target: beta.identityId,
      kind: "review",
      evidenceUri: "git+https://review.example/repo@abc123:NOTES.md",
      evidenceHash: "sha256:beta-review",
    },
  })
);

const attestationReceipt: LocalReceiptRecord = {
  receiptId: attestation.receiptId,
  slot: 270,
  taskId: attestation.taskId,
  actorId: attestation.actorId,
  kind: "attestation",
  domain: attestation.domain,
  payload: { ...attestation.payload },
};

const receipts = ledger.list();

const orderedReceipts: LocalReceiptRecord[] = [
  { ...toIndexed(plannerStakeSeed, 100) },
  { ...toIndexed(alphaStakeSeed, 110) },
  { ...toIndexed(alphaCompletion, 150) },
  { ...toIndexed(challenge, 160) },
  { ...toIndexed(alphaDispute, DEADLINE_SLOT + 5) },
  { ...toIndexed(slashResolutionWithEvents, DEADLINE_SLOT + 10) },
  { ...toIndexed(betaStakeSeed, 240) },
  { ...toIndexed(betaCompletion, 260) },
  attestationReceipt,
];

function toIndexed(receipt: ReceiptRecord, slot: number): LocalReceiptRecord {
  return {
    receiptId: receipt.receiptId,
    slot,
    taskId: receipt.taskId,
    actorId: receipt.actorId,
    kind: receipt.kind,
    domain: receipt.domain,
    payload: { ...receipt.payload },
  };
}

const indexer = new LocalDurableIndexer();
indexer.ingest(orderedReceipts);

mkdirSync(SNAPSHOT_DIR, { recursive: true });
indexer.saveSnapshot(SNAPSHOT_PATH);

const stakeEvents = [
  ...extractStakeEventsFromReceipt(plannerStakeSeed),
  ...extractStakeEventsFromReceipt(alphaStakeSeed),
  ...extractStakeEventsFromReceipt(slashResolutionWithEvents),
  ...extractStakeEventsFromReceipt(betaStakeSeed),
];

const stakeStates = {
  planner: deriveStakeState(planner.identityId, stakeEvents),
  alpha: deriveStakeState(alpha.identityId, stakeEvents),
  beta: deriveStakeState(beta.identityId, stakeEvents),
};

const reputation = deriveReputation(receipts, { currentSlot: CURRENT_SLOT });
const leaderboardAll = indexer.getAgentLeaderboard({
  domain: DOMAIN,
  currentSlot: CURRENT_SLOT,
});
const leaderboardAttested = indexer.getAgentLeaderboard({
  domain: DOMAIN,
  currentSlot: CURRENT_SLOT,
  attestedOnly: true,
});
const executionGraph = indexer.getExecutionGraph();

const alphaRootHex = hashExecutionRecord(alphaWorkRecord).root.toString("hex");
const betaRootHex = hashExecutionRecord(betaWorkRecord).root.toString("hex");

const stakeJson = (identityId: keyof typeof stakeStates) => {
  const state = stakeStates[identityId];
  return {
    identityId: state.identityId,
    activeLamports: state.activeLamports.toString(),
    pendingUnstakeLamports: state.pendingUnstakeLamports.toString(),
    slashedLamports: state.slashedLamports.toString(),
    slashReceiptIds: state.slashReceiptIds,
  };
};

console.log(
  JSON.stringify(
    {
      identities: {
        planner: planner.identityId,
        alpha: alpha.identityId,
        beta: beta.identityId,
        reviewer: reviewer.identityId,
      },
      task: task.taskId,
      alphaSubmitRejected: alphaSubmitError,
      delegationChain,
      delegationAssertions,
      executionRecordRoots: {
        alpha: alphaRootHex,
        beta: betaRootHex,
      },
      receiptTimeline: orderedReceipts.map((receipt) => ({
        slot: receipt.slot,
        actor: receipt.actorId,
        kind: receipt.kind,
        receiptId: receipt.receiptId,
      })),
      handoffChain: indexer.getHandoffChain(task.taskId),
      leaderboard: {
        all: leaderboardAll,
        attestedOnly: leaderboardAttested,
      },
      stake: {
        planner: stakeJson("planner"),
        alpha: stakeJson("alpha"),
        beta: stakeJson("beta"),
      },
      reputation,
      executionGraphReceiptCount: executionGraph.receipts.length,
      snapshotPath: SNAPSHOT_PATH,
    },
    null,
    2
  )
);
