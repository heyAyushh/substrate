const { strictEqual } = require("node:assert/strict");
const { test } = require("node:test");

test("built SDK exports on-chain reputation preview helpers", async () => {
  const sdk = await import("@trust-substrate/sdk");

  strictEqual(typeof sdk.previewOnchainReviewerWeight, "function");
  strictEqual(sdk.ONCHAIN_REPUTATION_MAX_REVIEWER_WEIGHT, 8);
  strictEqual(
    sdk.ONCHAIN_REPUTATION_STAKE_WEIGHT_UNIT_LAMPORTS,
    1_000_000_000n,
  );
});
