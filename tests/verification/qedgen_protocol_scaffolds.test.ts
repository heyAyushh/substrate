const { ok, strictEqual } = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { existsSync, readFileSync } = require("node:fs");
const { join } = require("node:path");
const { test } = require("node:test");

const REPO_ROOT = join(__dirname, "..", "..");
const ANCHOR_TOML = readFileSync(join(REPO_ROOT, "Anchor.toml"), "utf8");
const DEFAULT_QEDGEN_BIN = process.env.HOME
  ? join(process.env.HOME, ".codex", "skills", "solana-skills", "bin", "qedgen")
  : "";
const HIGH_PRIORITY_LIMIT = 2;
const TOKEN_CONTEXT_CPI_ALLOWLIST = new Set([
  "initialize_token_stake",
  "initialize_token_treasury_vault",
]);

function parseProgramsLocalnet(anchorToml) {
  const sectionMatch = anchorToml.match(
    /\[programs\.localnet\]([\s\S]*?)(?:\n\[|$)/,
  );

  if (!sectionMatch) {
    return [];
  }

  return sectionMatch[1]
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.match(/^([a-z_]+)\s*=\s*"([^"]+)"$/))
    .filter(Boolean)
    .map(([, name, programId]) => ({ name, programId }));
}

test("every deployable Anchor program has a committed QEDGen scaffold", () => {
  const programs = parseProgramsLocalnet(ANCHOR_TOML);

  ok(programs.length > 0, "Anchor.toml must declare localnet programs");

  for (const { name, programId } of programs) {
    const qedspecPath = join(REPO_ROOT, "programs", name, `${name}.qedspec`);

    ok(existsSync(qedspecPath), `${name} must ship ${name}.qedspec`);

    const qedspec = readFileSync(qedspecPath, "utf8");

    ok(
      qedspec.includes(`program_id "${programId}"`),
      `${name}.qedspec must pin ${programId}`,
    );
    ok(
      !qedspec.includes('program_id "11111111111111111111111111111111"'),
      `${name}.qedspec must not keep the placeholder program id`,
    );
    ok(
      qedspec.includes("spec "),
      `${name}.qedspec must declare a top-level spec`,
    );
    ok(
      !qedspec.includes("TODO"),
      `${name}.qedspec must not keep placeholder TODO markers`,
    );
  }
});

test("installed qedgen checks every committed scaffold against source", () => {
  const qedgenBin = process.env.QEDGEN_BIN
    ? process.env.QEDGEN_BIN
    : existsSync(DEFAULT_QEDGEN_BIN)
      ? DEFAULT_QEDGEN_BIN
      : null;

  if (!qedgenBin) {
    return;
  }

  const programs = parseProgramsLocalnet(ANCHOR_TOML);

  for (const { name } of programs) {
    const qedspecPath = join(REPO_ROOT, "programs", name, `${name}.qedspec`);

    if (!existsSync(qedspecPath)) {
      continue;
    }

    const result = spawnSync(
      qedgenBin,
      [
        "check",
        "--spec",
        qedspecPath,
        "--anchor-project",
        join(REPO_ROOT, "programs", name),
        "--json",
      ],
      {
        cwd: REPO_ROOT,
        encoding: "utf8",
      },
    );

    const documents = parseJsonDocuments(
      result.stdout,
      `${name} QEDGen output`,
    );
    const coverage =
      documents.find((document) => !Array.isArray(document)) ?? {};
    const findings = documents.flatMap((document) =>
      Array.isArray(document) ? document : (document.findings ?? []),
    );
    const blockingFindings = findings.filter(isBlockingFinding);
    const missingHandlers = filterSyntheticMatchCoverage(
      coverage.handler_coverage ?? [],
    );

    strictEqual(
      missingHandlers.length,
      0,
      `${name}.qedspec must cover every Anchor instruction`,
    );
    strictEqual(
      coverage.effect_coverage?.length ?? 0,
      0,
      `${name}.qedspec effects must match Anchor source mutations`,
    );
    strictEqual(
      blockingFindings.length,
      0,
      `${name}.qedspec has blocking QEDGen findings: ${JSON.stringify(
        blockingFindings,
        null,
        2,
      )}`,
    );
  }
});

function parseJsonDocuments(raw, label) {
  const documents = [];
  let input = raw.trimStart();

  while (input.length > 0) {
    const parsed = parseLeadingJsonDocument(input, label);
    documents.push(parsed.document);
    input = input.slice(parsed.length).trimStart();
  }

  return documents;
}

function filterSyntheticMatchCoverage(handlerCoverage) {
  const syntheticBaseHandlers = new Set();

  for (const finding of handlerCoverage) {
    if (finding.kind !== "SpecHandlerNotInProgram") {
      continue;
    }

    const match = finding.handler?.match(/^(.*)_(?:case_\d+|otherwise)$/);

    if (match) {
      syntheticBaseHandlers.add(match[1]);
    }
  }

  return handlerCoverage.filter((finding) => {
    const syntheticCase = finding.handler?.match(
      /^(.*)_(?:case_\d+|otherwise)$/,
    );

    if (finding.kind === "SpecHandlerNotInProgram" && syntheticCase) {
      return false;
    }

    return !(
      finding.kind === "ProgramInstructionNotInSpec" &&
      syntheticBaseHandlers.has(finding.handler)
    );
  });
}

function parseLeadingJsonDocument(input, label) {
  const opening = input.at(0);
  const closing = opening === "{" ? "}" : opening === "[" ? "]" : null;

  if (!closing) {
    throw new Error(`Unable to find JSON in ${label}: ${input}`);
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
    } else if (char === opening) {
      depth += 1;
    } else if (char === closing) {
      depth -= 1;

      if (depth === 0) {
        return {
          document: JSON.parse(input.slice(0, index + 1)),
          length: index + 1,
        };
      }
    }
  }

  throw new Error(`Unable to parse JSON in ${label}: ${input}`);
}

function isBlockingFinding(finding) {
  if (
    finding.rule === "missing_cpi_for_token_context" &&
    TOKEN_CONTEXT_CPI_ALLOWLIST.has(finding.subject)
  ) {
    return false;
  }

  return finding.priority <= HIGH_PRIORITY_LIMIT && finding.severity !== "info";
}
