import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, "..");
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
