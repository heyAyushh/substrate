#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  DEFAULT_SNAPSHOT_RELATIVE_PATH,
  PROJECT_ROOT_ENV,
  SERVER_NAME,
  SNAPSHOT_PATH_ENV,
} from "./constants.js";
import { createTrustSubstrateMcpServer } from "./server.js";

const HELP_FLAGS = new Set(["--help", "-h"]);

if (process.argv.slice(2).some((arg) => HELP_FLAGS.has(arg))) {
  console.log(
    [
      `${SERVER_NAME}`,
      "",
      "Runs a local stdio MCP server for Trust Substrate indexer snapshots.",
      "",
      "Environment:",
      `  ${PROJECT_ROOT_ENV}      Project root that bounds snapshot reads`,
      `  ${SNAPSHOT_PATH_ENV}    Snapshot JSON path, default: ${DEFAULT_SNAPSHOT_RELATIVE_PATH}`,
    ].join("\n"),
  );
  process.exit(0);
}

const server = createTrustSubstrateMcpServer();
const transport = new StdioServerTransport();

await server.connect(transport);
console.error(`${SERVER_NAME} running on stdio`);
