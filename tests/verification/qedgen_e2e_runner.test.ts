const { ok, strictEqual } = require("node:assert/strict");
const { existsSync, readFileSync } = require("node:fs");
const { join } = require("node:path");
const { test } = require("node:test");

const REPO_ROOT = join(__dirname, "..", "..");
const PACKAGE_JSON = JSON.parse(
  readFileSync(join(REPO_ROOT, "package.json"), "utf8"),
);
const RUNNER_PATH = join(REPO_ROOT, "scripts", "qedgen-e2e.mjs");

test("package scripts expose the QEDGen end-to-end runner", () => {
  strictEqual(
    PACKAGE_JSON.scripts["verify:qedgen"],
    "node scripts/qedgen-e2e.mjs",
  );
  strictEqual(
    PACKAGE_JSON.scripts["verify:qedgen:scaffold"],
    "node scripts/qedgen-e2e.mjs",
  );
  ok(
    PACKAGE_JSON.scripts["verify:release"].includes("pnpm verify:qedgen"),
    "release verification must run strict QEDGen checks",
  );
});

test("QEDGen runner checks drift, codegen, and generated verification", () => {
  ok(existsSync(RUNNER_PATH), "scripts/qedgen-e2e.mjs must exist");

  const runner = readFileSync(RUNNER_PATH, "utf8");

  ok(
    runner.includes("--anchor-project"),
    "runner must compare the spec against Anchor source",
  );
  ok(
    runner.includes("checkProgramDrift(qedgenBin, programs)"),
    "runner must drift-check every Anchor program, not only proof_verifier",
  );
  ok(
    runner.includes("PLACEHOLDER_SPEC_PATTERN"),
    "runner must reject placeholder QEDGen specs case-insensitively",
  );
  ok(
    runner.includes("checkSpecSemantics(name, spec)"),
    "runner must reject semantically fake or stale QEDGen models",
  );
  ok(
    runner.includes("NON_CLOSING_HANDLERS"),
    "runner must catch specs that model active accounts as closed",
  );
  ok(
    runner.includes("filterSyntheticMatchCoverage"),
    "runner must treat QEDGen guarded match expansions as coverage for the source handler",
  );
  ok(
    runner.includes("TOKEN_CONTEXT_CPI_ALLOWLIST"),
    "runner must only allow exact known token-context initializer findings",
  );
  ok(
    runner.includes("GENERATED_BACKEND_SMOKE_SPEC_TEXT"),
    "runner must use a generated backend smoke spec instead of laundering complex scaffold failures",
  );
  ok(
    runner.includes('"quasar"'),
    "runner must verify generated backend artifacts with a currently supported generated target",
  );
  ok(runner.includes('"codegen"'), "runner must generate QEDGen artifacts");
  ok(runner.includes('"verify"'), "runner must run QEDGen verification");
  ok(
    !runner.includes("--allow-generated-verify-failure"),
    "runner must not hide generated backend failures behind an allow-known-failure flag",
  );
});
