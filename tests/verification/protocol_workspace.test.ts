const { ok, strictEqual } = require("node:assert/strict");
const { existsSync, readFileSync } = require("node:fs");
const { join } = require("node:path");
const { test } = require("node:test");

const REPO_ROOT = join(__dirname, "..", "..");
const ANCHOR_TOML = readFileSync(join(REPO_ROOT, "Anchor.toml"), "utf8");

const REQUIRED_PROGRAMS = [
  "identity_registry",
  "task_registry",
  "receipt_emitter",
  "delegation_engine",
  "reputation_accumulator",
  "proof_verifier",
];

test("workspace declares the deployable protocol programs", () => {
  for (const programName of REQUIRED_PROGRAMS) {
    ok(
      ANCHOR_TOML.includes(`${programName} = "`),
      `${programName} must be declared in Anchor.toml`
    );
  }

  ok(
    !ANCHOR_TOML.includes("trust_substrate = "),
    "the bundled trust_substrate program must not remain a deployable target"
  );
});

test("each program uses a feature-owned instruction module layout", () => {
  for (const programName of REQUIRED_PROGRAMS) {
    const programRoot = join(REPO_ROOT, "programs", programName);
    const instructionRoot = join(programRoot, "src", "instructions");

    ok(
      existsSync(join(programRoot, "Cargo.toml")),
      `${programName} crate missing`
    );
    ok(
      existsSync(join(programRoot, "src", "lib.rs")),
      `${programName} lib missing`
    );
    ok(
      existsSync(join(instructionRoot, "mod.rs")),
      `${programName} instruction mod missing`
    );

    const libSource = readFileSync(join(programRoot, "src", "lib.rs"), "utf8");
    strictEqual(
      libSource.includes("pub mod instructions;"),
      true,
      `${programName} must expose its instruction module`
    );
  }
});
