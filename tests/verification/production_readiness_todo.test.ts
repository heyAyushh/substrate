const { ok } = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { test } = require("node:test");

const REPO_ROOT = join(__dirname, "..", "..");
const SECURITY_DOC = readFileSync(
  join(REPO_ROOT, "docs", "security.md"),
  "utf8",
);
const READINESS_TODO_DOC = readFileSync(
  join(REPO_ROOT, "docs", "production-readiness.md"),
  "utf8",
);
const README_DOC = readFileSync(join(REPO_ROOT, "README.md"), "utf8");
const ROADMAP_DOC = readFileSync(join(REPO_ROOT, "docs", "roadmap.md"), "utf8");

const normalizeText = (text) => text.replace(/\s+/g, " ").trim();

const REQUIRED_READINESS_GAPS = [
  "Light Protocol ZK Compression is not integrated yet.",
  "The TypeScript SDK is deterministic helper logic, not a production RPC client.",
  "The indexer is local and durable, not a networked event pipeline.",
  "Multi-hop handoff proofs are not fully modeled yet.",
  "Richer sequence ordering rules across tasks and domains need more tests before production use.",
  "Slashing policy is authority-driven in v1.",
];

test("production readiness todo tracks every known security gap", () => {
  const securityDoc = normalizeText(SECURITY_DOC);
  const readinessTodoDoc = normalizeText(READINESS_TODO_DOC);

  for (const gap of REQUIRED_READINESS_GAPS) {
    ok(securityDoc.includes(gap), `security.md must document: ${gap}`);
    ok(
      readinessTodoDoc.includes(gap),
      `production-readiness.md must track: ${gap}`,
    );
  }
});

test("project entry points link the production readiness todo", () => {
  const readinessTodoPath = "docs/production-readiness.md";

  ok(README_DOC.includes(readinessTodoPath), "README must link the todo");
  ok(ROADMAP_DOC.includes(readinessTodoPath), "roadmap must link the todo");
});
