import test from "node:test";
import { once } from "node:events";
import { strictEqual, ok } from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createServer as createNetServer, type AddressInfo } from "node:net";

const SERVER_START_TIMEOUT_MS = 60_000;
const SERVER_POLL_INTERVAL_MS = 250;
const PUBLIC_SOCIETY_URL = "https://society.example.invalid/society";
const PUBLIC_RPC_URL = "https://rpc.example.invalid";
const PUBLIC_STUDIO_URL = "https://studio.example.invalid";
const SOCIETY_SERVER_SOURCE_PATH = "examples/multi_agent/society_server.ts";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const getAvailablePort = (): Promise<number> =>
  new Promise((resolve, reject) => {
    const server = createNetServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address() as AddressInfo;
      server.close(() => resolve(address.port));
    });
  });

const serverUrl = (port: number, path: string) =>
  `http://127.0.0.1:${port}${path}`;

const waitForServer = async (
  healthUrl: string,
  child: ReturnType<typeof spawn>,
  stderr: string[],
) => {
  const start = Date.now();
  while (Date.now() - start < SERVER_START_TIMEOUT_MS) {
    if (child.exitCode !== null) {
      throw new Error(`Society server exited early: ${stderr.join("")}`);
    }
    try {
      const response = await fetch(healthUrl);
      if (response.ok) return;
    } catch {
      // keep polling until the child is ready
    }
    await delay(SERVER_POLL_INTERVAL_MS);
  }
  throw new Error(`Timed out waiting for society server: ${stderr.join("")}`);
};

const startServer = async (
  extraEnv: NodeJS.ProcessEnv = {},
  options: { portEnvName?: "PORT" | "SUBSTRATE_SOCIETY_PORT" } = {},
) => {
  const port = await getAvailablePort();
  const portEnvName = options.portEnvName ?? "PORT";
  const child = spawn(
    "node",
    ["--experimental-strip-types", "examples/multi_agent/society_server.ts"],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        [portEnvName]: String(port),
        ...extraEnv,
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  const stderr: string[] = [];
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => {
    stderr.push(chunk);
  });

  await waitForServer(serverUrl(port, "/api/health"), child, stderr);

  return {
    child,
    stderr,
    url: (path: string) => serverUrl(port, path),
    async stop() {
      child.kill("SIGTERM");
      await once(child, "exit");
    },
  };
};

test("society server accepts the society-specific port variable", async () => {
  const server = await startServer(
    {},
    { portEnvName: "SUBSTRATE_SOCIETY_PORT" },
  );
  try {
    const response = await fetch(server.url("/api/health"));

    strictEqual(response.status, 200);
  } finally {
    await server.stop();
  }
});

test("society server rejects the removed offline commit route", async () => {
  const server = await startServer();
  try {
    const response = await fetch(server.url("/api/society/commit"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ config: { agents: 1, ticks: 1, gridSize: 6 } }),
    });

    strictEqual(response.status, 410);
    const payload = (await response.json()) as { error?: string };
    ok(payload.error?.includes("removed"));
    ok(payload.error?.includes("Surfpool live session"));
  } finally {
    await server.stop();
  }
});

test("society server publishes configured public demo links", async () => {
  const server = await startServer({
    SUBSTRATE_PUBLIC_SOCIETY_URL: PUBLIC_SOCIETY_URL,
    SUBSTRATE_PUBLIC_RPC_URL: PUBLIC_RPC_URL,
    SUBSTRATE_PUBLIC_SURFPOOL_STUDIO_URL: PUBLIC_STUDIO_URL,
  });
  try {
    const response = await fetch(server.url("/api/society/public-links"));

    strictEqual(response.status, 200);
    const payload = (await response.json()) as {
      societyUrl?: string;
      rpcUrl?: string;
      studioUrl?: string;
    };
    strictEqual(payload.societyUrl, PUBLIC_SOCIETY_URL);
    strictEqual(payload.rpcUrl, PUBLIC_RPC_URL);
    strictEqual(payload.studioUrl, PUBLIC_STUDIO_URL);
  } finally {
    await server.stop();
  }
});

test("society server derives the public app URL from forwarded headers", async () => {
  const server = await startServer();
  try {
    const response = await fetch(server.url("/api/society/public-links"), {
      headers: {
        "x-forwarded-host": "demo.example.invalid",
        "x-forwarded-proto": "https",
      },
    });

    strictEqual(response.status, 200);
    const payload = (await response.json()) as { societyUrl?: string };
    strictEqual(payload.societyUrl, "https://demo.example.invalid/society");
  } finally {
    await server.stop();
  }
});

test("society server blocks tunneled live mutations by default", async () => {
  const server = await startServer();
  try {
    const response = await fetch(server.url("/api/society/live/start"), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-host": "demo.example.invalid",
        "x-forwarded-proto": "https",
      },
      body: JSON.stringify({ agents: 1, ticks: 1, gridSize: 6 }),
    });

    strictEqual(response.status, 403);
    const payload = (await response.json()) as { error?: string };
    ok(payload.error?.includes("Public live mutation is disabled"));
  } finally {
    await server.stop();
  }
});

test("legacy society page redirects people to the live board", async () => {
  const server = await startServer();
  try {
    for (const path of [
      "/examples/multi_agent/dashboard/society.html",
      "/dashboard/society.html",
      "/society.html",
    ]) {
      const response = await fetch(server.url(path), { redirect: "manual" });

      strictEqual(response.status, 302);
      strictEqual(response.headers.get("location"), "/society");
    }
  } finally {
    await server.stop();
  }
});

test("society live start prepares configured agents before first action", async () => {
  const source = await readFile(SOCIETY_SERVER_SOURCE_PATH, "utf8");
  const prepareFunctionIndex = source.indexOf(
    "const prepareInitialLiveAgentAccounts",
  );
  const prepareCallIndex = source.indexOf(
    "await prepareInitialLiveAgentAccounts(chainSession, run)",
  );
  const returnIndex = source.indexOf("return chainSession", prepareCallIndex);

  ok(
    prepareFunctionIndex > -1,
    "server must have an explicit initial agent preparation pass",
  );
  ok(
    prepareCallIndex > prepareFunctionIndex,
    "live start must call the initial agent preparation pass",
  );
  ok(
    returnIndex > prepareCallIndex,
    "initial agent accounts must be prepared before the live session is returned",
  );
  ok(
    source.includes("stakeAsset: SOL_STAKE_ASSET_LABEL"),
    "live account payload should identify the SOL stake asset",
  );
  ok(
    source.includes("Missing genesis or birth event for initial agent"),
    "initial agent setup must fail instead of inventing synthetic setup events",
  );
  ok(
    !source.includes("FALLBACK_AGENT_SETUP_CELL"),
    "initial agent setup must not fall back to a synthetic board cell",
  );
});

test("society live completion reputation is applied to agent-owned receipts", async () => {
  const source = await readFile(SOCIETY_SERVER_SOURCE_PATH, "utf8");
  const helperIndex = source.indexOf("const applyAgentActionReputation");
  const agentReceiptIndex = source.indexOf(
    "identity: agentRuntime.account.identity.address",
    helperIndex,
  );
  const agentTaskIndex = source.indexOf(
    "task: agentRuntime.account.task.address",
    helperIndex,
  );
  const agentReputationIndex = source.indexOf(
    "reputation: agentRuntime.account.reputation.address",
    helperIndex,
  );

  ok(helperIndex > -1, "server must have an agent-owned reputation path");
  ok(
    agentReceiptIndex > helperIndex,
    "agent reputation receipt must be emitted under the agent identity",
  );
  ok(
    agentTaskIndex > helperIndex,
    "agent reputation receipt must use an agent-owned task",
  );
  ok(
    agentReputationIndex > helperIndex,
    "agent reputation apply must target the agent reputation account",
  );
  ok(
    !source.includes(
      "identity: chainSession.identity.address,\n        receipt: committedReceipt.address,\n        reputation: chainSession.reputation.address",
    ),
    "live completions must not apply agent action reputation to the board identity",
  );
});

test("society live death path records a verdict and slashes agent stake", async () => {
  const source = await readFile(SOCIETY_SERVER_SOURCE_PATH, "utf8");
  const adapterFunctionIndex = source.indexOf(
    "const maybeApplySocietyDeathDisputeAdapter",
  );
  const adapterDescriptionIndex = source.indexOf(
    "Example adapter task that maps a Society death event into generic dispute",
  );
  const deathGuardIndex = source.indexOf(
    'event.action !== "death"',
    adapterFunctionIndex,
  );
  const agentTaskIndex = source.indexOf("createTask({", adapterFunctionIndex);
  const agentReceiptIndex = source.indexOf(
    "identity: agentRuntime.account.identity.address",
    adapterFunctionIndex,
  );
  const verdictIndex = source.indexOf(
    "outcome: AGENT_LOST_OUTCOME",
    adapterFunctionIndex,
  );
  const reputationIndex = source.indexOf(
    "applyReputationReceipt",
    verdictIndex,
  );
  const slashIndex = source.indexOf("slashWithVerdict", adapterFunctionIndex);

  ok(
    adapterFunctionIndex > -1,
    "server must have an explicit Society death dispute adapter",
  );
  ok(
    !source.includes("readAdversarialDeathReason"),
    "Society death dispute code must not keep stale adversarial naming",
  );
  ok(
    adapterDescriptionIndex > -1,
    "Society death handling must describe itself as an example adapter",
  );
  ok(
    deathGuardIndex > adapterFunctionIndex,
    "death dispute adapter must only run for death actions",
  );
  ok(
    agentTaskIndex > adapterFunctionIndex,
    "death dispute adapter must create an agent-owned dispute task",
  );
  ok(
    agentReceiptIndex > adapterFunctionIndex,
    "death dispute adapter must emit the dispute receipt under the agent identity",
  );
  ok(
    verdictIndex > adapterFunctionIndex,
    "death dispute adapter must record an agent-lost verdict",
  );
  ok(
    reputationIndex > verdictIndex,
    "death dispute adapter must apply reputation only after the verdict exists",
  );
  ok(
    slashIndex > reputationIndex,
    "death dispute adapter must slash only after the verdict exists",
  );
});
