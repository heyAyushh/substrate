const { ok, strictEqual, deepStrictEqual } = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { existsSync, readFileSync } = require("node:fs");
const { join } = require("node:path");
const { test } = require("node:test");

const REPO_ROOT = join(__dirname, "..", "..");
const QEDSPEC_PATH = join(
  REPO_ROOT,
  "programs",
  "proof_verifier",
  "proof_verifier.qedspec",
);
const PROOF_VERIFIER_PROGRAM_PATH = join(
  REPO_ROOT,
  "programs",
  "proof_verifier",
);
const DEFAULT_QEDGEN_BIN = process.env.HOME
  ? join(process.env.HOME, ".codex", "skills", "solana-skills", "bin", "qedgen")
  : "";
const TESTING_DOC = readFileSync(join(REPO_ROOT, "docs", "testing.md"), "utf8");

function parseFirstJsonObject(raw) {
  const marker = "\n[";
  const splitIndex = raw.indexOf(marker);
  const firstDocument = splitIndex === -1 ? raw : raw.slice(0, splitIndex);

  return JSON.parse(firstDocument);
}

test("proof_verifier ships a committed QEDGen spec scaffold", () => {
  ok(
    existsSync(QEDSPEC_PATH),
    "programs/proof_verifier/proof_verifier.qedspec must exist",
  );

  const qedspec = readFileSync(QEDSPEC_PATH, "utf8");

  ok(
    qedspec.includes(
      'program_id "7td4jQLbdqZoM4Je1VQKQ6uPfymNU7DdkWgXHcHQYbmE"',
    ),
    "proof_verifier.qedspec must pin the deployed local program id",
  );
  ok(
    qedspec.includes("handler initialize_checkpoint"),
    "proof_verifier.qedspec must cover checkpoint initialization",
  );
  ok(
    qedspec.includes("handler initialize_history_updater"),
    "proof_verifier.qedspec must cover history updater initialization",
  );
  ok(
    qedspec.includes("handler initialize_checkpoint_importer"),
    "proof_verifier.qedspec must cover checkpoint importer initialization",
  );
  ok(
    qedspec.includes("handler checkpoint_import"),
    "proof_verifier.qedspec must cover checkpoint import",
  );
  ok(
    qedspec.includes("handler append_receipt_to_checkpoint"),
    "proof_verifier.qedspec must cover receipt append validation",
  );
  ok(
    qedspec.includes("handler rotate_checkpoint"),
    "proof_verifier.qedspec must cover checkpoint rotation",
  );
  ok(
    qedspec.includes("handler verify_receipt_inclusion"),
    "proof_verifier.qedspec must cover inclusion verification",
  );
  ok(
    !qedspec.includes("TODO:"),
    "proof_verifier.qedspec should not be committed with placeholder TODO markers",
  );
});

test("testing docs explain the local QEDGen proof_verifier check", () => {
  ok(
    TESTING_DOC.includes("proof_verifier.qedspec"),
    "docs/testing.md must reference the proof_verifier QEDGen spec",
  );
  ok(
    TESTING_DOC.includes("qedgen check --spec"),
    "docs/testing.md must explain how to run a local qedgen check",
  );

  const normalizedDoc = TESTING_DOC.replace(/\s+/g, " ").trim();
  strictEqual(
    normalizedDoc.includes("QEDGen"),
    true,
    "docs/testing.md must mention QEDGen by name",
  );
});

test("proof_verifier.qedspec stays aligned with the Anchor source", () => {
  const qedgenBin = process.env.QEDGEN_BIN
    ? process.env.QEDGEN_BIN
    : existsSync(DEFAULT_QEDGEN_BIN)
      ? DEFAULT_QEDGEN_BIN
      : null;

  if (!qedgenBin || !existsSync(QEDSPEC_PATH)) {
    return;
  }

  const result = spawnSync(
    qedgenBin,
    [
      "check",
      "--spec",
      QEDSPEC_PATH,
      "--anchor-project",
      PROOF_VERIFIER_PROGRAM_PATH,
      "--json",
    ],
    {
      cwd: REPO_ROOT,
      encoding: "utf8",
    },
  );

  strictEqual(result.status, 0, result.stderr || result.stdout);

  const coverage = parseFirstJsonObject(result.stdout);

  deepStrictEqual(coverage.handler_coverage, []);
  deepStrictEqual(coverage.effect_coverage, []);
});

test("installed qedgen lints proof_verifier.qedspec without unexpected high-priority findings", () => {
  const qedgenBin = process.env.QEDGEN_BIN
    ? process.env.QEDGEN_BIN
    : existsSync(DEFAULT_QEDGEN_BIN)
      ? DEFAULT_QEDGEN_BIN
      : null;

  if (!qedgenBin || !existsSync(QEDSPEC_PATH)) {
    return;
  }

  const result = spawnSync(
    qedgenBin,
    ["check", "--spec", QEDSPEC_PATH, "--json"],
    {
      cwd: REPO_ROOT,
      encoding: "utf8",
    },
  );

  strictEqual(result.status, 0, result.stderr || result.stdout);

  const findings = JSON.parse(result.stdout);
  const unexpectedHighPriorityFindings = findings
    .filter((finding) => finding.priority <= 2)
    .map((finding) => ({
      priority: finding.priority,
      rule: finding.rule,
      subject: finding.subject,
    }));

  deepStrictEqual(unexpectedHighPriorityFindings, []);
});
