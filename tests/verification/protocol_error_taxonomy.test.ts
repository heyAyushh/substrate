const { ok } = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { test } = require("node:test");

const REPO_ROOT = join(__dirname, "..", "..");
const CORE_ERRORS = readFileSync(
  join(REPO_ROOT, "crates", "trust_substrate_core", "src", "error.rs"),
  "utf8"
);

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
  "IdentityAuthorityMismatch",
  "ReceiptChainBroken",
  "ReceiptSequenceNotMonotonic",
  "TaskDomainMismatch",
  "CheckpointAuthorityMismatch",
  "ReputationAuthorityMismatch",
  "DelegationDelegateMismatch",
  "StakeAuthorityMismatch",
  "StakeSlashAuthorityMismatch",
  "StakeAmountOverflow",
  "StakeAmountMustBePositive",
  "StakeInsufficient",
  "StakeCooldownNotElapsed",
  "StakeReceiptIdentityMismatch",
  "StakeReceiptKindMismatch",
  "StakeSlashAlreadyApplied",
  "InvalidTrustMode",
  "StakeTrustModeMismatch",
  "StakeTreasuryVaultMismatch",
  "InvalidVerdictOutcome",
  "VerdictAdjudicatorMismatch",
  "VerdictReceiptKindMismatch",
  "VerdictTargetIdentityMismatch",
  "VerdictDisputeReceiptMismatch",
  "VerdictOutcomeNotSlashable",
  "VerdictChallengeUnsupported",
  "VerdictChallengeWindowOpen",
];

test("canonical error taxonomy includes program-scoped failures", () => {
  for (const errorName of REQUIRED_ERROR_NAMES) {
    ok(
      CORE_ERRORS.includes(`${errorName},`),
      `${errorName} must stay in the shared protocol error enum`
    );
  }
});
