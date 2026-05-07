import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appRoot = path.resolve(__dirname, "..");
const sourceSnapshotPath = path.resolve(
  appRoot,
  "../multi_agent/.snapshot/dashboard-data.json"
);
const publicDirectoryPath = path.resolve(appRoot, "public");
const targetSnapshotPath = path.resolve(
  publicDirectoryPath,
  "dashboard-data.json"
);

const FALLBACK_SNAPSHOT = {
  identities: {},
  task: "local-simulation-snapshot-unavailable",
  delegationChain: [],
  receiptTimeline: [],
  leaderboard: {
    all: [],
    attestedOnly: [],
  },
  stake: {},
};

await mkdir(publicDirectoryPath, { recursive: true });
await writeFile(
  targetSnapshotPath,
  `${JSON.stringify(await loadSanitizedSnapshot(), null, 2)}\n`,
  "utf8"
);

async function loadSanitizedSnapshot() {
  try {
    const snapshot = JSON.parse(await readFile(sourceSnapshotPath, "utf8"));
    return sanitizeSnapshot(snapshot);
  } catch {
    return FALLBACK_SNAPSHOT;
  }
}

function sanitizeSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    return FALLBACK_SNAPSHOT;
  }

  const sanitized = { ...snapshot };
  delete sanitized.snapshotPath;
  delete sanitized.sqlitePath;
  return sanitized;
}
