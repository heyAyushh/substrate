#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdtempSync, readFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, "..");
const ANCHOR_TOML = join(REPO_ROOT, "Anchor.toml");
const PROOF_VERIFIER_PROGRAM = "proof_verifier";
const SEMANTIC_SPECS = new Set([PROOF_VERIFIER_PROGRAM]);
const HIGH_PRIORITY_LIMIT = 2;
const MAX_BUFFER_BYTES = 64 * 1024 * 1024;
const SANDBOX_PREFIX = "trust-substrate-qedgen-e2e-";
const GENERATED_VERIFY_FAILURE_FLAG = "--allow-generated-verify-failure";
const ALLOW_GENERATED_VERIFY_FAILURE =
  process.argv.includes(GENERATED_VERIFY_FAILURE_FLAG) ||
  process.env.QEDGEN_ALLOW_GENERATED_VERIFY_FAILURE === "1";
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
const KNOWN_GENERATED_COMPILE_MARKERS = [
  "cannot find value `identity` in this scope",
  "cannot find value `checkpoint_importer` in this scope",
  "cannot find value `receipt` in this scope",
  "cannot find type `ProofVerifierAccount` in this scope",
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
  checkProofVerifierDrift(qedgenBin);
  const sandbox = generateProofVerifierArtifacts(qedgenBin);
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

    const result = run(qedgenBin, ["check", "--spec", specPath, "--json"]);
    const findings = parseJson(result.stdout, `${name} qedgen check output`);
    const highPriorityFindings = findings.filter(
      (finding) => finding.priority <= HIGH_PRIORITY_LIMIT,
    );
    const label = SEMANTIC_SPECS.has(name) ? "semantic" : "scaffold";

    console.log(
      `  ${name}: parsed (${label}, P1/P2 findings: ${highPriorityFindings.length})`,
    );

    if (SEMANTIC_SPECS.has(name) && highPriorityFindings.length > 0) {
      throw new Error(
        `${name}.qedspec has high-priority QEDGen findings:\n${formatFindings(
          highPriorityFindings,
        )}`,
      );
    }
  }
}

function checkProofVerifierDrift(qedgenBin) {
  console.log("\n[2/4] Checking proof_verifier spec against Anchor source");

  const result = run(qedgenBin, [
    "check",
    "--spec",
    specPathFor(PROOF_VERIFIER_PROGRAM),
    "--anchor-project",
    join(REPO_ROOT, "programs", PROOF_VERIFIER_PROGRAM),
    "--json",
  ]);
  const coverage = parseFirstJsonDocument(
    result.stdout,
    "proof_verifier coverage output",
  );
  const missingHandlers = coverage.handler_coverage ?? [];
  const missingEffects = coverage.effect_coverage ?? [];

  if (missingHandlers.length > 0 || missingEffects.length > 0) {
    throw new Error(
      `proof_verifier.qedspec drifted from source:\n${JSON.stringify(
        coverage,
        null,
        2,
      )}`,
    );
  }

  console.log("  proof_verifier: no missing handlers or effects");
}

function generateProofVerifierArtifacts(qedgenBin) {
  console.log("\n[3/4] Generating proof_verifier artifacts in a sandbox");

  const sandbox = mkdtempSync(join(tmpdir(), SANDBOX_PREFIX));
  copyFileSync(
    specPathFor(PROOF_VERIFIER_PROGRAM),
    join(sandbox, `${PROOF_VERIFIER_PROGRAM}.qedspec`),
  );
  run("git", ["init", "--quiet"], { cwd: sandbox });
  run(
    qedgenBin,
    [
      "init",
      "--name",
      PROOF_VERIFIER_PROGRAM,
      "--spec",
      `${PROOF_VERIFIER_PROGRAM}.qedspec`,
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
      `${PROOF_VERIFIER_PROGRAM}.qedspec`,
      "--target",
      "anchor",
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
      `${PROOF_VERIFIER_PROGRAM}.qedspec`,
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
  const generatedCompileOutput = captureGeneratedCompileOutput(sandbox);
  const isKnownGeneratedCompileFailure = KNOWN_GENERATED_COMPILE_MARKERS.some(
    (marker) => generatedCompileOutput.includes(marker),
  );

  if (ALLOW_GENERATED_VERIFY_FAILURE && isKnownGeneratedCompileFailure) {
    console.log(
      "  qedgen verify: blocked by known generated Anchor scaffold compile failure",
    );
    console.log(`  sandbox kept for inspection: ${sandbox}`);
    console.log(
      "  use strict mode without --allow-generated-verify-failure to make this red",
    );
    return;
  }

  throw new Error(
    [
      "qedgen verify failed.",
      `Sandbox: ${sandbox}`,
      JSON.stringify(backendSummary, null, 2),
      generatedCompileOutput,
    ].join("\n\n"),
  );
}

function captureGeneratedCompileOutput(sandbox) {
  const generatedProgram = join(sandbox, "generated", "program");
  const result = spawnSync(
    "cargo",
    ["test", "--test", "proptest", "--release", "--no-run"],
    {
      cwd: generatedProgram,
      encoding: "utf8",
      maxBuffer: MAX_BUFFER_BYTES,
    },
  );

  return `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
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

function parseFirstJsonDocument(raw, label) {
  const input = raw.trimStart();
  const opening = input.at(0);
  const closing = opening === "{" ? "}" : opening === "[" ? "]" : null;

  if (!closing) {
    throw new Error(`Unable to find a JSON document in ${label}:\n${raw}`);
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
        return parseJson(input.slice(0, index + 1), label);
      }
    }
  }

  throw new Error(`Unable to parse first JSON document from ${label}:\n${raw}`);
}

function formatFindings(findings) {
  return findings
    .map(
      (finding) =>
        `- P${finding.priority} ${finding.rule} ${finding.subject}: ${finding.message}`,
    )
    .join("\n");
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
