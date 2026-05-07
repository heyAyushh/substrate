import test from "node:test";
import {
  deepStrictEqual,
  equal,
  match,
  notEqual,
  ok,
  strictEqual,
  throws,
} from "node:assert/strict";

import {
  buildAgentActionEnvelopeForSignedSocietyAction,
  buildCommitProofArtifact,
  buildProgramWiringPlan,
  buildSocietyActionTranscript,
  createProofFileName,
  createProofReference,
  selectCommitBatches,
  verifyCommitProofArtifact,
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
      payload: {
        eventId: "event_1",
      },
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
  strictEqual(committed.actionTranscript.actionCount, 1);
  strictEqual(committed.actionTranscript.actions[0].eventId, "event_1");
  match(committed.actionTranscript.root, /^[a-f0-9]{64}$/);
  match(
    committed.actionTranscript.actions[0].signature.value,
    /^[a-f0-9]{64}$/,
  );
  deepStrictEqual(committed.run.graph, run.graph);
  deepStrictEqual(committed.run.leaderboard, run.leaderboard);
  match(committed.proofHash, /^[a-f0-9]{64}$/);
  notEqual(committed.proofHash, prepared.proofHash);
});

test("society action transcript signs every action into a Merkle root", () => {
  const run = makeRun(1);
  const transcript = buildSocietyActionTranscript(run, {
    signAction: (actionHash, action) => ({
      scheme: "test-signature",
      signer: action.agentId,
      value: `sig_${actionHash}`,
    }),
  });

  strictEqual(transcript.actionCount, run.events.length);
  strictEqual(transcript.sourceKinds[0], "simulation");
  match(transcript.root, /^[a-f0-9]{64}$/);
  strictEqual(transcript.actions[0].eventId, "event_1");
  strictEqual(transcript.actions[0].receiptId, "receipt_1");
  strictEqual(transcript.actions[0].signature.signer, "agent_1");
  strictEqual(
    transcript.actions[0].signature.value,
    `sig_${transcript.actions[0].actionHash}`,
  );
  match(transcript.actions[0].leafHash, /^[a-f0-9]{64}$/);
});

test("society action transcript keeps signed before and after state commitments", () => {
  const run = makeRun(1);
  const transcript = buildSocietyActionTranscript(run, {
    signAction: (actionHash, action) => ({
      scheme: "test-action-signature",
      signer: action.agentId,
      value: `action_${actionHash}`,
    }),
    signStateCommitment: (stateHash, action, phase) => ({
      scheme: "test-state-signature",
      signer: action.agentId,
      value: `${phase}_${stateHash}`,
    }),
  });

  const [action] = transcript.actions;

  strictEqual(action.beforeState.phase, "before-action");
  strictEqual(action.afterState.phase, "after-action");
  match(action.beforeState.stateHash, /^[a-f0-9]{64}$/);
  match(action.afterState.stateHash, /^[a-f0-9]{64}$/);
  notEqual(action.beforeState.stateHash, action.afterState.stateHash);
  strictEqual(
    action.beforeState.signature.value,
    `before-action_${action.beforeState.stateHash}`,
  );
  strictEqual(
    action.afterState.signature.value,
    `after-action_${action.afterState.stateHash}`,
  );
});

test("society signed action can be promoted to a chain-bound agent action envelope", () => {
  const run = makeRun(1);
  const transcript = buildSocietyActionTranscript(run, {
    signAction: (actionHash, action) => ({
      scheme: "test-action-signature",
      signer: action.agentId,
      value: `action_${actionHash}`,
    }),
    signStateCommitment: (stateHash, action, phase) => ({
      scheme: "test-state-signature",
      signer: action.agentId,
      value: `${phase}_${stateHash}`,
    }),
  });

  const envelope = buildAgentActionEnvelopeForSignedSocietyAction({
    signedAction: transcript.actions[0],
    identityAddress: "Identity1111111111111111111111111111111111",
    taskAddress: "Task1111111111111111111111111111111111111",
    receiptAddress: "Receipt111111111111111111111111111111111",
    receiptPayloadHash: "p".repeat(64),
    txSignature: "tx-signature",
    slot: 99,
    transcriptRoot: transcript.root,
    args: { source: "society-board" },
  });

  strictEqual(envelope.agentId, "agent_1");
  strictEqual(envelope.action, "genesis");
  strictEqual(envelope.agentSignature, transcript.actions[0].signature.value);
  strictEqual(
    envelope.preStateHash,
    transcript.actions[0].beforeState.stateHash,
  );
  strictEqual(
    envelope.postStateHash,
    transcript.actions[0].afterState.stateHash,
  );
  strictEqual(envelope.txSignature, "tx-signature");
  strictEqual(envelope.transcriptRoot, transcript.root);
});

test("society action transcript binds Pi runtime evidence into the action hash", () => {
  const run = makeRun(1);
  const withoutEvidence = buildSocietyActionTranscript(run);
  const withEvidence = buildSocietyActionTranscript(run, {
    resolveRuntimeEvidence: () => ({
      kind: "pi-action",
      provider: "openai-codex",
      modelId: "gpt-5.4-mini",
      promptHash: "p".repeat(64),
      responseHash: "r".repeat(64),
      decisionHash: "d".repeat(64),
      decision: {
        schemaVersion: 1,
        decision: "accepted",
        eventId: "event_1",
      },
    }),
  });

  notEqual(withEvidence.root, withoutEvidence.root);
  notEqual(
    withEvidence.actions[0].actionHash,
    withoutEvidence.actions[0].actionHash,
  );
  strictEqual(
    withEvidence.actions[0].runtimeEvidence?.responseHash,
    "r".repeat(64),
  );
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

test("commit proof artifact verifies transcript replay bindings", () => {
  const run = makeRun(1);
  const transcript = buildSocietyActionTranscript(run, {
    signAction: (actionHash, action) => ({
      scheme: "test-action-signature",
      signer: action.agentId,
      value: `action_${actionHash}`,
    }),
    signStateCommitment: (stateHash, action, phase) => ({
      scheme: "test-state-signature",
      signer: action.agentId,
      value: `${phase}_${stateHash}`,
    }),
  });
  const envelope = buildAgentActionEnvelopeForSignedSocietyAction({
    signedAction: transcript.actions[0],
    identityAddress: "Identity1111111111111111111111111111111111",
    taskAddress: "Task1111111111111111111111111111111111111",
    receiptAddress: "Receipt111111111111111111111111111111111",
    receiptPayloadHash: "p".repeat(64),
    txSignature: "tx-signature",
    slot: 99,
    transcriptRoot: transcript.root,
  });
  const artifact = buildCommitProofArtifact({
    run,
    commitId: "commit_verify",
    status: "committed",
    createdAt: "2026-04-18T00:00:00.000Z",
    actionTranscript: transcript,
    chain: {
      committedReceipts: [
        {
          address: envelope.receiptAddress,
          signature: envelope.txSignature,
          actionProof: {
            leafHash: envelope.leafHash,
            signature: envelope.agentSignature,
            actionEnvelope: envelope,
          },
        },
      ],
    },
  });

  const verification = verifyCommitProofArtifact(artifact);

  strictEqual(verification.ok, true);
  strictEqual(verification.actionCount, 1);
  strictEqual(verification.checkedEnvelopes, 1);
  strictEqual(verification.transcriptRoot, transcript.root);
});

test("commit proof verification rejects mismatched transcript roots", () => {
  const artifact = buildCommitProofArtifact({
    run: makeRun(1),
    commitId: "commit_bad_replay",
    status: "committed",
    createdAt: "2026-04-18T00:00:00.000Z",
  });
  const corrupted = {
    ...artifact,
    actionTranscript: {
      ...artifact.actionTranscript,
      root: "0".repeat(64),
    },
    proofHash: "0".repeat(64),
  };
  const rehashed = {
    ...corrupted,
    proofHash: buildCommitProofArtifact({
      run: {
        ...makeRun(1),
        events: corrupted.run.events,
        receipts: corrupted.run.receipts,
      },
      commitId: corrupted.commitId,
      status: corrupted.status,
      createdAt: corrupted.createdAt,
      actionTranscript: corrupted.actionTranscript,
      chain: corrupted.chain ?? undefined,
      preparedProofHash: corrupted.preparedProofHash,
      error: corrupted.error ?? undefined,
    }).proofHash,
  };

  throws(() => verifyCommitProofArtifact(rehashed), /transcript root mismatch/);
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
  ok(
    plan.programs.every((program) => program.demoSurface.length > 0),
    "every program needs a user-visible demo surface",
  );
  ok(
    plan.programs.every((program) => program.evidence.length > 0),
    "every program needs proof evidence",
  );
  ok(
    plan.programs.every((program) => program.boundary.length > 0),
    "every program needs an honest boundary statement",
  );
  deepStrictEqual(
    plan.programs
      .filter((program) => program.demoRole === "board-primary")
      .map((program) => program.name),
    ["task_registry"],
  );
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
