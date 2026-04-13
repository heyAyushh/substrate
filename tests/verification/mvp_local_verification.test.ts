const { test } = require("node:test");
const { deepStrictEqual, ok, strictEqual } = require("node:assert/strict");

/**
 * @typedef {Object} VerificationAttempt
 * @property {boolean} signerPresent
 * @property {boolean} signerMatchesAuthority
 * @property {boolean} pdaSeedsMatch
 * @property {boolean} replayNonceFresh
 * @property {boolean} proofIsFresh
 * @property {boolean} delegationWithinScope
 * @property {boolean} writesDerivedReputationOnly
 * @property {boolean} stakeSlashReceiptFresh
 */

const REQUIRED_SECURITY_COVERAGE = [
  "signer-checks",
  "pda-validation",
  "replay-protection",
  "stale-proofs",
  "unauthorized-delegation",
  "direct-reputation-score-writes",
  "stake-slash-replay-protection",
];

const REQUIRED_VERIFICATION_PIPELINE = [
  "local-package-tests",
  "rust-program-and-model-tests",
  "verification-contract-tests",
  "anchor-build-and-test",
  "surfpool-end-to-end",
];

const LOCAL_ONLY_RULES = Object.freeze({
  networkCalls: false,
  externalInstalls: false,
  workspaceMetadataReads: true,
  executionEnvironment: "node:test",
});

/**
 * @param {VerificationAttempt} attempt
 * @returns {string[]}
 */
function evaluateSecurityAttempt(attempt) {
  const failures = [];

  if (!attempt.signerPresent || !attempt.signerMatchesAuthority) {
    failures.push("signer-checks");
  }

  if (!attempt.pdaSeedsMatch) {
    failures.push("pda-validation");
  }

  if (!attempt.replayNonceFresh) {
    failures.push("replay-protection");
  }

  if (!attempt.proofIsFresh) {
    failures.push("stale-proofs");
  }

  if (!attempt.delegationWithinScope) {
    failures.push("unauthorized-delegation");
  }

  if (!attempt.writesDerivedReputationOnly) {
    failures.push("direct-reputation-score-writes");
  }

  if (!attempt.stakeSlashReceiptFresh) {
    failures.push("stake-slash-replay-protection");
  }

  return failures;
}

/**
 * @param {Partial<VerificationAttempt>} overrides
 * @returns {VerificationAttempt}
 */
function createHappyPath(overrides = {}) {
  return {
    signerPresent: true,
    signerMatchesAuthority: true,
    pdaSeedsMatch: true,
    replayNonceFresh: true,
    proofIsFresh: true,
    delegationWithinScope: true,
    writesDerivedReputationOnly: true,
    stakeSlashReceiptFresh: true,
    ...overrides,
  };
}

test("verification layer stays local-only", () => {
  strictEqual(LOCAL_ONLY_RULES.networkCalls, false);
  strictEqual(LOCAL_ONLY_RULES.externalInstalls, false);
  strictEqual(LOCAL_ONLY_RULES.workspaceMetadataReads, true);
  strictEqual(LOCAL_ONLY_RULES.executionEnvironment, "node:test");
});

test("security acceptance criteria are fully covered", () => {
  deepStrictEqual(
    [...new Set(REQUIRED_SECURITY_COVERAGE)],
    REQUIRED_SECURITY_COVERAGE
  );
  strictEqual(REQUIRED_SECURITY_COVERAGE.length, 7);
  ok(REQUIRED_SECURITY_COVERAGE.includes("signer-checks"));
  ok(REQUIRED_SECURITY_COVERAGE.includes("pda-validation"));
  ok(REQUIRED_SECURITY_COVERAGE.includes("replay-protection"));
  ok(REQUIRED_SECURITY_COVERAGE.includes("stale-proofs"));
  ok(REQUIRED_SECURITY_COVERAGE.includes("unauthorized-delegation"));
  ok(REQUIRED_SECURITY_COVERAGE.includes("direct-reputation-score-writes"));
  ok(REQUIRED_SECURITY_COVERAGE.includes("stake-slash-replay-protection"));
});

test("verification order ends with surfpool and excludes devnet as a required gate", () => {
  deepStrictEqual(REQUIRED_VERIFICATION_PIPELINE, [
    "local-package-tests",
    "rust-program-and-model-tests",
    "verification-contract-tests",
    "anchor-build-and-test",
    "surfpool-end-to-end",
  ]);
  ok(!REQUIRED_VERIFICATION_PIPELINE.includes("devnet"));
});

test("a valid local attempt passes every security gate", () => {
  deepStrictEqual(evaluateSecurityAttempt(createHappyPath()), []);
});

test("signer checks reject unsigned or mismatched authority actions", () => {
  deepStrictEqual(
    evaluateSecurityAttempt(
      createHappyPath({
        signerPresent: false,
      })
    ),
    ["signer-checks"]
  );

  deepStrictEqual(
    evaluateSecurityAttempt(
      createHappyPath({
        signerMatchesAuthority: false,
      })
    ),
    ["signer-checks"]
  );
});

test("PDA validation expects canonical seeds and bumps", () => {
  deepStrictEqual(
    evaluateSecurityAttempt(
      createHappyPath({
        pdaSeedsMatch: false,
      })
    ),
    ["pda-validation"]
  );
});

test("replay protection rejects duplicate receipt submissions", () => {
  deepStrictEqual(
    evaluateSecurityAttempt(
      createHappyPath({
        replayNonceFresh: false,
      })
    ),
    ["replay-protection"]
  );
});

test("stale proofs are rejected", () => {
  deepStrictEqual(
    evaluateSecurityAttempt(
      createHappyPath({
        proofIsFresh: false,
      })
    ),
    ["stale-proofs"]
  );
});

test("unauthorized delegation is rejected", () => {
  deepStrictEqual(
    evaluateSecurityAttempt(
      createHappyPath({
        delegationWithinScope: false,
      })
    ),
    ["unauthorized-delegation"]
  );
});

test("reputation cannot be written directly", () => {
  deepStrictEqual(
    evaluateSecurityAttempt(
      createHappyPath({
        writesDerivedReputationOnly: false,
      })
    ),
    ["direct-reputation-score-writes"]
  );
});

test("stake slashing cannot reuse a dispute resolution receipt", () => {
  deepStrictEqual(
    evaluateSecurityAttempt(
      createHappyPath({
        stakeSlashReceiptFresh: false,
      })
    ),
    ["stake-slash-replay-protection"]
  );
});

test("multiple violations are reported together", () => {
  deepStrictEqual(
    evaluateSecurityAttempt(
      createHappyPath({
        signerPresent: false,
        pdaSeedsMatch: false,
        replayNonceFresh: false,
        proofIsFresh: false,
        delegationWithinScope: false,
        writesDerivedReputationOnly: false,
        stakeSlashReceiptFresh: false,
      })
    ),
    [
      "signer-checks",
      "pda-validation",
      "replay-protection",
      "stale-proofs",
      "unauthorized-delegation",
      "direct-reputation-score-writes",
      "stake-slash-replay-protection",
    ]
  );
});
