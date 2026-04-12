import test from "node:test";
import { deepStrictEqual, ok, strictEqual, throws } from "node:assert/strict";
import {
  ReceiptLedger,
  TrustSubstrateClient,
  createMerkleTree,
  deriveReputation,
  verifyMerkleProof,
} from "../../packages/sdk/src/index.js";

test("creates deterministic identity objects", () => {
  const client = new TrustSubstrateClient();
  const identity = client.identity.create({
    authority: "Authority1111111111111111111111111111111111",
    label: "automation-agent",
  });

  strictEqual(
    identity.authority,
    "Authority1111111111111111111111111111111111"
  );
  strictEqual(identity.label, "automation-agent");
  ok(identity.identityId.length > 0);
  strictEqual(
    identity.identityId,
    client.identity.create({
      authority: "Authority1111111111111111111111111111111111",
      label: "automation-agent",
    }).identityId
  );
});

test("creates canonical task objects", () => {
  const client = new TrustSubstrateClient();
  const identity = client.identity.create({
    authority: "Authority1111111111111111111111111111111111",
    label: "task-owner",
  });

  const task = client.task.create({
    identityId: identity.identityId,
    title: "Finalize receipts",
    subtasks: ["collect-proof", "verify-proof"],
  });

  strictEqual(task.identityId, identity.identityId);
  strictEqual(task.title, "Finalize receipts");
  deepStrictEqual(task.subtasks, ["collect-proof", "verify-proof"]);
  ok(task.taskId.length > 0);
});

test("rejects receipt replay attempts", () => {
  const client = new TrustSubstrateClient();
  const identity = client.identity.create({
    authority: "Authority1111111111111111111111111111111111",
    label: "receipt-writer",
  });
  const task = client.task.create({
    identityId: identity.identityId,
    title: "Emit receipts",
  });
  const receipt = client.receipt.create({
    actorId: identity.identityId,
    kind: "completion",
    taskId: task.taskId,
    payload: { domain: "ops", status: "done" },
    sequence: 1,
  });

  const ledger = new ReceiptLedger();
  ledger.append(receipt);

  throws(() => ledger.append(receipt), /replay/i);
});

test("rejects delegation scope mismatches", () => {
  const client = new TrustSubstrateClient();
  const delegation = client.delegation.create({
    delegatorId: "delegator",
    delegateId: "delegate",
    allowedActions: ["assignment", "handoff"],
  });

  throws(
    () =>
      client.delegation.assertAllowed({
        delegation,
        action: "completion",
      }),
    /scope/i
  );
});

test("verifies merkle proofs deterministically", () => {
  const leaves = ["receipt-a", "receipt-b", "receipt-c"];
  const tree = createMerkleTree(leaves);
  const proof = tree.getProof(1);

  ok(
    verifyMerkleProof({
      leaf: leaves[1],
      proof,
      root: tree.root,
      index: 1,
    })
  );

  ok(
    !verifyMerkleProof({
      leaf: "receipt-z",
      proof,
      root: tree.root,
      index: 1,
    })
  );
});

test("derives deterministic reputation from verified history", () => {
  const client = new TrustSubstrateClient();
  const identity = client.identity.create({
    authority: "Authority1111111111111111111111111111111111",
    label: "reputation-agent",
  });
  const task = client.task.create({
    identityId: identity.identityId,
    title: "Track history",
  });
  const history = [
    client.receipt.create({
      actorId: identity.identityId,
      kind: "assignment",
      taskId: task.taskId,
      payload: { domain: "coordination" },
      sequence: 1,
    }),
    client.receipt.create({
      actorId: identity.identityId,
      kind: "completion",
      taskId: task.taskId,
      payload: { domain: "coordination" },
      sequence: 2,
    }),
  ];

  const reputationA = deriveReputation(history);
  const reputationB = client.reputation.derive(history);

  deepStrictEqual(reputationA, reputationB);
  strictEqual(
    reputationA.domains.coordination,
    reputationB.domains.coordination
  );
  ok(reputationA.overall > 0);
});
