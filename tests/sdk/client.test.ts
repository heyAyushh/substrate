import test from "node:test";
import { spawnSync } from "node:child_process";
import { deepStrictEqual, ok, strictEqual, throws } from "node:assert/strict";
import { resolve } from "node:path";
import { address, getAddressEncoder } from "@solana/kit";
import {
  ReceiptLedger,
  TrustSubstrateClient,
  deriveAuditReceiptIdBytes,
  createAuthorityRotationEvent,
  createMerkleTree,
  derivePreviousReceiptBytes,
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
    "Authority1111111111111111111111111111111111",
  );
  strictEqual(identity.label, "automation-agent");
  ok(identity.identityId.length > 0);
  strictEqual(
    identity.identityId,
    client.identity.create({
      authority: "Authority1111111111111111111111111111111111",
      label: "automation-agent",
    }).identityId,
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
  strictEqual(task.domain, "general");
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
    domain: "ops",
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

test("derives previous receipt bytes from committed receipt addresses", () => {
  const receiptAddress = address("SysvarC1ock11111111111111111111111111111111");

  deepStrictEqual(
    derivePreviousReceiptBytes({ previousReceiptId: receiptAddress }),
    getAddressEncoder().encode(receiptAddress),
  );
});

test("derives audit receipt bytes from the auditor target and round", () => {
  const auditorIdentity = address("11111111111111111111111111111111");
  const targetReceipt = address("SysvarC1ock11111111111111111111111111111111");
  const firstDerivation = deriveAuditReceiptIdBytes({
    auditorIdentity,
    targetReceipt,
    kind: 4,
    round: 37,
  });
  const secondDerivation = deriveAuditReceiptIdBytes({
    auditorIdentity,
    targetReceipt,
    kind: 4,
    round: 37,
  });

  strictEqual(firstDerivation.length, 32);
  deepStrictEqual(firstDerivation, secondDerivation);
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
    /scope/i,
  );
});

test("multi-agent simulation emits explicit delegation chain metadata", () => {
  const scriptPath = resolve(
    process.cwd(),
    "../../examples/multi_agent/run.ts",
  );
  const result = spawnSync("node", ["--experimental-strip-types", scriptPath], {
    encoding: "utf8",
  });

  strictEqual(result.status, 0, result.stderr);

  const output = JSON.parse(result.stdout) as {
    readonly identities: {
      readonly planner: string;
      readonly alpha: string;
      readonly beta: string;
    };
    readonly task: string;
    readonly delegationChain?: ReadonlyArray<{
      readonly delegatorId: string;
      readonly delegateId: string;
      readonly allowedActions: ReadonlyArray<string>;
      readonly taskId: string;
      readonly domain: string;
    }>;
    readonly delegationAssertions?: ReadonlyArray<{
      readonly actorId: string;
      readonly action: string;
      readonly taskId: string;
    }>;
  };

  strictEqual(output.delegationChain?.length, 2);
  deepStrictEqual(output.delegationChain, [
    {
      delegatorId: output.identities.planner,
      delegateId: output.identities.alpha,
      allowedActions: ["handoff", "completion"],
      taskId: output.task,
      domain: "coding",
      expiresAtSlot: 260,
    },
    {
      delegatorId: output.identities.alpha,
      delegateId: output.identities.beta,
      allowedActions: ["handoff", "completion"],
      taskId: output.task,
      domain: "coding",
      expiresAtSlot: 300,
    },
  ]);
  deepStrictEqual(output.delegationAssertions, [
    {
      actorId: output.identities.alpha,
      action: "completion",
      taskId: output.task,
      domain: "coding",
      currentSlot: 150,
    },
    {
      actorId: output.identities.alpha,
      action: "handoff",
      taskId: output.task,
      domain: "coding",
      currentSlot: 240,
    },
    {
      actorId: output.identities.beta,
      action: "completion",
      taskId: output.task,
      domain: "coding",
      currentSlot: 260,
    },
  ]);
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
    }),
  );

  ok(
    !verifyMerkleProof({
      leaf: "receipt-z",
      proof,
      root: tree.root,
      index: 1,
    }),
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
    domain: "coordination",
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
    reputationB.domains.coordination,
  );
  ok(reputationA.overall > 0);
});

test("models authority rotation with sdk identity helpers", () => {
  const client = new TrustSubstrateClient();
  const identity = client.identity.create({
    authority: "Authority1111111111111111111111111111111111",
    label: "rotation-agent",
  });

  const pendingRotation = client.identity.rotateAuthority({
    identity,
    newAuthority: "Authority2222222222222222222222222222222222",
    unlockSlot: 125,
  });
  const finalized = client.identity.finalizeRotation({
    identity,
    pendingRotation,
    finalizedSlot: 125,
    sequence: 3,
  });

  strictEqual(
    finalized.identity.authority,
    "Authority2222222222222222222222222222222222",
  );
  strictEqual(finalized.rotation.agentId, identity.identityId);
  strictEqual(finalized.rotation.mode, "normal");
  strictEqual(finalized.rotation.sequence, 3);
});

test("models emergency guardian rotation with sdk identity helpers", () => {
  const client = new TrustSubstrateClient();
  const identity = client.identity.create({
    authority: "Authority1111111111111111111111111111111111",
    label: "incident-agent",
  });
  const guardianSet = client.identity.configureGuardianSet({
    identity,
    guardians: [
      "Guardian11111111111111111111111111111111111",
      "Guardian22222222222222222222222222222222222",
      "Guardian33333333333333333333333333333333333",
    ],
    threshold: 2,
  });

  const finalized = client.identity.emergencyRotateAuthority({
    identity,
    guardianSet,
    approvedGuardians: [
      "Guardian11111111111111111111111111111111111",
      "Guardian22222222222222222222222222222222222",
    ],
    newAuthority: "Authority9999999999999999999999999999999999",
    finalizedSlot: 44,
    sequence: 4,
  });

  strictEqual(
    finalized.identity.authority,
    "Authority9999999999999999999999999999999999",
  );
  strictEqual(finalized.rotation.mode, "emergency");
  strictEqual(finalized.rotation.sequence, 4);
});

test("rejects emergency rotation approvals that do not satisfy guardian policy", () => {
  const client = new TrustSubstrateClient();
  const identity = client.identity.create({
    authority: "Authority1111111111111111111111111111111111",
    label: "guarded-agent",
  });
  const guardianSet = client.identity.configureGuardianSet({
    identity,
    guardians: [
      "Guardian11111111111111111111111111111111111",
      "Guardian22222222222222222222222222222222222",
      "Guardian33333333333333333333333333333333333",
    ],
    threshold: 2,
  });

  throws(
    () =>
      client.identity.emergencyRotateAuthority({
        identity,
        guardianSet,
        approvedGuardians: ["Guardian11111111111111111111111111111111111"],
        newAuthority: "Authority9999999999999999999999999999999999",
        finalizedSlot: 45,
      }),
    /threshold/i,
  );

  throws(
    () =>
      client.identity.emergencyRotateAuthority({
        identity,
        guardianSet,
        approvedGuardians: [
          "Guardian11111111111111111111111111111111111",
          "Guardian44444444444444444444444444444444444",
        ],
        newAuthority: "Authority9999999999999999999999999999999999",
        finalizedSlot: 46,
      }),
    /not configured/i,
  );
});

test("applies rotation decay to receipts that predate the latest authority change", () => {
  const client = new TrustSubstrateClient();
  const identity = client.identity.create({
    authority: "Authority1111111111111111111111111111111111",
    label: "decay-agent",
  });
  const task = client.task.create({
    identityId: identity.identityId,
    title: "Track rotation decay",
    domain: "coordination",
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
    client.receipt.create({
      actorId: identity.identityId,
      kind: "handoff",
      taskId: task.taskId,
      payload: { domain: "coordination" },
      sequence: 4,
    }),
  ];
  const rotation = createAuthorityRotationEvent({
    agentId: identity.identityId,
    previousAuthority: identity.authority,
    newAuthority: "Authority3333333333333333333333333333333333",
    slot: 50,
    sequence: 3,
    mode: "normal",
  });

  const withoutDecay = deriveReputation(history);
  const withDecay = deriveReputation(history, {
    authorityRotations: [rotation],
    decayPreRotationFactor: 0.5,
  });

  strictEqual(withoutDecay.overall, 8);
  strictEqual(withDecay.overall, 5);
  strictEqual(withDecay.domains.coordination, 5);
});
