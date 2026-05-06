import {
  createPublicKey,
  sign as signBytes,
  verify as verifyBytes,
  type KeyObject,
} from "node:crypto";

import { hashCanonical, stableSerialize } from "./canonical.js";
import { OnchainMerkleTree } from "./onchain-merkle.js";

export type ExecutionStepKind =
  | "tool_call"
  | "command"
  | "file_edit"
  | "external_call"
  | "reasoning"
  | "subagent_handoff"
  | "mcp_call";

export interface ExecutionStep {
  readonly seq: number;
  readonly kind: ExecutionStepKind;
  readonly startedAt: string;
  readonly endedAt?: string;
  readonly payload: Record<string, unknown>;
  readonly model?: string;
  readonly tool?: string;
  readonly signature?: StepSignature;
}

export interface ExecutionRecord {
  readonly recordId: string;
  readonly identityId: string;
  readonly taskId: string;
  readonly steps: ReadonlyArray<ExecutionStep>;
}

export interface ExecutionRecordHash {
  readonly root: Buffer;
  readonly leaves: ReadonlyArray<Buffer>;
}

export interface StepSignature {
  readonly signer: string;
  readonly sig: string;
}

export interface ExecutionRecordVerification {
  readonly signedSteps: ReadonlyArray<ExecutionStep>;
  readonly unsignedSteps: ReadonlyArray<ExecutionStep>;
  readonly invalidSteps: ReadonlyArray<ExecutionStep>;
}

interface ExportedEd25519Jwk {
  readonly x?: string;
}

export function canonicalExecutionRecord(record: ExecutionRecord): string {
  return stableSerialize(record);
}

export function hashStep(step: ExecutionStep): string {
  return hashCanonical(stripSignature(step));
}

export function hashExecutionRecord(
  record: ExecutionRecord,
): ExecutionRecordHash {
  if (record.steps.length === 0) {
    throw new Error("ExecutionRecord must contain at least one step");
  }

  const leaves = record.steps.map((step) => Buffer.from(hashStep(step), "hex"));
  const tree = new OnchainMerkleTree(leaves);
  return { root: tree.root, leaves };
}

export function signExecutionStep(
  step: ExecutionStep,
  privateKey: KeyObject,
): ExecutionStep {
  const message = Buffer.from(hashStep(step), "hex");
  const publicKey = createPublicKey(privateKey);
  return {
    ...stripSignature(step),
    signature: {
      signer: rawPublicKeyHex(publicKey),
      sig: signBytes(null, message, privateKey).toString("hex"),
    },
  };
}

export function verifyExecutionRecord(
  record: ExecutionRecord,
  runtimeAuthority: KeyObject | string,
): ExecutionRecordVerification {
  const authorityHex =
    typeof runtimeAuthority === "string"
      ? runtimeAuthority
      : rawPublicKeyHex(runtimeAuthority);
  const signedSteps: ExecutionStep[] = [];
  const unsignedSteps: ExecutionStep[] = [];
  const invalidSteps: ExecutionStep[] = [];

  for (const step of record.steps) {
    if (!step.signature) {
      unsignedSteps.push(step);
      continue;
    }

    if (step.signature.signer !== authorityHex) {
      invalidSteps.push(step);
      continue;
    }

    const signature = Buffer.from(step.signature.sig, "hex");
    const message = Buffer.from(hashStep(step), "hex");
    const isValid = verifyBytes(
      null,
      message,
      keyObjectFromAuthority(runtimeAuthority),
      signature,
    );

    if (isValid) {
      signedSteps.push(step);
    } else {
      invalidSteps.push(step);
    }
  }

  return {
    signedSteps,
    unsignedSteps,
    invalidSteps,
  };
}

function stripSignature(step: ExecutionStep): ExecutionStep {
  const { signature: _signature, ...withoutSignature } = step;
  return withoutSignature;
}

function rawPublicKeyHex(publicKey: KeyObject): string {
  const jwk = publicKey.export({ format: "jwk" }) as ExportedEd25519Jwk;
  const x = jwk.x;
  if (!x) {
    throw new Error("runtime authority key must expose a raw x coordinate");
  }
  return Buffer.from(base64UrlToBytes(x)).toString("hex");
}

function keyObjectFromAuthority(
  runtimeAuthority: KeyObject | string,
): KeyObject {
  if (typeof runtimeAuthority !== "string") {
    return runtimeAuthority;
  }

  return createPublicKey({
    key: {
      crv: "Ed25519",
      kty: "OKP",
      x: Buffer.from(runtimeAuthority, "hex").toString("base64url"),
    },
    format: "jwk",
  });
}

function base64UrlToBytes(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const paddingLength = (4 - (normalized.length % 4)) % 4;
  return Buffer.from(
    normalized.padEnd(normalized.length + paddingLength, "="),
    "base64",
  );
}
