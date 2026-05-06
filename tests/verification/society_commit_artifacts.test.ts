import test from "node:test";
import {
  deepStrictEqual,
  equal,
  match,
  notEqual,
  ok,
  strictEqual,
} from "node:assert/strict";

import {
  buildCommitProofArtifact,
  buildProgramWiringPlan,
  createProofFileName,
  createProofReference,
  selectCommitBatches,
} from "../../examples/multi_agent/society_commit_artifacts.ts";

const makeRun = (batchCount: number) => ({
  runId: "run/proof demo",
  config: {
    agents: 4,
    ticks: 10,
  },
  events: [
    {
      id: "event_1",
      tick: 0,
      agentId: "agent_1",
      agentName: "Noor Ledger",
      action: "genesis",
      tokenDelta: 100,
    },
  ],
  receipts: [
    {
      receiptId: "receipt_1",
      kind: "genesis",
      payloadHash: "hash_1",
    },
  ],
  agents: [
    {
      id: "agent_1",
      identityId: "identity_1",
      name: "Noor Ledger",
      alive: true,
      tokens: 100,
    },
  ],
  grid: {
    size: 4,
    cells: Array.from({ length: 16 }, (_, index) => index % 5 === 0),
  },
  timeline: [
    {
      tick: 0,
      cells: Array.from({ length: 16 }, (_, index) => index % 5 === 0),
      agents: [{ id: "agent_1", name: "Noor Ledger", x: 0, y: 0 }],
      leaderboard: [{ id: "agent_1", name: "Noor Ledger", score: 12 }],
      liveCells: 4,
      liveAgents: 1,
      totalTokens: 100,
      receipts: 1,
      compressedTxs: 1,
      births: [],
      deaths: [],
      survivors: [{ x: 0, y: 0 }],
    },
  ],
  compressedTxs: Array.from({ length: batchCount }, (_, index) => ({
    batchId: `batch_${index + 1}`,
    eventRoot: `root_${index + 1}`,
    receipts: [
      {
        receiptId: `receipt_${index + 1}`,
        kind: "completion",
        actorId: "agent_1",
        payloadHash: `payload_${index + 1}`,
      },
    ],
  })),
  graph: {
    summary: {
      agents: 4,
      receipts: 40,
      batches: batchCount,
      edges: 20,
    },
  },
  leaderboard: [{ id: "agent_1", name: "Noor Ledger", score: 12 }],
  tokenizedAgents: [{ agentId: "agent_1", startingTokens: 100 }],
  metrics: {
    liveAgents: 4,
    receipts: 40,
    compressedTxs: batchCount,
  },
});

test("commit batch selection keeps the whole simulation history", () => {
  const run = makeRun(40);
  const selected = selectCommitBatches(run);

  strictEqual(selected.length, 40);
  strictEqual(selected[0].batchId, "batch_1");
  strictEqual(selected.at(-1)?.batchId, "batch_40");
});

test("commit proof artifact includes offline graph and chain commit evidence", () => {
  const run = makeRun(3);
  const prepared = buildCommitProofArtifact({
    run,
    commitId: "commit_demo",
    status: "prepared",
    createdAt: "2026-04-18T00:00:00.000Z",
  });
  const committed = buildCommitProofArtifact({
    run,
    commitId: "commit_demo",
    status: "committed",
    createdAt: "2026-04-18T00:00:00.000Z",
    preparedProofHash: prepared.proofHash,
    chain: {
      rpcUrl: "http://127.0.0.1:8899",
      identity: { id: "identity_1", address: "identity_address" },
      task: { id: "task_1", address: "task_address" },
      committedReceipts: [
        {
          batchId: "batch_1",
          receiptId: "receipt_1",
          sourceReceiptCount: 1,
          address: "receipt_address",
          signature: "signature",
          slot: 10,
        },
      ],
    },
  });

  strictEqual(prepared.status, "prepared");
  strictEqual(committed.status, "committed");
  strictEqual(committed.preparedProofHash, prepared.proofHash);
  strictEqual(committed.run.compressedTxs.length, 3);
  deepStrictEqual(committed.run.graph, run.graph);
  deepStrictEqual(committed.run.leaderboard, run.leaderboard);
  match(committed.proofHash, /^[a-f0-9]{64}$/);
  notEqual(committed.proofHash, prepared.proofHash);
});

test("commit proof artifact preserves exact replay frames", () => {
  const run = makeRun(1);
  const artifact = buildCommitProofArtifact({
    run,
    commitId: "commit_replay",
    status: "committed",
    createdAt: "2026-04-18T00:00:00.000Z",
  });

  deepStrictEqual(artifact.run.agents, run.agents);
  deepStrictEqual(artifact.run.grid, run.grid);
  deepStrictEqual(artifact.run.timeline, run.timeline);
  strictEqual(artifact.run.timeline[0].tick, 0);
});

test("program wiring plan covers the whole Trust Substrate stack", () => {
  const run = makeRun(3);
  const plan = buildProgramWiringPlan(run);

  deepStrictEqual(
    plan.programs.map((program) => program.name),
    [
      "identity_registry",
      "attester_registry",
      "delegation_engine",
      "task_registry",
      "receipt_emitter",
      "proof_verifier",
      "reputation_accumulator",
      "agent_stake",
      "dispute_resolver",
    ],
  );
  strictEqual(plan.summary.totalPrograms, 9);
  strictEqual(plan.summary.compressedBatches, 3);
  strictEqual(plan.summary.tokenizedAgents, 1);
  ok(plan.programs.every((program) => program.status === "wired"));
});

test("commit proof artifact serializes on-chain bigint evidence", () => {
  const artifact = buildCommitProofArtifact({
    run: makeRun(1),
    commitId: "commit_bigint",
    status: "committed",
    createdAt: "2026-04-18T00:00:00.000Z",
    chain: {
      checkpoint: {
        address: "checkpoint_address",
        epoch: 0n,
      },
      operations: [
        {
          kind: "initialize_history_checkpoint",
          epoch: 0n,
        },
      ],
    },
  });

  strictEqual((artifact.chain?.checkpoint as { epoch: string }).epoch, "0");
  strictEqual(
    (artifact.chain?.operations as Array<{ epoch: string }>)[0].epoch,
    "0",
  );
  JSON.stringify(artifact);
});

test("proof file names and urls are safe to serve locally", () => {
  const fileName = createProofFileName("run/proof demo", "commit:demo");
  const artifact = buildCommitProofArtifact({
    run: makeRun(1),
    commitId: "commit:demo",
    status: "committed",
    createdAt: "2026-04-18T00:00:00.000Z",
  });
  const reference = createProofReference({
    proofDirectory: "/tmp/proofs",
    routePrefix: "/examples/multi_agent/dashboard/proofs",
    fileName,
    artifact,
  });

  equal(fileName, "run-proof-demo-commit-demo.json");
  strictEqual(reference.status, "committed");
  strictEqual(
    reference.url,
    "/examples/multi_agent/dashboard/proofs/run-proof-demo-commit-demo.json",
  );
  ok(reference.file.endsWith("/tmp/proofs/run-proof-demo-commit-demo.json"));
  strictEqual(reference.hash, artifact.proofHash);
});
