import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, "..");
const TASK_REGISTRY_PDA_INDEX_PATH = join(
  REPO_ROOT,
  "packages",
  "program-clients",
  "src",
  "generated",
  "task_registry",
  "pdas",
  "index.ts"
);
const TASK_REGISTRY_SOCIETY_WORLD_PDA_EXPORT = 'export * from "./societyWorld";';
const TASK_REGISTRY_RECEIPT_APPLICATION_PDA_EXPORT =
  'export * from "./receiptApplication";';
const CONFIG_NAMES = [
  "identity_registry.json",
  "task_registry.json",
  "receipt_emitter.json",
  "delegation_engine.json",
  "proof_verifier.json",
  "reputation_accumulator.json",
  "agent_stake.json",
  "attester_registry.json",
  "dispute_resolver.json",
];

for (const configName of CONFIG_NAMES) {
  const configPath = join(REPO_ROOT, "codama", configName);
  const result = spawnSync(
    "pnpm",
    ["exec", "codama", "run", "--all", "--config", configPath],
    {
      cwd: REPO_ROOT,
      stdio: "inherit",
    }
  );

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

ensureTaskRegistryPdaExport();

function ensureTaskRegistryPdaExport() {
  if (!existsSync(TASK_REGISTRY_PDA_INDEX_PATH)) {
    return;
  }

  const originalContents = readFileSync(TASK_REGISTRY_PDA_INDEX_PATH, "utf8");
  if (originalContents.includes(TASK_REGISTRY_SOCIETY_WORLD_PDA_EXPORT)) {
    return;
  }

  const patchedContents = originalContents.includes(
    TASK_REGISTRY_RECEIPT_APPLICATION_PDA_EXPORT
  )
    ? originalContents.replace(
        TASK_REGISTRY_RECEIPT_APPLICATION_PDA_EXPORT,
        `${TASK_REGISTRY_RECEIPT_APPLICATION_PDA_EXPORT}\n${TASK_REGISTRY_SOCIETY_WORLD_PDA_EXPORT}`
      )
    : `${originalContents.trimEnd()}\n${TASK_REGISTRY_SOCIETY_WORLD_PDA_EXPORT}\n`;

  writeFileSync(TASK_REGISTRY_PDA_INDEX_PATH, patchedContents);
}
