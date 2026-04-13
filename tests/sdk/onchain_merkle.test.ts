import test from "node:test";
import { deepStrictEqual, ok, strictEqual } from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  EMPTY_ONCHAIN_ROOT,
  hashInternalBytes,
  hashLeafBytes,
  OnchainMerkleTree,
  verifyOnchainInclusion,
} from "../../packages/sdk/src/index.js";

test("hashLeafBytes matches sha256('leaf:' || data)", () => {
  const data = Buffer.from([1, 2, 3]);
  const expected = createHash("sha256")
    .update(Buffer.from("leaf:", "utf8"))
    .update(data)
    .digest();
  ok(hashLeafBytes(data).equals(expected));
});

test("hashInternalBytes matches sha256('node:' || left || right)", () => {
  const left = Buffer.alloc(32, 1);
  const right = Buffer.alloc(32, 2);
  const expected = createHash("sha256")
    .update(Buffer.from("node:", "utf8"))
    .update(left)
    .update(right)
    .digest();
  ok(hashInternalBytes(left, right).equals(expected));
});

test("OnchainMerkleTree produces verifiable proofs that round-trip through verifier", () => {
  const leaves = [
    Buffer.from("receipt-a"),
    Buffer.from("receipt-b"),
    Buffer.from("receipt-c"),
    Buffer.from("receipt-d"),
  ];
  const tree = new OnchainMerkleTree(leaves);
  strictEqual(tree.leafCount(), leaves.length);

  for (let index = 0; index < leaves.length; index += 1) {
    const proof = tree.getProof(index);
    const leafHash = hashLeafBytes(leaves[index]);
    ok(verifyOnchainInclusion(leafHash, proof, leaves.length, tree.root));
  }
});

test("verifyOnchainInclusion rejects forged leaves", () => {
  const tree = new OnchainMerkleTree([Buffer.from("a"), Buffer.from("b")]);
  const proof = tree.getProof(0);
  const forgedLeaf = hashLeafBytes(Buffer.from("forged"));
  ok(!verifyOnchainInclusion(forgedLeaf, proof, 2, tree.root));
});

test("verifyOnchainInclusion rejects out-of-range index", () => {
  const tree = new OnchainMerkleTree([Buffer.from("a")]);
  const proof = tree.getProof(0);
  const leafHash = hashLeafBytes(Buffer.from("a"));
  ok(
    !verifyOnchainInclusion(
      leafHash,
      { index: 5, siblings: proof.siblings },
      1,
      tree.root
    )
  );
});

test("empty onchain root is 32 zero bytes", () => {
  deepStrictEqual(Array.from(EMPTY_ONCHAIN_ROOT), new Array(32).fill(0));
});
