import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { deepStrictEqual, ok, strictEqual } from "node:assert/strict";

const REPO_ROOT = join(import.meta.dirname, "..", "..");
const PLAN = readFileSync(
  join(REPO_ROOT, "docs", "plans", "hardening-plan.md"),
  "utf8"
);
const FINDING_ROW_PATTERN =
  /^\| #(?<finding>\d+) \| (?<title>[^|]+) \| (?<wave>[^|]+) \|$/gm;
const REQUIRED_WAVES = ["W0", "W1", "W2", "W3", "W4", "W5", "W6", "W7", "W8"];

const findingRows = [...PLAN.matchAll(FINDING_ROW_PATTERN)].map((match) => ({
  finding: Number(match.groups?.finding),
  title: match.groups?.title.trim() ?? "",
  wave: match.groups?.wave.trim() ?? "",
}));

test("hardening plan maps every audit finding exactly once", () => {
  const findingNumbers = findingRows
    .map((row) => row.finding)
    .sort((left, right) => left - right);

  strictEqual(findingRows.length, 23);
  deepStrictEqual(
    findingNumbers,
    Array.from({ length: 23 }, (_, index) => index + 1)
  );
});

test("hardening plan keeps W0 as the prerequisite wave", () => {
  ok(PLAN.includes("W0 — Protocol hygiene (prereq for everything)"));
  ok(PLAN.includes("W0 is a prerequisite for everything"));
});

test("hardening plan maps findings to concrete waves", () => {
  for (const wave of REQUIRED_WAVES) {
    ok(PLAN.includes(`## ${wave}`), `${wave} section missing`);
  }

  for (const row of findingRows) {
    ok(row.title.length > 0, `finding #${row.finding} title missing`);
    ok(/[WN]\d/.test(row.wave), `finding #${row.finding} wave missing`);
  }
});
