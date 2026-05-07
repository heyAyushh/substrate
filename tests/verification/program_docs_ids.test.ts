import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { deepEqual, ok } from "node:assert/strict";

const REPO_ROOT = process.cwd();

function parseLocalnetPrograms(anchorToml: string): Map<string, string> {
  const sectionMatch = anchorToml.match(
    /\[programs\.localnet\]([\s\S]*?)(?:\n\[|$)/,
  );
  ok(sectionMatch, "Anchor.toml must declare [programs.localnet]");

  return new Map(
    sectionMatch[1]
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => line.match(/^([a-z_]+)\s*=\s*"([^"]+)"$/))
      .filter(Boolean)
      .map(([, name, programId]) => [name, programId] as const),
  );
}

test("program docs list the current localnet program IDs", () => {
  const programs = parseLocalnetPrograms(
    readFileSync(join(REPO_ROOT, "Anchor.toml"), "utf8"),
  );
  const docs = readFileSync(join(REPO_ROOT, "docs/programs.md"), "utf8");

  for (const [name, programId] of programs) {
    ok(
      docs.includes(`| \`${name}\``) && docs.includes(programId),
      `docs/programs.md must list ${name} as ${programId}`,
    );
  }
});

const DOCUMENTED_ACCOUNT_STRUCTS = [
  ["AgentIdentity", "programs/identity_registry/src/state/agent_identity.rs"],
  ["TaskRecord", "programs/task_registry/src/state/task_record.rs"],
  ["SocietyWorld", "programs/task_registry/src/state/society_world.rs"],
  ["ReceiptRecord", "programs/receipt_emitter/src/state/receipt_record.rs"],
  [
    "ReputationAccumulator",
    "programs/reputation_accumulator/src/state/reputation_accumulator.rs",
  ],
  ["IdentityBond", "programs/identity_registry/src/state/identity_bond.rs"],
  [
    "RuntimeAttestation",
    "programs/identity_registry/src/state/runtime_attestation.rs",
  ],
  ["StakeAccount", "programs/agent_stake/src/state/stake_account.rs"],
  [
    "TokenStakeAccount",
    "programs/agent_stake/src/state/token_stake_account.rs",
  ],
  ["SlashMarker", "programs/agent_stake/src/state/slash_marker.rs"],
  ["DisputeVerdict", "programs/dispute_resolver/src/state/dispute_verdict.rs"],
] as const;

function parseRustStructFields(source: string, structName: string): string[] {
  const structMatch = source.match(
    new RegExp(`pub struct ${structName} \\{([\\s\\S]*?)\\n\\}`),
  );
  ok(structMatch, `${structName} must exist in its Rust source`);

  return structMatch[1]
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("pub "))
    .map((line) => line.replace(/^pub\s+/, "").replace(/,$/, ""));
}

function parseMarkdownAccountFields(
  docs: string,
  accountName: string,
): string[] {
  const sectionMatch = docs.match(
    new RegExp(`### \`${accountName}\`([\\s\\S]*?)(?:\\n### |\\n## |$)`),
  );
  ok(sectionMatch, `docs/programs.md must document ${accountName}`);

  const fieldsMatch = sectionMatch[1].match(
    /Fields:\n\n([\s\S]*?)(?:\n\nPDA seed:|\n\n##|$)/,
  );
  ok(fieldsMatch, `docs/programs.md must list ${accountName} fields`);

  return fieldsMatch[1]
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- `"))
    .map((line) => line.replace(/^- `/, "").replace(/`$/, ""));
}

test("program docs account fields match account structs", () => {
  const docs = readFileSync(join(REPO_ROOT, "docs/programs.md"), "utf8");

  for (const [structName, sourcePath] of DOCUMENTED_ACCOUNT_STRUCTS) {
    const sourceFields = parseRustStructFields(
      readFileSync(join(REPO_ROOT, sourcePath), "utf8"),
      structName,
    );
    const documentedFields = parseMarkdownAccountFields(docs, structName);

    deepEqual(
      documentedFields,
      sourceFields,
      `docs/programs.md ${structName} fields must match ${sourcePath}`,
    );
  }
});
