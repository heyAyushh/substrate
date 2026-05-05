import { readFileSync } from "fs";
import { join } from "path";

const CORE_CONSTANTS_SOURCE = readFileSync(
  join(
    __dirname,
    "..",
    "..",
    "crates",
    "trust_substrate_core",
    "src",
    "constants.rs",
  ),
  "utf8",
);

function requireByteString(name: string): string {
  const match = CORE_CONSTANTS_SOURCE.match(
    new RegExp(`pub const ${name}: &\\[u8\\] = b"([^"]+)";`),
  );
  if (!match) {
    throw new Error(`missing byte-string constant ${name} in constants.rs`);
  }
  return match[1];
}

function requireU8(name: string): number {
  const match = CORE_CONSTANTS_SOURCE.match(
    new RegExp(`pub const ${name}: u8 = ([^;]+);`),
  );
  if (!match) {
    throw new Error(`missing u8 constant ${name} in constants.rs`);
  }
  return evaluateU8Expression(match[1].trim());
}

function evaluateU8Expression(expression: string): number {
  const normalized = expression.replace(/_/g, "");
  if (/^\d+$/.test(normalized)) {
    return Number(normalized);
  }

  const shiftMatch = normalized.match(/^1\s*<<\s*(\d+)$/);
  if (shiftMatch) {
    return 1 << Number(shiftMatch[1]);
  }

  throw new Error(`unsupported u8 expression: ${expression}`);
}

export const IDENTITY_SEED = requireByteString("IDENTITY_SEED");
export const TASK_SEED = requireByteString("TASK_SEED");
export const RECEIPT_SEED = requireByteString("RECEIPT_SEED");
export const DELEGATION_SEED = requireByteString("DELEGATION_SEED");
export const CHECKPOINT_SEED = requireByteString("CHECKPOINT_SEED");
export const LATEST_CHECKPOINT_SEED = requireByteString(
  "LATEST_CHECKPOINT_SEED",
);
export const TASK_RECEIPT_APPLICATION_SEED = requireByteString(
  "TASK_RECEIPT_APPLICATION_SEED",
);
export const REPUTATION_RECEIPT_APPLICATION_SEED = requireByteString(
  "REPUTATION_RECEIPT_APPLICATION_SEED",
);

export const ASSIGNMENT_SCOPE_BIT = requireU8("ASSIGNMENT_SCOPE_BIT");
export const HANDOFF_SCOPE_BIT = requireU8("HANDOFF_SCOPE_BIT");
export const COMPLETION_SCOPE_BIT = requireU8("COMPLETION_SCOPE_BIT");

export const ASSIGNMENT_KIND = requireU8("ASSIGNMENT_KIND");
export const HANDOFF_KIND = requireU8("HANDOFF_KIND");
export const COMPLETION_KIND = requireU8("COMPLETION_KIND");
export const DISPUTE_RESOLVED_KIND = requireU8("DISPUTE_RESOLVED_KIND");

export const TASK_STATUS_COMPLETED = requireU8("TASK_STATUS_COMPLETED");
