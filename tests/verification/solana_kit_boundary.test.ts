import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import test from "node:test";
import { deepEqual, ok, strictEqual } from "node:assert/strict";

const REPO_ROOT = process.cwd();
const SOLANA_KIT_VERSION = "6.9.0";
const WEB3_PACKAGE = "@solana/web3.js";
const ANCHOR_WEB3_PATTERN = "anchor.web3";

const IGNORED_DIRS = new Set([
  ".git",
  ".cache",
  "node_modules",
  "target",
  "dist",
  "dist-tests",
  "out",
  "output",
]);

const SOURCE_ROOTS = ["packages", "examples", "scripts", "skills"];
const SOURCE_EXTENSIONS = new Set([".js", ".mjs", ".cjs", ".ts", ".tsx"]);

const REQUIRED_KIT_DEPENDENCIES: Array<{
  path: string;
  section: "dependencies" | "devDependencies";
}> = [
  { path: "package.json", section: "devDependencies" },
  { path: "packages/sdk/package.json", section: "dependencies" },
  { path: "packages/program-clients/package.json", section: "dependencies" },
  { path: "packages/pi-extension/package.json", section: "dependencies" },
  { path: "examples/pi-console/package.json", section: "dependencies" },
];

function readJson(path: string) {
  return JSON.parse(readFileSync(join(REPO_ROOT, path), "utf8"));
}

function walkFiles(dir: string, files: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (IGNORED_DIRS.has(entry.name)) {
      continue;
    }

    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(path, files);
      continue;
    }

    if (entry.isFile()) {
      files.push(path);
    }
  }

  return files;
}

function extension(path: string) {
  const match = path.match(/\.[^.]+$/);
  return match?.[0] ?? "";
}

function workspacePackageJsonFiles() {
  return walkFiles(REPO_ROOT).filter(
    (path) => path.endsWith("package.json") && statSync(path).isFile(),
  );
}

test("workspace packages do not directly depend on web3.js", () => {
  const offenders: string[] = [];

  for (const packageJsonPath of workspacePackageJsonFiles()) {
    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
    for (const section of [
      "dependencies",
      "devDependencies",
      "peerDependencies",
      "optionalDependencies",
    ]) {
      if (packageJson[section]?.[WEB3_PACKAGE]) {
        offenders.push(`${relative(REPO_ROOT, packageJsonPath)}#${section}`);
      }
    }
  }

  deepEqual(offenders, []);
});

test("production Solana clients are pinned to Anza Kit", () => {
  for (const dependency of REQUIRED_KIT_DEPENDENCIES) {
    const packageJson = readJson(dependency.path);
    strictEqual(
      packageJson[dependency.section]?.["@solana/kit"],
      SOLANA_KIT_VERSION,
      `${dependency.path} must use @solana/kit ${SOLANA_KIT_VERSION}`,
    );
  }
});

test("web3.js and Anchor web3 compatibility stay out of product code", () => {
  const offenders: string[] = [];

  for (const root of SOURCE_ROOTS) {
    const absoluteRoot = join(REPO_ROOT, root);
    for (const file of walkFiles(absoluteRoot)) {
      if (!SOURCE_EXTENSIONS.has(extension(file))) {
        continue;
      }

      const source = readFileSync(file, "utf8");
      if (
        source.includes(WEB3_PACKAGE) ||
        source.includes(ANCHOR_WEB3_PATTERN)
      ) {
        offenders.push(relative(REPO_ROOT, file));
      }
    }
  }

  ok(
    offenders.length === 0,
    `Kit boundary violation in product code: ${offenders.join(", ")}`,
  );
});
