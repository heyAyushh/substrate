import { hashCanonical, sha256Hex } from "./canonical.js";

export interface MerkleProofStep {
  readonly hash: string;
  readonly position: "left" | "right";
}

export interface MerkleProof {
  readonly index: number;
  readonly steps: ReadonlyArray<MerkleProofStep>;
}

export interface MerkleVerificationInput {
  readonly leaf: string;
  readonly proof: MerkleProof;
  readonly root: string;
  readonly index: number;
}

export class MerkleTree {
  readonly leaves: ReadonlyArray<string>;
  readonly root: string;

  private readonly layers: ReadonlyArray<ReadonlyArray<string>>;

  constructor(leaves: ReadonlyArray<string>) {
    if (leaves.length === 0) {
      throw new Error("Merkle tree requires at least one leaf");
    }

    this.leaves = [...leaves];
    this.layers = buildLayers(this.leaves);
    this.root = this.layers[this.layers.length - 1][0];
  }

  getProof(index: number): MerkleProof {
    if (index < 0 || index >= this.leaves.length) {
      throw new Error("Merkle proof index out of range");
    }

    const steps: MerkleProofStep[] = [];
    let cursor = index;

    for (
      let layerIndex = 0;
      layerIndex < this.layers.length - 1;
      layerIndex += 1
    ) {
      const layer = this.layers[layerIndex];
      const isRightNode = cursor % 2 === 1;
      const siblingIndex = isRightNode ? cursor - 1 : cursor + 1;
      const siblingHash = layer[siblingIndex] ?? layer[cursor];

      steps.push({
        hash: siblingHash,
        position: isRightNode ? "left" : "right",
      });

      cursor = Math.floor(cursor / 2);
    }

    return {
      index,
      steps,
    };
  }
}

export function createMerkleTree(leaves: ReadonlyArray<string>): MerkleTree {
  return new MerkleTree(leaves);
}

export function verifyMerkleProof(input: MerkleVerificationInput): boolean {
  const expected = hashLeaf(input.leaf);

  let cursor = expected;

  for (const step of input.proof.steps) {
    cursor =
      step.position === "left"
        ? hashNode(step.hash, cursor)
        : hashNode(cursor, step.hash);
  }

  return cursor === input.root && input.proof.index === input.index;
}

function buildLayers(
  leaves: ReadonlyArray<string>
): ReadonlyArray<ReadonlyArray<string>> {
  const layers: string[][] = [leaves.map(hashLeaf)];
  let current = layers[0];

  while (current.length > 1) {
    const next: string[] = [];

    for (let index = 0; index < current.length; index += 2) {
      const left = current[index];
      const right = current[index + 1] ?? left;
      next.push(hashNode(left, right));
    }

    layers.push(next);
    current = next;
  }

  return layers;
}

function hashLeaf(value: string): string {
  return sha256Hex(`leaf:${value}`);
}

function hashNode(left: string, right: string): string {
  return sha256Hex(`node:${left}:${right}`);
}
