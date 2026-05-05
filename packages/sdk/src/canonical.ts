import { createHash } from "node:crypto";

export const TRUST_SUBSTRATE_NAMESPACE = "trust-substrate";
export const EMPTY_ROOT_LABEL = "trust-substrate:empty-root";

export function stableSerialize(value: unknown): string {
  return JSON.stringify(normalize(value));
}

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function hashCanonical(value: unknown): string {
  return sha256Hex(`${TRUST_SUBSTRATE_NAMESPACE}:${stableSerialize(value)}`);
}

export function deriveIdentifier(prefix: string, value: unknown): string {
  return `${prefix}_${hashCanonical(value).slice(0, 32)}`;
}

export function emptyRoot(): string {
  return sha256Hex(EMPTY_ROOT_LABEL);
}

function normalize(value: unknown): unknown {
  if (value === null) {
    return null;
  }

  if (Array.isArray(value)) {
    return value.map(normalize);
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === "bigint") {
    return value.toString();
  }

  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right));

    return entries.reduce<Record<string, unknown>>(
      (normalized, [key, entry]) => {
        normalized[key] = normalize(entry);
        return normalized;
      },
      {},
    );
  }

  return value;
}
