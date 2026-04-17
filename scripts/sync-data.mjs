import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appRoot = path.resolve(__dirname, "..");
const sourceSnapshotPath = path.resolve(
  appRoot,
  "../multi_agent/.snapshot/dashboard-data.json",
);
const publicDirectoryPath = path.resolve(appRoot, "public");
const targetSnapshotPath = path.resolve(publicDirectoryPath, "dashboard-data.json");

await mkdir(publicDirectoryPath, { recursive: true });
await copyFile(sourceSnapshotPath, targetSnapshotPath);
