import path from "node:path";
import { readFile } from "node:fs/promises";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { localRuntimePlugin } from "@trust-substrate/pi-local-runtime/vite";

import {
  createLiveSimulationController,
  executeLocalSimulation,
  LiveSimulationAlreadyRunningError,
} from "./dev/live-simulation";

const WORKSPACE_ROOT = path.resolve(__dirname, "../..");
const LIVE_SNAPSHOT_PATH = path.resolve(
  __dirname,
  "../multi_agent/.snapshot/dashboard-data.json",
);
const LIVE_SNAPSHOT_ROUTE = "/__live/dashboard-data.json";
const LIVE_SIMULATION_ROUTE = "/__live/simulate";

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    localRuntimePlugin({
      workspaceRoot: WORKSPACE_ROOT,
    }),
    {
      name: "live-dashboard-snapshot",
      configureServer(server) {
        const simulationController = createLiveSimulationController({
          executeSimulation: () =>
            executeLocalSimulation({
              workspaceRoot: WORKSPACE_ROOT,
              liveSnapshotPath: LIVE_SNAPSHOT_PATH,
            }),
        });

        server.middlewares.use(async (request, response, next) => {
          const pathname = new URL(request.url ?? "/", "http://127.0.0.1")
            .pathname;

          if (pathname === LIVE_SIMULATION_ROUTE && request.method === "POST") {
            try {
              const result = await simulationController.run();
              response.statusCode = 200;
              response.setHeader("Content-Type", "application/json");
              response.setHeader("Cache-Control", "no-store");
              response.end(JSON.stringify(result));
            } catch (error) {
              response.setHeader("Content-Type", "application/json");
              response.setHeader("Cache-Control", "no-store");

              if (error instanceof LiveSimulationAlreadyRunningError) {
                response.statusCode = 409;
                response.end(
                  JSON.stringify({
                    error: error.message,
                  }),
                );
                return;
              }

              response.statusCode = 500;
              response.end(
                JSON.stringify({
                  error:
                    error instanceof Error
                      ? error.message
                      : "The live simulation failed",
                }),
              );
            }
            return;
          }

          if (pathname !== LIVE_SNAPSHOT_ROUTE) {
            next();
            return;
          }

          try {
            const body = await readFile(LIVE_SNAPSHOT_PATH, "utf8");
            response.setHeader("Content-Type", "application/json");
            response.setHeader("Cache-Control", "no-store");
            response.end(body);
          } catch {
            response.statusCode = 404;
            response.setHeader("Content-Type", "application/json");
            response.end(
              JSON.stringify({
                error: "Live dashboard snapshot unavailable",
              }),
            );
          }
        });
      },
    },
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
