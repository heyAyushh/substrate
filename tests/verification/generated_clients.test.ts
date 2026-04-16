const { deepStrictEqual, ok, strictEqual } = require("node:assert/strict");
const { existsSync, readFileSync, readdirSync } = require("node:fs");
const { join } = require("node:path");
const { test } = require("node:test");

const REPO_ROOT = join(__dirname, "..", "..");
const ROOT_PACKAGE = JSON.parse(
  readFileSync(join(REPO_ROOT, "package.json"), "utf8")
);
const CODAMA_CONFIG_DIR = join(REPO_ROOT, "codama");
const PROGRAM_NAMES = readdirSync(CODAMA_CONFIG_DIR)
  .filter((fileName) => fileName.endsWith(".json"))
  .map((fileName) => fileName.replace(/\.json$/, ""))
  .sort();

test("Codama config set covers the current generated-client surface", () => {
  ok(
    PROGRAM_NAMES.includes("attester_registry"),
    "attester_registry must be part of the generated-client surface"
  );
  ok(
    !PROGRAM_NAMES.includes("dispute_resolver"),
    "dispute_resolver should not be required until it has a Codama config"
  );
});

test("workspace defines Codama generation for every deployable program", () => {
  strictEqual(
    ROOT_PACKAGE.scripts["generate:clients"],
    "pnpm exec node scripts/generate-program-clients.mjs",
    "root package must provide one Codama generation entrypoint"
  );

  const generatorPath = join(
    REPO_ROOT,
    "scripts",
    "generate-program-clients.mjs"
  );
  ok(existsSync(generatorPath), "Codama generator script must exist");

  const generatorSource = readFileSync(generatorPath, "utf8");

  for (const programName of PROGRAM_NAMES) {
    const configPath = join(REPO_ROOT, "codama", `${programName}.json`);
    ok(existsSync(configPath), `${programName} Codama config must exist`);

    const configSource = readFileSync(configPath, "utf8");
    ok(
      configSource.includes(`${programName}.json`),
      `${programName} must be included in Codama generation`
    );
    ok(
      generatorSource.includes(`${programName}.json`),
      `${programName} config must be invoked by the generator script`
    );
  }
});

test("generated client package targets @solana/kit for all programs", () => {
  const packagePath = join(
    REPO_ROOT,
    "packages",
    "program-clients",
    "package.json"
  );

  ok(existsSync(packagePath), "generated client package must exist");

  const programClientPackage = JSON.parse(readFileSync(packagePath, "utf8"));

  ok(
    typeof programClientPackage.dependencies["@solana/kit"] === "string",
    "generated clients must target @solana/kit"
  );
  strictEqual(
    programClientPackage.scripts.generate,
    "pnpm exec node ../../scripts/generate-program-clients.mjs",
    "generated client package must expose regeneration"
  );

  const generatedPrograms = PROGRAM_NAMES.map((programName) =>
    join(
      REPO_ROOT,
      "packages",
      "program-clients",
      "src",
      "generated",
      programName,
      "index.ts"
    )
  );

  deepStrictEqual(
    generatedPrograms.map((generatedPath) => existsSync(generatedPath)),
    PROGRAM_NAMES.map(() => true),
    "every deployable program must have committed generated source"
  );

  for (const generatedPath of generatedPrograms) {
    const programSourcePath = generatedPath.replace(
      "/index.ts",
      `/programs/${camelCaseProgramFile(generatedPath)}.ts`
    );
    const source = readFileSync(programSourcePath, "utf8");
    ok(
      source.includes("@solana/kit"),
      `${programSourcePath} must import @solana/kit`
    );
  }
});

function camelCaseProgramFile(generatedIndexPath) {
  const programFolder = generatedIndexPath.split("/").slice(-2, -1)[0];
  return programFolder.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}
