import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  createPrivateKey,
  generateKeyPairSync,
  type JsonWebKeyInput,
  type KeyObject,
} from "node:crypto";

import { createKeyPairSignerFromBytes, type KeyPairSigner } from "@solana/kit";

import { parseKeyPairBytes } from "../../packages/pi-extension/src/keypair.ts";

interface SocietyAgentIdentityInput {
  readonly rootDirectory: string;
  readonly sessionId: string;
  readonly agentId: string;
  readonly agentName?: string;
}

export interface SocietyAgentIdentityMaterial {
  readonly signer: KeyPairSigner;
  readonly actionSigningKey: KeyObject;
  readonly directory: string;
  readonly keypairPath: string;
  readonly manifestPath: string;
  readonly created: boolean;
}

interface SocietyAgentIdentityManifest {
  readonly schemaVersion: number;
  readonly sessionId: string;
  readonly agentId: string;
  readonly agentName?: string;
  readonly address: string;
  readonly keypairPath: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

const IDENTITY_SCHEMA_VERSION = 1;
const KEYPAIR_FILE_NAME = "keypair.json";
const MANIFEST_FILE_NAME = "identity.json";
const SOLANA_KEYPAIR_LENGTH = 64;
const ED25519_SEED_LENGTH = 32;
const SAFE_PATH_SEGMENT = /[^a-zA-Z0-9_.-]+/g;
const LEADING_OR_TRAILING_SEPARATOR = /^-+|-+$/g;
const GENERATED_AGENT_IDENTITY_MODE = 0o600;

export const loadOrCreateSocietyAgentIdentity = async (
  input: SocietyAgentIdentityInput,
): Promise<SocietyAgentIdentityMaterial> => {
  const directory = join(
    input.rootDirectory,
    safePathSegment(input.sessionId),
    safePathSegment(input.agentId),
  );
  const keypairPath = join(directory, KEYPAIR_FILE_NAME);
  const manifestPath = join(directory, MANIFEST_FILE_NAME);

  await mkdir(directory, { recursive: true, mode: 0o700 });

  const created = !existsSync(keypairPath);
  const keypairBytes = created
    ? generateSolanaKeypairBytes()
    : parseKeyPairBytes(await readFile(keypairPath, "utf8"), keypairPath);

  if (created) {
    await writeFile(keypairPath, JSON.stringify(Array.from(keypairBytes)));
    await chmod(keypairPath, GENERATED_AGENT_IDENTITY_MODE);
  }

  const signer = await createKeyPairSignerFromBytes(keypairBytes);
  const now = new Date().toISOString();
  const existingManifest = await readManifest(manifestPath);
  const manifest: SocietyAgentIdentityManifest = {
    schemaVersion: IDENTITY_SCHEMA_VERSION,
    sessionId: input.sessionId,
    agentId: input.agentId,
    ...(input.agentName ? { agentName: input.agentName } : {}),
    address: signer.address,
    keypairPath,
    createdAt: existingManifest?.createdAt ?? now,
    updatedAt: now,
  };
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  return {
    signer,
    actionSigningKey: createPrivateKeyFromSolanaKeypairBytes(keypairBytes),
    directory,
    keypairPath,
    manifestPath,
    created,
  };
};

export const createPrivateKeyFromSolanaKeypairBytes = (
  keypairBytes: Uint8Array,
): KeyObject => {
  if (keypairBytes.length !== SOLANA_KEYPAIR_LENGTH) {
    throw new Error(
      `Solana keypair must contain ${SOLANA_KEYPAIR_LENGTH} bytes, got ${keypairBytes.length}`,
    );
  }
  const seed = keypairBytes.slice(0, ED25519_SEED_LENGTH);
  const publicKey = keypairBytes.slice(ED25519_SEED_LENGTH);

  return createPrivateKey({
    key: {
      crv: "Ed25519",
      d: Buffer.from(seed).toString("base64url"),
      kty: "OKP",
      x: Buffer.from(publicKey).toString("base64url"),
    },
    format: "jwk",
  });
};

const generateSolanaKeypairBytes = (): Uint8Array => {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const privateJwk = privateKey.export({ format: "jwk" }) as JsonWebKeyInput;
  const publicJwk = publicKey.export({ format: "jwk" }) as JsonWebKeyInput;
  const seed = readBase64UrlField(privateJwk.d, "private seed");
  const publicBytes = readBase64UrlField(publicJwk.x, "public key");
  const keypairBytes = new Uint8Array(SOLANA_KEYPAIR_LENGTH);
  keypairBytes.set(seed, 0);
  keypairBytes.set(publicBytes, ED25519_SEED_LENGTH);
  return keypairBytes;
};

const readBase64UrlField = (value: unknown, label: string): Uint8Array => {
  if (typeof value !== "string") {
    throw new Error(`Generated Ed25519 ${label} is missing`);
  }
  return Buffer.from(value, "base64url");
};

const safePathSegment = (value: string): string => {
  const segment = value
    .replace(SAFE_PATH_SEGMENT, "-")
    .replace(LEADING_OR_TRAILING_SEPARATOR, "");
  return segment || "agent";
};

const readManifest = async (
  manifestPath: string,
): Promise<SocietyAgentIdentityManifest | null> => {
  if (!existsSync(manifestPath)) return null;
  try {
    return JSON.parse(
      await readFile(manifestPath, "utf8"),
    ) as SocietyAgentIdentityManifest;
  } catch {
    return null;
  }
};
