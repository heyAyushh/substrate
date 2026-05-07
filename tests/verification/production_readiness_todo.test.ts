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
const ARCHITECTURE_DOC = readFileSync(
  join(REPO_ROOT, "docs", "architecture.md"),
  "utf8",
);
const AGENT_SKILL_DOC = readFileSync(
  join(REPO_ROOT, "docs", "agent-skill.md"),
  "utf8",
);
const DEPLOYMENT_READINESS_DOC = readFileSync(
  join(REPO_ROOT, "docs", "deployment-readiness.md"),
  "utf8",
);

const normalizeText = (text) => text.replace(/\s+/g, " ").trim();

const REQUIRED_READINESS_GAPS = [
  "SPL token stake vaults exist, but production mint allowlists, token valuation policy, and Token-2022 extension handling are not finalized yet.",
  "Light Protocol ZK Compression is not integrated yet.",
  "The TypeScript SDK is deterministic helper logic, not a production RPC client.",
  "The indexer is local and durable, not a networked event pipeline.",
  "Multi-hop handoff proofs are not fully modeled yet.",
  "Richer sequence ordering rules across tasks and domains need more tests before production use.",
  "Slashing policy is configured-authority or adjudicator-verdict driven in v1.",
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

test("deployment docs separate Trust Substrate skill from QEDgen", () => {
  const skillFile = readFileSync(
    join(REPO_ROOT, "skills", "trust-substrate", "SKILL.md"),
    "utf8",
  );

  ok(
    DEPLOYMENT_READINESS_DOC.includes("Surfpool/local Solana"),
    "deployment docs must name Surfpool/local Solana as the current target",
  );
  ok(
    DEPLOYMENT_READINESS_DOC.includes("SOL/lamports"),
    "deployment docs must state the current SOL stake boundary",
  );
  ok(
    DEPLOYMENT_READINESS_DOC.includes(
      "Add production SPL token mint allowlists",
    ),
    "deployment docs must keep SPL token policy as upcoming work",
  );
  ok(
    normalizeText(AGENT_SKILL_DOC).includes("separate from QEDgen"),
    "agent skill docs must not confuse Trust Substrate skill with QEDgen",
  );
  ok(
    skillFile.includes("Choose one allowed action"),
    "the agent skill must require the agent to choose from allowed actions",
  );
});

test("docs preserve the protocol and example integration boundary", () => {
  ok(
    README_DOC.includes("## Example Integrations"),
    "README must explain that demos are example integrations",
  );
  ok(
    normalizeText(ARCHITECTURE_DOC).includes(
      "Applications are adapters over the protocol",
    ),
    "architecture docs must keep applications as adapters over protocol state",
  );
  ok(
    normalizeText(AGENT_SKILL_DOC).includes("Both demos must stay clients"),
    "agent skill docs must keep Pi Console and Society as clients",
  );
  ok(
    DEPLOYMENT_READINESS_DOC.includes("Example-specific rules"),
    "deployment docs must keep example-specific rules out of the core protocol",
  );
});

test("SDK source does not depend on example integration code", () => {
  const sdkClient = readFileSync(
    join(REPO_ROOT, "packages", "sdk", "src", "onchain-client.ts"),
    "utf8",
  );

  ok(
    !sdkClient.includes("examples/"),
    "SDK must not import code from examples",
  );
  ok(
    !sdkClient.includes("examples/multi_agent"),
    "SDK must not depend on the Society example implementation",
  );
});
