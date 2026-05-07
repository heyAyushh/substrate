const { ok, strictEqual } = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { existsSync, readFileSync } = require("node:fs");
const { join } = require("node:path");
const { test } = require("node:test");

const REPO_ROOT = join(__dirname, "..", "..");
const ANCHOR_TOML = readFileSync(join(REPO_ROOT, "Anchor.toml"), "utf8");
const DEFAULT_QEDGEN_BIN = process.env.HOME
  ? join(process.env.HOME, ".codex", "skills", "solana-skills", "bin", "qedgen")
  : "";

function parseProgramsLocalnet(anchorToml) {
  const sectionMatch = anchorToml.match(
    /\[programs\.localnet\]([\s\S]*?)(?:\n\[|$)/,
  );

  if (!sectionMatch) {
    return [];
  }

  return sectionMatch[1]
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.match(/^([a-z_]+)\s*=\s*"([^"]+)"$/))
    .filter(Boolean)
    .map(([, name, programId]) => ({ name, programId }));
}

test("every deployable Anchor program has a committed QEDGen scaffold", () => {
  const programs = parseProgramsLocalnet(ANCHOR_TOML);

  ok(programs.length > 0, "Anchor.toml must declare localnet programs");

  for (const { name, programId } of programs) {
    const qedspecPath = join(REPO_ROOT, "programs", name, `${name}.qedspec`);

    ok(existsSync(qedspecPath), `${name} must ship ${name}.qedspec`);

    const qedspec = readFileSync(qedspecPath, "utf8");

    ok(
      qedspec.includes(`program_id "${programId}"`),
      `${name}.qedspec must pin ${programId}`,
    );
    ok(
      !qedspec.includes('program_id "11111111111111111111111111111111"'),
      `${name}.qedspec must not keep the placeholder program id`,
    );
    ok(
      qedspec.includes("spec "),
      `${name}.qedspec must declare a top-level spec`,
    );
  }
});

test("installed qedgen parses every committed scaffold", () => {
  const qedgenBin = process.env.QEDGEN_BIN
    ? process.env.QEDGEN_BIN
    : existsSync(DEFAULT_QEDGEN_BIN)
      ? DEFAULT_QEDGEN_BIN
      : null;

  if (!qedgenBin) {
    return;
  }

  const programs = parseProgramsLocalnet(ANCHOR_TOML);

  for (const { name } of programs) {
    const qedspecPath = join(REPO_ROOT, "programs", name, `${name}.qedspec`);

    if (!existsSync(qedspecPath)) {
      continue;
    }

    const result = spawnSync(
      qedgenBin,
      ["check", "--spec", qedspecPath, "--json"],
      {
        cwd: REPO_ROOT,
        encoding: "utf8",
      },
    );

    strictEqual(result.status, 0, `${name}: ${result.stderr || result.stdout}`);
  }
});
