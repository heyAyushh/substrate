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
    "node scripts/qedgen-e2e.mjs --allow-generated-verify-failure",
  );
});

test("QEDGen runner checks drift, codegen, and generated verification", () => {
  ok(existsSync(RUNNER_PATH), "scripts/qedgen-e2e.mjs must exist");

  const runner = readFileSync(RUNNER_PATH, "utf8");

  ok(
    runner.includes("--anchor-project"),
    "runner must compare the spec against Anchor source",
  );
  ok(runner.includes('"codegen"'), "runner must generate QEDGen artifacts");
  ok(runner.includes('"verify"'), "runner must run QEDGen verification");
  ok(
    runner.includes("--allow-generated-verify-failure"),
    "runner must expose the explicit known-generator-blocker mode",
  );
});
