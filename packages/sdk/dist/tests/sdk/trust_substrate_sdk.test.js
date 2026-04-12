"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = require("node:assert/strict");
const index_js_1 = require("../../packages/sdk/src/index.js");
(0, node_test_1.default)("creates deterministic identity objects", () => {
    const client = new index_js_1.TrustSubstrateClient();
    const identity = client.identity.create({
        authority: "Authority1111111111111111111111111111111111",
        label: "automation-agent"
    });
    (0, strict_1.strictEqual)(identity.authority, "Authority1111111111111111111111111111111111");
    (0, strict_1.strictEqual)(identity.label, "automation-agent");
    (0, strict_1.ok)(identity.identityId.length > 0);
    (0, strict_1.strictEqual)(identity.identityId, client.identity.create({
        authority: "Authority1111111111111111111111111111111111",
        label: "automation-agent"
    }).identityId);
});
(0, node_test_1.default)("creates canonical task objects", () => {
    const client = new index_js_1.TrustSubstrateClient();
    const identity = client.identity.create({
        authority: "Authority1111111111111111111111111111111111",
        label: "task-owner"
    });
    const task = client.task.create({
        identityId: identity.identityId,
        title: "Finalize receipts",
        subtasks: ["collect-proof", "verify-proof"]
    });
    (0, strict_1.strictEqual)(task.identityId, identity.identityId);
    (0, strict_1.strictEqual)(task.title, "Finalize receipts");
    (0, strict_1.deepStrictEqual)(task.subtasks, ["collect-proof", "verify-proof"]);
    (0, strict_1.ok)(task.taskId.length > 0);
});
(0, node_test_1.default)("rejects receipt replay attempts", () => {
    const client = new index_js_1.TrustSubstrateClient();
    const identity = client.identity.create({
        authority: "Authority1111111111111111111111111111111111",
        label: "receipt-writer"
    });
    const task = client.task.create({
        identityId: identity.identityId,
        title: "Emit receipts"
    });
    const receipt = client.receipt.create({
        actorId: identity.identityId,
        kind: "completion",
        taskId: task.taskId,
        payload: { domain: "ops", status: "done" },
        sequence: 1
    });
    const ledger = new index_js_1.ReceiptLedger();
    ledger.append(receipt);
    (0, strict_1.throws)(() => ledger.append(receipt), /replay/i);
});
(0, node_test_1.default)("rejects delegation scope mismatches", () => {
    const client = new index_js_1.TrustSubstrateClient();
    const delegation = client.delegation.create({
        delegatorId: "delegator",
        delegateId: "delegate",
        allowedActions: ["assignment", "handoff"]
    });
    (0, strict_1.throws)(() => client.delegation.assertAllowed({
        delegation,
        action: "completion"
    }), /scope/i);
});
(0, node_test_1.default)("verifies merkle proofs deterministically", () => {
    const leaves = ["receipt-a", "receipt-b", "receipt-c"];
    const tree = (0, index_js_1.createMerkleTree)(leaves);
    const proof = tree.getProof(1);
    (0, strict_1.ok)((0, index_js_1.verifyMerkleProof)({
        leaf: leaves[1],
        proof,
        root: tree.root,
        index: 1
    }));
    (0, strict_1.ok)(!(0, index_js_1.verifyMerkleProof)({
        leaf: "receipt-z",
        proof,
        root: tree.root,
        index: 1
    }));
});
(0, node_test_1.default)("derives deterministic reputation from verified history", () => {
    const client = new index_js_1.TrustSubstrateClient();
    const identity = client.identity.create({
        authority: "Authority1111111111111111111111111111111111",
        label: "reputation-agent"
    });
    const task = client.task.create({
        identityId: identity.identityId,
        title: "Track history"
    });
    const history = [
        client.receipt.create({
            actorId: identity.identityId,
            kind: "assignment",
            taskId: task.taskId,
            payload: { domain: "coordination" },
            sequence: 1
        }),
        client.receipt.create({
            actorId: identity.identityId,
            kind: "completion",
            taskId: task.taskId,
            payload: { domain: "coordination" },
            sequence: 2
        })
    ];
    const reputationA = (0, index_js_1.deriveReputation)(history);
    const reputationB = client.reputation.derive(history);
    (0, strict_1.deepStrictEqual)(reputationA, reputationB);
    (0, strict_1.strictEqual)(reputationA.domains.coordination, reputationB.domains.coordination);
    (0, strict_1.ok)(reputationA.overall > 0);
});
