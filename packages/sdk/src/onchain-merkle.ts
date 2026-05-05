import { createHash } from "node:crypto";

const LEAF_PREFIX = Buffer.from("leaf:", "utf8");
const NODE_PREFIX = Buffer.from("node:", "utf8");

export const EMPTY_ONCHAIN_ROOT: Buffer = Buffer.alloc(32, 0);

export interface OnchainProof {
  readonly index: number;
  readonly siblings: ReadonlyArray<Buffer>;
}

export class OnchainMerkleTree {
  readonly leafHashes: ReadonlyArray<Buffer>;
  readonly root: Buffer;

  private readonly layers: ReadonlyArray<ReadonlyArray<Buffer>>;

  constructor(leaves: ReadonlyArray<Buffer>) {
    if (leaves.length === 0) {
      throw new Error("Merkle tree requires at least one leaf");
    }

    this.leafHashes = leaves.map(hashLeafBytes);
    this.layers = buildLayers(this.leafHashes);
    this.root = this.layers[this.layers.length - 1][0];
  }

  getProof(index: number): OnchainProof {
    if (index < 0 || index >= this.leafHashes.length) {
      throw new Error("Merkle proof index out of range");
    }

    const siblings: Buffer[] = [];
    let cursor = index;

    for (
      let layerIndex = 0;
      layerIndex < this.layers.length - 1;
      layerIndex += 1
    ) {
      const layer = this.layers[layerIndex];
      const isRightNode = cursor % 2 === 1;
      const siblingIndex = isRightNode ? cursor - 1 : cursor + 1;
      const sibling = layer[siblingIndex] ?? layer[cursor];
      siblings.push(sibling);
      cursor = Math.floor(cursor / 2);
    }

    return { index, siblings };
  }

  leafCount(): number {
    return this.leafHashes.length;
  }
}

export function hashLeafBytes(data: Buffer): Buffer {
  return sha256Concat(LEAF_PREFIX, data);
}

export function hashInternalBytes(left: Buffer, right: Buffer): Buffer {
  return sha256Concat(NODE_PREFIX, left, right);
}

export function verifyOnchainInclusion(
  leaf: Buffer,
  proof: OnchainProof,
  leafCount: number,
  root: Buffer,
): boolean {
  if (proof.index >= leafCount) {
    return false;
  }

  let current = leaf;
  let index = proof.index;
  for (const sibling of proof.siblings) {
    const siblingIsLeft = (index & 1) === 1;
    current = siblingIsLeft
      ? hashInternalBytes(sibling, current)
      : hashInternalBytes(current, sibling);
    index = Math.floor(index / 2);
  }
  return current.equals(root);
}

function buildLayers(
  leafHashes: ReadonlyArray<Buffer>,
): ReadonlyArray<ReadonlyArray<Buffer>> {
  const layers: Buffer[][] = [[...leafHashes]];
  let current = layers[0];

  while (current.length > 1) {
    const next: Buffer[] = [];
    for (let index = 0; index < current.length; index += 2) {
      const left = current[index];
      const right = current[index + 1] ?? left;
      next.push(hashInternalBytes(left, right));
    }
    layers.push(next);
    current = next;
  }

  return layers;
}

function sha256Concat(...parts: ReadonlyArray<Buffer>): Buffer {
  const hash = createHash("sha256");
  for (const part of parts) {
    hash.update(part);
  }
  return hash.digest();
}
