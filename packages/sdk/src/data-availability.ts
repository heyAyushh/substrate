import { hashCanonical } from "./canonical.js";

export interface BlobFetchResult {
  readonly bytes: Uint8Array;
  readonly text?: string;
}

export type BlobFetcher = (uri: string) => Promise<BlobFetchResult>;

export interface VerifyPayloadInput {
  readonly uri: string;
  readonly expectedHash: string;
  readonly fetcher?: BlobFetcher;
}

export class DataAvailabilityError extends Error {
  readonly uri: string;
  readonly reason: "unreachable" | "hash_mismatch" | "unsupported_scheme";

  constructor(
    message: string,
    uri: string,
    reason: "unreachable" | "hash_mismatch" | "unsupported_scheme",
  ) {
    super(message);
    this.name = "DataAvailabilityError";
    this.uri = uri;
    this.reason = reason;
  }
}

export async function verifyPayloadAvailable(
  input: VerifyPayloadInput,
): Promise<void> {
  const fetcher = input.fetcher ?? defaultFetcher;
  let result: BlobFetchResult;
  try {
    result = await fetcher(input.uri);
  } catch (cause) {
    throw new DataAvailabilityError(
      `payload unreachable at ${input.uri}: ${(cause as Error).message}`,
      input.uri,
      "unreachable",
    );
  }

  const payload = decodePayload(result);
  const actualHash = hashCanonical(payload);
  if (actualHash !== input.expectedHash) {
    throw new DataAvailabilityError(
      `payload hash mismatch at ${input.uri} (expected ${input.expectedHash}, got ${actualHash})`,
      input.uri,
      "hash_mismatch",
    );
  }
}

function decodePayload(result: BlobFetchResult): unknown {
  const text = result.text ?? Buffer.from(result.bytes).toString("utf8");
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

const defaultFetcher: BlobFetcher = async (uri) => {
  if (uri.startsWith("file://")) {
    const { readFile } = await import("node:fs/promises");
    const { fileURLToPath } = await import("node:url");
    const bytes = await readFile(fileURLToPath(uri));
    return { bytes: new Uint8Array(bytes) };
  }
  if (uri.startsWith("http://") || uri.startsWith("https://")) {
    const response = await fetch(uri);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const buffer = new Uint8Array(await response.arrayBuffer());
    return { bytes: buffer };
  }
  throw new DataAvailabilityError(
    `unsupported URI scheme for DA fetch: ${uri}`,
    uri,
    "unsupported_scheme",
  );
};
