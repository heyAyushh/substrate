import { readFile } from "node:fs/promises";

import {
  createKeyPairSignerFromBytes,
  type KeyPairSigner,
} from "@solana/kit";

const SOLANA_KEYPAIR_LENGTH = 64;

const parseKeypairFile = (contents: string, path: string): Uint8Array => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(contents);
  } catch (error) {
    throw new Error(
      `Failed to parse keypair JSON at ${path}: ${(error as Error).message}`
    );
  }
  if (!Array.isArray(parsed)) {
    throw new Error(
      `Keypair at ${path} must be a JSON array of ${SOLANA_KEYPAIR_LENGTH} bytes`
    );
  }
  if (parsed.length !== SOLANA_KEYPAIR_LENGTH) {
    throw new Error(
      `Keypair at ${path} must contain ${SOLANA_KEYPAIR_LENGTH} bytes, got ${parsed.length}`
    );
  }
  return Uint8Array.from(parsed as ReadonlyArray<number>);
};

export const loadKeyPairSignerFromFile = async (
  path: string
): Promise<KeyPairSigner> => {
  const contents = await readFile(path, "utf8");
  const bytes = parseKeypairFile(contents, path);
  return createKeyPairSignerFromBytes(bytes);
};

export const parseKeyPairBytes = parseKeypairFile;
