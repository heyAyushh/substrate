const { ok, strictEqual } = require("node:assert/strict");
const { existsSync, readdirSync, readFileSync } = require("node:fs");
const { join } = require("node:path");
const { test } = require("node:test");

const REPO_ROOT = join(__dirname, "..", "..");
const ANCHOR_TOML = readFileSync(join(REPO_ROOT, "Anchor.toml"), "utf8");
const CORE_ERRORS = readFileSync(
  join(REPO_ROOT, "crates", "trust_substrate_core", "src", "error.rs"),
  "utf8"
);

const REQUIRED_PROGRAMS = [
  "identity_registry",
  "task_registry",
  "receipt_emitter",
  "delegation_engine",
  "reputation_accumulator",
  "proof_verifier",
];

const REQUIRED_ERROR_NAMES = [
  "InvalidDelegationScope",
  "DelegationIdentityMismatch",
  "TaskIdentityMismatch",
  "CheckpointEpochOverflow",
  "CheckpointEpochNotSequential",
  "CheckpointLeafCountRegression",
  "ReputationIdentityMismatch",
  "TaskDisputeRequiredForResolution",
  "ReceiptKindNotSyncableToTask",
  "ReceiptKindNotAppliedToReputation",
  "IdentityAccountTypeMismatch",
  "ReceiptAccountTypeMismatch",
  "TaskAuthorityMismatch",
  "DelegationAuthorityMismatch",
  "ReceiptAuthorityMismatch",
  "CheckpointAuthorityMismatch",
  "ReputationAuthorityMismatch",
  "DelegationDelegateMismatch",
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

test("canonical error taxonomy includes program-scoped failures", () => {
  for (const errorName of REQUIRED_ERROR_NAMES) {
    ok(
      CORE_ERRORS.includes(`${errorName},`),
      `${errorName} must stay in the shared protocol error enum`
    );
  }
});

test("instruction modules use one handler naming convention", () => {
  for (const programName of REQUIRED_PROGRAMS) {
    const instructionRoot = join(
      REPO_ROOT,
      "programs",
      programName,
      "src",
      "instructions"
    );
    const instructionFiles = readdirSync(instructionRoot).filter(
      (fileName) => fileName.endsWith(".rs") && fileName !== "mod.rs"
    );

    for (const fileName of instructionFiles) {
      const source = readFileSync(join(instructionRoot, fileName), "utf8");

      ok(
        source.includes("pub fn handler("),
        `${programName}/${fileName} must expose pub fn handler`
      );
      ok(
        !source.includes("handle_"),
        `${programName}/${fileName} must not reintroduce handle_* naming`
      );
      ok(
        !source.includes("AccountDiscriminatorMismatch"),
        `${programName}/${fileName} must use protocol-specific type errors`
      );
    }
  }
});
