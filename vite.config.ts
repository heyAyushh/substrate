import path from "node:path";
import { readFile } from "node:fs/promises";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

import { localRuntimePlugin } from "./scripts/local-runtime-plugin";

const LIVE_SNAPSHOT_PATH = path.resolve(
  __dirname,
  "../multi_agent/.snapshot/dashboard-data.json",
);
const LIVE_SNAPSHOT_ROUTE = "/__live/dashboard-data.json";

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    localRuntimePlugin(),
    {
      name: "live-dashboard-snapshot",
      configureServer(server) {
        server.middlewares.use(async (request, response, next) => {
          if (request.url !== LIVE_SNAPSHOT_ROUTE) {
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
