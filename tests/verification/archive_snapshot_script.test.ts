import test from "node:test";
import { mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { ok, strictEqual } from "node:assert/strict";

test("snapshot script archives and prunes local indexer snapshots", () => {
  const workspace = process.cwd();
  const tmp = mkdtempSync(join(tmpdir(), "trust-substrate-archive-"));
  const source = join(tmp, "indexer.json");
  const archive = join(tmp, "archive");

  writeFileSync(source, JSON.stringify({ version: 1, receipts: [] }), "utf8");

  for (let index = 0; index < 3; index += 1) {
    execFileSync("bash", [join(workspace, "scripts", "snapshot.sh")], {
      cwd: workspace,
      env: {
        ...process.env,
        TRUST_SUBSTRATE_SNAPSHOT_SOURCE: source,
        TRUST_SUBSTRATE_ARCHIVE_DIR: archive,
        TRUST_SUBSTRATE_ARCHIVE_RETENTION: "2",
      },
      stdio: "pipe",
    });
  }

  const archived = readdirSync(archive).filter((entry) =>
    entry.endsWith(".json"),
  );

  strictEqual(archived.length, 2);
  ok(archived.every((entry) => entry.startsWith("indexer-")));
});
