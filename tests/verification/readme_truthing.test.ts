import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { ok } from "node:assert/strict";

const REPO_ROOT = join(import.meta.dirname, "..", "..");
const README = readFileSync(join(REPO_ROOT, "README.md"), "utf8");

test("README keeps the current slashing and replay guarantees explicit", () => {
  ok(
    README.includes("Slashing is not automatic."),
    "README must say slashing is not automatic"
  );
  ok(
    README.includes("A slash requires a dispute outcome"),
    "README must say slashing depends on a dispute outcome"
  );
  ok(
    README.includes("SDK-enforced at submit time"),
    "README must distinguish SDK submit-time checks"
  );
  ok(
    README.includes("consumers must re-verify them during replay"),
    "README must require replay-time verification"
  );
});
