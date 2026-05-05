import test from "node:test";
import { once } from "node:events";
import { strictEqual, ok } from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer as createNetServer, type AddressInfo } from "node:net";

const SERVER_START_TIMEOUT_MS = 60_000;
const SERVER_POLL_INTERVAL_MS = 250;
const PUBLIC_SOCIETY_URL = "https://society.example.invalid/society";
const PUBLIC_RPC_URL = "https://rpc.example.invalid";
const PUBLIC_STUDIO_URL = "https://studio.example.invalid";

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
