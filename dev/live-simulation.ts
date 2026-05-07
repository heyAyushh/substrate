import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import type { DashboardSnapshot } from "../src/lib/dashboard.ts";

const LOCAL_SIMULATION_ARGS = [
  "--experimental-strip-types",
  "examples/multi_agent/run.ts",
] as const;
const DEFAULT_EXEC_BUFFER_BYTES = 10 * 1024 * 1024;

const execFilePromise = promisify(execFile);

export interface LiveSimulationResult {
  runId: string;
  startedAt: number;
  completedAt: number;
  snapshot: DashboardSnapshot;
}

export interface ExecuteLocalSimulationOptions {
  workspaceRoot: string;
  liveSnapshotPath: string;
  execFileFn?: ExecuteSimulationCommand;
}

interface ExecuteCommandOptions {
  cwd: string;
  maxBuffer: number;
}

export type ExecuteSimulationCommand = (
  command: string,
  args: readonly string[],
  options: ExecuteCommandOptions,
) => Promise<{
  stdout: string;
  stderr: string;
}>;

export class LiveSimulationAlreadyRunningError extends Error {
  constructor() {
    super("A live simulation is already running");
    this.name = "LiveSimulationAlreadyRunningError";
  }
}

export class LiveSimulationOutputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LiveSimulationOutputError";
  }
}

export function createLiveSimulationController(options: {
  executeSimulation: () => Promise<DashboardSnapshot>;
  createRunId?: () => string;
  now?: () => number;
}) {
  const createRunId = options.createRunId ?? randomUUID;
  const now = options.now ?? Date.now;
  let activeRun: Promise<LiveSimulationResult> | null = null;

  return {
    isRunning() {
      return activeRun !== null;
    },
    async run(): Promise<LiveSimulationResult> {
      if (activeRun) {
        throw new LiveSimulationAlreadyRunningError();
      }

      const startedAt = now();
      const runId = createRunId();
      const runPromise = (async () => {
        const snapshot = await options.executeSimulation();

        return {
          runId,
          startedAt,
          completedAt: now(),
          snapshot,
        };
      })();

      activeRun = runPromise.finally(() => {
        activeRun = null;
      });

      return activeRun;
    },
  };
}

export async function executeLocalSimulation(
  options: ExecuteLocalSimulationOptions,
): Promise<DashboardSnapshot> {
  const execSimulationCommand = options.execFileFn ?? defaultExecuteSimulation;
  const { stdout, stderr } = await execSimulationCommand(
    process.execPath,
    LOCAL_SIMULATION_ARGS,
    {
      cwd: options.workspaceRoot,
      maxBuffer: DEFAULT_EXEC_BUFFER_BYTES,
    },
  );

  const snapshot = parseDashboardSnapshotOutput(stdout, stderr);
  await writeJsonAtomically(options.liveSnapshotPath, snapshot);
  return snapshot;
}

export function parseDashboardSnapshotOutput(
  stdout: string,
  stderr = "",
): DashboardSnapshot {
  const trimmedOutput = stdout.trim();
  if (!trimmedOutput) {
    throw new LiveSimulationOutputError(
      "The local simulation did not produce dashboard JSON",
    );
  }

  const directParse = tryParseSnapshot(trimmedOutput);
  if (directParse) {
    return directParse;
  }

  const jsonStart = trimmedOutput.indexOf("{");
  const jsonEnd = trimmedOutput.lastIndexOf("}");
  if (jsonStart >= 0 && jsonEnd > jsonStart) {
    const candidate = trimmedOutput.slice(jsonStart, jsonEnd + 1);
    const extractedParse = tryParseSnapshot(candidate);
    if (extractedParse) {
      return extractedParse;
    }
  }

  const stderrSuffix = stderr.trim() ? ` Stderr: ${stderr.trim()}` : "";
  throw new LiveSimulationOutputError(
    `The local simulation produced invalid dashboard JSON.${stderrSuffix}`,
  );
}

async function defaultExecuteSimulation(
  command: string,
  args: readonly string[],
  options: ExecuteCommandOptions,
) {
  const { stdout, stderr } = await execFilePromise(command, [...args], options);

  return {
    stdout: String(stdout),
    stderr: String(stderr),
  };
}

async function writeJsonAtomically(
  targetPath: string,
  snapshot: DashboardSnapshot,
) {
  await mkdir(path.dirname(targetPath), { recursive: true });

  const temporaryPath = `${targetPath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(
    temporaryPath,
    `${JSON.stringify(snapshot, null, 2)}\n`,
    "utf8",
  );
  await rename(temporaryPath, targetPath);
}

function tryParseSnapshot(value: string): DashboardSnapshot | null {
  try {
    return JSON.parse(value) as DashboardSnapshot;
  } catch {
    return null;
  }
}
