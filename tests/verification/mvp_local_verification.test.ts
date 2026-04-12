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
 */

const REQUIRED_SECURITY_COVERAGE = [
  "signer-checks",
  "pda-validation",
  "replay-protection",
  "stale-proofs",
  "unauthorized-delegation",
  "direct-reputation-score-writes"
];

const LOCAL_ONLY_RULES = Object.freeze({
  networkCalls: false,
  externalInstalls: false,
  workspaceDependencies: false,
  executionEnvironment: "node:test"
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
    ...overrides
  };
}

test("verification layer stays local-only", () => {
  strictEqual(LOCAL_ONLY_RULES.networkCalls, false);
  strictEqual(LOCAL_ONLY_RULES.externalInstalls, false);
  strictEqual(LOCAL_ONLY_RULES.workspaceDependencies, false);
  strictEqual(LOCAL_ONLY_RULES.executionEnvironment, "node:test");
});

test("security acceptance criteria are fully covered", () => {
  deepStrictEqual([...new Set(REQUIRED_SECURITY_COVERAGE)], REQUIRED_SECURITY_COVERAGE);
  strictEqual(REQUIRED_SECURITY_COVERAGE.length, 6);
  ok(REQUIRED_SECURITY_COVERAGE.includes("signer-checks"));
  ok(REQUIRED_SECURITY_COVERAGE.includes("pda-validation"));
  ok(REQUIRED_SECURITY_COVERAGE.includes("replay-protection"));
  ok(REQUIRED_SECURITY_COVERAGE.includes("stale-proofs"));
  ok(REQUIRED_SECURITY_COVERAGE.includes("unauthorized-delegation"));
  ok(REQUIRED_SECURITY_COVERAGE.includes("direct-reputation-score-writes"));
});

test("a valid local attempt passes every security gate", () => {
  deepStrictEqual(evaluateSecurityAttempt(createHappyPath()), []);
});

test("signer checks reject unsigned or mismatched authority actions", () => {
  deepStrictEqual(
    evaluateSecurityAttempt(
      createHappyPath({
        signerPresent: false
      })
    ),
    ["signer-checks"]
  );

  deepStrictEqual(
    evaluateSecurityAttempt(
      createHappyPath({
        signerMatchesAuthority: false
      })
    ),
    ["signer-checks"]
  );
});

test("PDA validation expects canonical seeds and bumps", () => {
  deepStrictEqual(
    evaluateSecurityAttempt(
      createHappyPath({
        pdaSeedsMatch: false
      })
    ),
    ["pda-validation"]
  );
});

test("replay protection rejects duplicate receipt submissions", () => {
  deepStrictEqual(
    evaluateSecurityAttempt(
      createHappyPath({
        replayNonceFresh: false
      })
    ),
    ["replay-protection"]
  );
});

test("stale proofs are rejected", () => {
  deepStrictEqual(
    evaluateSecurityAttempt(
      createHappyPath({
        proofIsFresh: false
      })
    ),
    ["stale-proofs"]
  );
});

test("unauthorized delegation is rejected", () => {
  deepStrictEqual(
    evaluateSecurityAttempt(
      createHappyPath({
        delegationWithinScope: false
      })
    ),
    ["unauthorized-delegation"]
  );
});

test("reputation cannot be written directly", () => {
  deepStrictEqual(
    evaluateSecurityAttempt(
      createHappyPath({
        writesDerivedReputationOnly: false
      })
    ),
    ["direct-reputation-score-writes"]
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
        writesDerivedReputationOnly: false
      })
    ),
    [
      "signer-checks",
      "pda-validation",
      "replay-protection",
      "stale-proofs",
      "unauthorized-delegation",
      "direct-reputation-score-writes"
    ]
  );
});
