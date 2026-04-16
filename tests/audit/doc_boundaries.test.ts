import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { ok, strictEqual } from "node:assert/strict";

const REPO_ROOT = join(import.meta.dirname, "..", "..");

const architecture = readFileSync(
  join(REPO_ROOT, "docs", "architecture.md"),
  "utf8"
);
const programs = readFileSync(join(REPO_ROOT, "docs", "programs.md"), "utf8");
const offChainStorage = readFileSync(
  join(REPO_ROOT, "docs", "off-chain-storage.md"),
  "utf8"
);
const security = readFileSync(join(REPO_ROOT, "docs", "security.md"), "utf8");
const threatModel = readFileSync(
  join(REPO_ROOT, "docs", "threat-model.md"),
  "utf8"
);

const FINDING_ROW_PATTERN = /^\| #(?<finding>\d+) \| (?<title>[^|]+) \| (?<workstreams>[^|]+) \|$/gm;

test("core docs distinguish on-chain, sdk, and indexer guarantees", () => {
  ok(architecture.includes("[on-chain]"));
  ok(architecture.includes("[sdk]"));
  ok(architecture.includes("[indexer]"));

  ok(
    programs.includes(
      "Unless noted otherwise, every account, instruction signature, and behavior guarantee in this document is [on-chain]."
    )
  );

  ok(offChainStorage.includes("[on-chain]"));
  ok(offChainStorage.includes("[sdk]"));
  ok(offChainStorage.includes("[indexer]"));

  ok(security.includes("[on-chain]"));
  ok(security.includes("[sdk]"));
  ok(security.includes("[indexer]"));
});

test("threat model maps all 23 findings to workstreams", () => {
  const rows = [...threatModel.matchAll(FINDING_ROW_PATTERN)];

  strictEqual(rows.length, 23);
  for (const row of rows) {
    ok((row.groups?.title ?? "").trim().length > 0);
    ok((row.groups?.workstreams ?? "").trim().length > 0);
  }
});
