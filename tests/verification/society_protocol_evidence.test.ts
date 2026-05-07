import test from "node:test";
import { ok, strictEqual } from "node:assert/strict";

import { buildProgramWiringPlan } from "../../examples/multi_agent/society_commit_artifacts.ts";
import { buildProtocolEvidenceGraph } from "../../examples/multi_agent/society_protocol_evidence.ts";

const makeRun = () => ({
  runId: "evidence-run",
  compressedTxs: [
    {
      batchId: "batch_1",
      eventRoot: "root_1",
      receipts: [
        {
          receiptId: "receipt_1",
          kind: "completion",
          actorId: "agent_1",
          payloadHash: "payload_1",
        },
      ],
    },
  ],
  tokenizedAgents: [{ agentId: "agent_1", startingTokens: 100 }],
});

const chain = {
  rpcUrl: "http://127.0.0.1:8898",
  studioUrl: "http://127.0.0.1:18488",
  identity: {
    id: "identity_1",
    address: "identity_address",
    bond: "identity_bond_address",
    attester: "attester_address",
  },
  task: { id: "task_1", address: "task_address" },
  world: { address: "world_address", status: 0 },
  reputation: { address: "reputation_address", domain: "society" },
  checkpoint: {
    address: "checkpoint_address",
    latestCheckpoint: "latest_checkpoint_address",
    epoch: "0",
  },
  adjudicator: {
    address: "adjudicator_address",
    adjudicator: "adjudicator_authority",
    treasuryVault: "treasury_vault",
  },
  dispute: {
    receipt: "dispute_receipt_address",
    verdict: "verdict_address",
    verdictSignature: "verdict_signature",
  },
  agentAccounts: [
    {
      agentId: "agent_1",
      identity: { address: "agent_identity_address", signature: "identity_tx" },
      delegation: {
        address: "delegation_address",
        delegate: "agent_authority",
        signature: "delegation_tx",
      },
      stake: {
        address: "stake_address",
        signature: "stake_tx",
        slot: 42,
      },
    },
  ],
  committedReceipts: [
    {
      batchId: "event_1",
      receiptId: "receipt_1",
      address: "receipt_address",
      signature: "receipt_tx",
      slot: 77,
      checkpoint: {
        address: "checkpoint_address",
        signature: "checkpoint_tx",
      },
      reputation: {
        address: "reputation_address",
        signature: "reputation_tx",
      },
      actionProof: {
        actionEnvelope: {
          agentId: "agent_1",
          identityAddress: "identity_address",
          taskAddress: "task_address",
          receiptAddress: "receipt_address",
          txSignature: "receipt_tx",
          slot: 77,
          transcriptRoot: "a".repeat(64),
          leafHash: "b".repeat(64),
        },
      },
    },
  ],
  operations: [
    { kind: "create_identity", address: "identity_address", signature: "tx_1" },
    {
      kind: "deposit_identity_bond",
      address: "identity_bond_address",
      signature: "tx_2",
    },
    {
      kind: "initialize_attester_registry",
      address: "attester_config",
      signature: "tx_3",
    },
    {
      kind: "register_attester",
      address: "attester_address",
      signature: "tx_4",
    },
    {
      kind: "create_delegation",
      address: "delegation_address",
      signature: "tx_5",
      agentId: "agent_1",
    },
    { kind: "create_task", address: "task_address", signature: "tx_6" },
    {
      kind: "create_society_world",
      address: "world_address",
      signature: "tx_7",
    },
    {
      kind: "emit_delegated_receipt",
      address: "receipt_address",
      signature: "tx_8",
    },
    {
      kind: "initialize_history_updater",
      address: "history_updater",
      signature: "tx_9",
    },
    {
      kind: "initialize_history_checkpoint",
      address: "checkpoint_address",
      signature: "tx_10",
    },
    {
      kind: "append_receipt_to_checkpoint",
      address: "checkpoint_address",
      signature: "tx_11",
    },
    {
      kind: "initialize_domain_catalog",
      address: "domain_catalog",
      signature: "tx_12",
    },
    { kind: "register_domain", address: "domain_catalog", signature: "tx_13" },
    {
      kind: "create_reputation_domain",
      address: "reputation_address",
      signature: "tx_14",
    },
    {
      kind: "apply_reputation_receipt",
      address: "reputation_address",
      signature: "tx_15",
    },
    {
      kind: "fund_agent_identity",
      address: "agent_authority",
      signature: "tx_16",
      agentId: "agent_1",
    },
    {
      kind: "initialize_stake",
      address: "stake_address",
      signature: "tx_17",
      agentId: "agent_1",
    },
    { kind: "stake", address: "stake_address", signature: "tx_18" },
    {
      kind: "slash_with_verdict",
      address: "stake_address",
      signature: "tx_19",
      agentId: "agent_1",
    },
    {
      kind: "register_adjudicator",
      address: "adjudicator_address",
      signature: "tx_20",
    },
    { kind: "record_verdict", address: "verdict_address", signature: "tx_21" },
  ],
};

test("protocol evidence graph indexes deployable programs used by the Society adapter", () => {
  const programPlan = buildProgramWiringPlan(makeRun());
  const graph = buildProtocolEvidenceGraph({
    programPlan,
    chain,
    generatedAt: "2026-05-07T00:00:00.000Z",
  });

  strictEqual(graph.summary.totalPrograms, 9);
  strictEqual(graph.summary.missingPrograms, 0);
  strictEqual(graph.summary.presentPrograms, 9);
  strictEqual(graph.summary.receipts, 1);
  strictEqual(graph.summary.actionEnvelopes, 1);
  ok(graph.summary.transactions > graph.summary.totalPrograms);
  ok(graph.graphHash.match(/^[a-f0-9]{64}$/));

  for (const program of [
    "identity_registry",
    "attester_registry",
    "delegation_engine",
    "task_registry",
    "receipt_emitter",
    "proof_verifier",
    "reputation_accumulator",
    "agent_stake",
    "dispute_resolver",
  ]) {
    const evidence = graph.programs.find((entry) => entry.name === program);
    ok(evidence, `missing ${program}`);
    strictEqual(evidence.status, "present", `${program} should be present`);
    ok(evidence.records.length > 0, `${program} should expose records`);
  }
  const agentStake = graph.programs.find(
    (entry) => entry.name === "agent_stake",
  );
  ok(
    agentStake?.records.some((record) => record.label === "slash_with_verdict"),
    "agent stake evidence should include verdict-backed slashing",
  );
});

test("protocol evidence graph fails visibly when a program has no evidence", () => {
  const programPlan = buildProgramWiringPlan(makeRun());
  const graph = buildProtocolEvidenceGraph({
    programPlan,
    chain: {
      ...chain,
      operations: chain.operations.filter(
        (operation) =>
          operation.kind !== "register_adjudicator" &&
          operation.kind !== "record_verdict",
      ),
      adjudicator: undefined,
      dispute: undefined,
    },
    generatedAt: "2026-05-07T00:00:00.000Z",
  });
  const dispute = graph.programs.find(
    (entry) => entry.name === "dispute_resolver",
  );

  strictEqual(dispute?.status, "missing");
  ok(dispute?.missing[0].includes("dispute_resolver"));
  strictEqual(graph.summary.missingPrograms, 1);
});
