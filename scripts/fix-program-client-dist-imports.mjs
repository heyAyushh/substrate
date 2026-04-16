import {
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const DIST_ROOT = join(
  HERE,
  "..",
  "packages",
  "program-clients",
  "dist",
  "generated"
);

rewriteRelativeSpecifiers(DIST_ROOT);

function rewriteRelativeSpecifiers(rootDir) {
  for (const entry of readdirSync(rootDir, { withFileTypes: true })) {
    const entryPath = join(rootDir, entry.name);

    if (entry.isDirectory()) {
      rewriteRelativeSpecifiers(entryPath);
      continue;
    }

    if (!entry.isFile() || !isSupportedFile(entry.name)) {
      continue;
    }

    const original = readFileSync(entryPath, "utf8");
    const rewritten = original.replace(
      /((?:import|export)\s+(?:type\s+)?(?:[^'"]+?\s+from\s+)?)(["'])(\.[^"'?]+)\2/g,
      (fullMatch, prefix, quote, specifier) => {
        const nextSpecifier = resolveDistSpecifier(entryPath, specifier);
        return nextSpecifier === specifier
          ? fullMatch
          : `${prefix}${quote}${nextSpecifier}${quote}`;
      }
    );

    if (rewritten !== original) {
      writeFileSync(entryPath, rewritten);
    }
  }
}

function isSupportedFile(fileName) {
  return fileName.endsWith(".js") || fileName.endsWith(".d.ts");
}

function resolveDistSpecifier(sourcePath, specifier) {
  if (!specifier.startsWith(".") || /\.[cm]?[jt]s$/.test(specifier)) {
    return specifier;
  }

  const resolved = join(dirname(sourcePath), specifier);

  if (existsSync(resolved) && statSync(resolved).isDirectory()) {
    return `${specifier}/index.js`;
  }

  if (existsSync(`${resolved}.js`) || existsSync(`${resolved}.d.ts`)) {
    return `${specifier}.js`;
  }

  return specifier;
}
