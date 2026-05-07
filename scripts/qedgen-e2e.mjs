#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import {
  appendFileSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, "..");
const ANCHOR_TOML = join(REPO_ROOT, "Anchor.toml");
const GENERATED_BACKEND_SMOKE_SPEC = "generated_backend_smoke";
const HIGH_PRIORITY_LIMIT = 2;
const MAX_BUFFER_BYTES = 64 * 1024 * 1024;
const SANDBOX_PREFIX = "trust-substrate-qedgen-e2e-";
const EXPECTED_GENERATED_ARTIFACTS = [
  "generated/program/Cargo.toml",
  "generated/program/src/lib.rs",
  "generated/program/src/guards.rs",
  "generated/program/src/tests.rs",
  "generated/program/tests/kani.rs",
  "generated/program/tests/proptest.rs",
  "generated/formal_verification/Spec.lean",
  "generated/formal_verification/Proofs.lean",
];
const GENERATED_BACKEND_DEV_DEPENDENCIES = `
[dev-dependencies]
proptest = "1"
`;
const GENERATED_BACKEND_SMOKE_SPEC_TEXT = `spec GeneratedBackendSmoke

program_id "11111111111111111111111111111111"

type Error
  | InvalidLifecycle

type Counter
  | Uninitialized
  | Active of {
      value : U64,
      bump  : U8,
    }

pda counter ["counter", authority]

handler initialize : Counter.Uninitialized -> Counter.Active {
  auth authority
  effect {
    value := 0
  }
  accounts {
    authority : signer, writable
    counter : writable, pda [counter]
    system_program : program
  }
}

handler increment : Counter.Active -> Counter.Active {
  auth authority
  effect {
    value +=! 1
  }
  accounts {
    authority : signer, writable
    counter : writable, pda [counter]
  }
}
`;
const PLACEHOLDER_SPEC_PATTERN =
  /\b(?:todo|tbd|fixme|placeholder|stub|not implemented)\b/i;
const TOKEN_CONTEXT_CPI_ALLOWLIST = new Set([
  "initialize_token_stake",
  "initialize_token_treasury_vault",
]);
const NON_CLOSING_HANDLERS = [
  "apply_reputation_receipt",
  "sync_task_status",
  "finalize_unstake",
  "finalize_unstake_token",
  "slash_with_verdict",
  "slash_token_with_verdict",
];
const SEMANTIC_SPEC_GUARDS = [
  {
    pattern: /\brequires\s+receipt\s*==\s*receipt\b/,
    message: "contains tautological receipt replay guard",
  },
  {
    pattern: /\brequires\s+last_sequence\s*>=\s*last_sequence\b/,
    message: "contains tautological sequence regression guard",
  },
  {
    pattern: /\blast_applied_slot\s*:=\s*1\b/,
    message: "models last_applied_slot as a constant placeholder",
  },
  {
    pattern: /\bunstake_unlocks_at\s*:=\s*1\b/,
    message: "models unstake cooldown as a constant placeholder",
  },
  {
    pattern:
      /handler\s+finalize_unstake\b[^{]*\{(?:(?!\nhandler\s)[\s\S])*?transfers\s*\{(?:(?!\nhandler\s)[\s\S])*?from\s+vault\s+to\s+owner_token_account/,
    message: "models lamport finalize_unstake as an SPL token transfer",
  },
];

function main() {
  const qedgenBin = findQEDGenBinary();
  const programs = parseLocalnetPrograms(readFileSync(ANCHOR_TOML, "utf8"));

  if (programs.length === 0) {
    throw new Error("Anchor.toml does not declare any localnet programs.");
  }

  console.log(`QEDGen: ${qedgenBin}`);
  console.log(`Programs: ${programs.map(({ name }) => name).join(", ")}`);

  checkAllSpecs(qedgenBin, programs);
  checkProgramDrift(qedgenBin, programs);
  const sandbox = generateBackendSmokeArtifacts(qedgenBin);
  verifyGeneratedArtifacts(qedgenBin, sandbox);
}

function findQEDGenBinary() {
  const candidates = [
    process.env.QEDGEN_BIN,
    join(homedir(), ".agents", "skills", "qedgen", "tools", "qedgen"),
    join(homedir(), ".codex", "skills", "solana-skills", "bin", "qedgen"),
  ].filter(Boolean);

  const found = candidates.find((candidate) => existsSync(candidate));

  if (!found) {
    throw new Error(
      `Unable to find qedgen. Set QEDGEN_BIN or install the QEDGen skill. Checked: ${candidates.join(
        ", ",
      )}`,
    );
  }

  return found;
}

function parseLocalnetPrograms(anchorToml) {
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

function checkAllSpecs(qedgenBin, programs) {
  console.log("\n[1/4] Checking committed QEDGen specs");

  for (const { name, programId } of programs) {
    const specPath = specPathFor(name);

    if (!existsSync(specPath)) {
      throw new Error(`${name} is missing ${specPath}`);
    }

    const spec = readFileSync(specPath, "utf8");

    if (!spec.includes(`program_id "${programId}"`)) {
      throw new Error(`${name}.qedspec does not pin ${programId}`);
    }

    if (PLACEHOLDER_SPEC_PATTERN.test(spec)) {
      throw new Error(`${name}.qedspec still contains placeholder markers`);
    }

    checkSpecSemantics(name, spec);

    const result = run(qedgenBin, ["check", "--spec", specPath, "--json"]);
    const findings = parseQEDGenFindings(
      result.stdout,
      `${name} qedgen check output`,
    );
    const highPriorityFindings = findings.filter((finding) =>
      isBlockingFinding(finding),
    );

    console.log(
      `  ${name}: parsed (P1/P2 findings: ${highPriorityFindings.length})`,
    );

    if (highPriorityFindings.length > 0) {
      throw new Error(
        `${name}.qedspec has high-priority QEDGen findings:\n${formatFindings(
          highPriorityFindings,
        )}`,
      );
    }
  }
}

function checkSpecSemantics(name, spec) {
  for (const handlerName of NON_CLOSING_HANDLERS) {
    const closesAccount = new RegExp(
      `handler\\s+${handlerName}\\b[^\\n]*:\\s*State\\.Active\\s*->\\s*State\\.Closed`,
    ).test(spec);

    if (closesAccount) {
      throw new Error(
        `${name}.qedspec models ${handlerName} as account-closing, but the program keeps that state active`,
      );
    }
  }

  for (const guard of SEMANTIC_SPEC_GUARDS) {
    if (guard.pattern.test(spec)) {
      throw new Error(`${name}.qedspec ${guard.message}`);
    }
  }
}

function checkProgramDrift(qedgenBin, programs) {
  console.log("\n[2/4] Checking every spec against Anchor source");

  for (const { name } of programs) {
    const result = run(
      qedgenBin,
      [
        "check",
        "--spec",
        specPathFor(name),
        "--anchor-project",
        join(REPO_ROOT, "programs", name),
        "--json",
      ],
      { allowFailure: true },
    );
    const documents = parseJsonDocuments(
      result.stdout,
      `${name} coverage output`,
    );
    const coverage =
      documents.find((document) => !Array.isArray(document)) ?? {};
    const findings = documents.flatMap((document) =>
      Array.isArray(document) ? document : (document.findings ?? []),
    );
    const missingHandlers = filterSyntheticMatchCoverage(
      coverage.handler_coverage ?? [],
    );
    const missingEffects = coverage.effect_coverage ?? [];
    const highPriorityFindings = findings.filter((finding) =>
      isBlockingFinding(finding),
    );

    if (
      missingHandlers.length > 0 ||
      missingEffects.length > 0 ||
      highPriorityFindings.length > 0
    ) {
      throw new Error(
        `${name}.qedspec drifted from source:\n${JSON.stringify(
          {
            handler_coverage: missingHandlers,
            effect_coverage: missingEffects,
            high_priority_findings: highPriorityFindings,
          },
          null,
          2,
        )}`,
      );
    }

    console.log(`  ${name}: no missing handlers/effects or P1/P2 findings`);
  }
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

function generateBackendSmokeArtifacts(qedgenBin) {
  console.log("\n[3/4] Generating QEDGen backend smoke artifacts in a sandbox");

  const sandbox = mkdtempSync(join(tmpdir(), SANDBOX_PREFIX));
  writeFileSync(
    join(sandbox, `${GENERATED_BACKEND_SMOKE_SPEC}.qedspec`),
    GENERATED_BACKEND_SMOKE_SPEC_TEXT,
  );
  run("git", ["init", "--quiet"], { cwd: sandbox });
  run(
    qedgenBin,
    [
      "init",
      "--name",
      GENERATED_BACKEND_SMOKE_SPEC,
      "--spec",
      `${GENERATED_BACKEND_SMOKE_SPEC}.qedspec`,
      "--output-dir",
      "formal_verification",
    ],
    { cwd: sandbox },
  );
  run(
    qedgenBin,
    [
      "codegen",
      "--spec",
      `${GENERATED_BACKEND_SMOKE_SPEC}.qedspec`,
      "--target",
      "quasar",
      "--output-dir",
      "generated/program",
      "--lean",
      "--lean-output",
      "generated/formal_verification/Spec.lean",
      "--proptest",
      "--proptest-output",
      "generated/program/tests/proptest.rs",
      "--kani",
      "--kani-output",
      "generated/program/tests/kani.rs",
      "--test",
      "--test-output",
      "generated/program/src/tests.rs",
    ],
    { cwd: sandbox },
  );
  appendFileSync(
    join(sandbox, "generated", "program", "Cargo.toml"),
    GENERATED_BACKEND_DEV_DEPENDENCIES,
  );

  for (const artifact of EXPECTED_GENERATED_ARTIFACTS) {
    if (!existsSync(join(sandbox, artifact))) {
      throw new Error(`QEDGen did not create ${artifact} in ${sandbox}`);
    }
  }

  console.log(`  generated artifacts: ${sandbox}`);
  return sandbox;
}

function verifyGeneratedArtifacts(qedgenBin, sandbox) {
  console.log("\n[4/4] Running QEDGen generated backend verification");

  const verifyResult = run(
    qedgenBin,
    [
      "verify",
      "--spec",
      `${GENERATED_BACKEND_SMOKE_SPEC}.qedspec`,
      "--proptest-path",
      "generated/program/tests/proptest.rs",
      "--kani-path",
      "generated/program/tests/kani.rs",
      "--lean-dir",
      "generated/formal_verification",
      "--json",
    ],
    { cwd: sandbox, allowFailure: true },
  );

  if (verifyResult.status === 0) {
    console.log("  qedgen verify: passed");
    return;
  }

  const backendSummary = parseJson(verifyResult.stdout, "qedgen verify output");

  throw new Error(
    [
      "qedgen verify failed.",
      `Sandbox: ${sandbox}`,
      JSON.stringify(backendSummary, null, 2),
    ].join("\n\n"),
  );
}

function specPathFor(name) {
  return join(REPO_ROOT, "programs", name, `${name}.qedspec`);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? REPO_ROOT,
    encoding: "utf8",
    maxBuffer: MAX_BUFFER_BYTES,
  });

  if (!options.allowFailure && result.status !== 0) {
    throw new Error(
      [
        `Command failed: ${command} ${args.join(" ")}`,
        `cwd: ${options.cwd ?? REPO_ROOT}`,
        result.stdout,
        result.stderr,
      ].join("\n"),
    );
  }

  return result;
}

function parseJson(raw, label) {
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`Unable to parse ${label} as JSON:\n${raw}`, {
      cause: error,
    });
  }
}

function parseQEDGenFindings(raw, label) {
  return parseJsonDocuments(raw, label).flatMap((document) =>
    Array.isArray(document) ? document : (document.findings ?? []),
  );
}

function parseJsonDocuments(raw, label) {
  const documents = [];
  let input = raw.trimStart();

  while (input.length > 0) {
    const parsed = parseLeadingJsonDocument(input, label);
    documents.push(parsed.document);
    input = input.slice(parsed.length).trimStart();
  }

  if (documents.length === 0) {
    throw new Error(`Unable to find a JSON document in ${label}:\n${raw}`);
  }

  return documents;
}

function parseLeadingJsonDocument(input, label) {
  const opening = input.at(0);
  const closing = opening === "{" ? "}" : opening === "[" ? "]" : null;

  if (!closing) {
    throw new Error(`Unable to find a JSON document in ${label}:\n${input}`);
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
          document: parseJson(input.slice(0, index + 1), label),
          length: index + 1,
        };
      }
    }
  }

  throw new Error(`Unable to parse JSON document from ${label}:\n${input}`);
}

function formatFindings(findings) {
  return findings
    .map(
      (finding) =>
        `- P${finding.priority} ${finding.rule} ${finding.subject}: ${finding.message}`,
    )
    .join("\n");
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

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
