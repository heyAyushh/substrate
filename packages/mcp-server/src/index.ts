#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  DEFAULT_SNAPSHOT_RELATIVE_PATH,
  DEFAULT_RPC_SUBSCRIPTIONS_URL,
  DEFAULT_RPC_URL,
  MCP_ENABLE_WRITES_ENV,
  PROJECT_ROOT_ENV,
  SUBSTRATE_COMMITMENT_ENV,
  SUBSTRATE_KEYPAIR_ENV,
  SUBSTRATE_RPC_SUBSCRIPTIONS_URL_ENV,
  SUBSTRATE_RPC_URL_ENV,
  SUBSTRATE_WS_URL_ENV,
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
      "Runs a local stdio MCP server for Trust Substrate snapshot reads and optional Solana chain writes.",
      "",
      "Environment:",
      `  ${PROJECT_ROOT_ENV}      Project root that bounds snapshot reads`,
      `  ${SNAPSHOT_PATH_ENV}    Snapshot JSON path, default: ${DEFAULT_SNAPSHOT_RELATIVE_PATH}`,
      `  ${MCP_ENABLE_WRITES_ENV}    Set to 1 to register chain write tools`,
      `  ${SUBSTRATE_RPC_URL_ENV}                 Solana RPC URL, default: ${DEFAULT_RPC_URL}`,
      `  ${SUBSTRATE_RPC_SUBSCRIPTIONS_URL_ENV}   Solana websocket URL, default: ${DEFAULT_RPC_SUBSCRIPTIONS_URL}`,
      `  ${SUBSTRATE_WS_URL_ENV}                  Legacy websocket URL fallback`,
      `  ${SUBSTRATE_KEYPAIR_ENV}                 Existing Solana keypair JSON path`,
      `  ${SUBSTRATE_COMMITMENT_ENV}              processed, confirmed, or finalized`,
      "",
      "Write tools default to preview. Submitting requires write mode, mode=submit, and confirm=true.",
    ].join("\n"),
  );
  process.exit(0);
}

const server = createTrustSubstrateMcpServer();
const transport = new StdioServerTransport();

await server.connect(transport);
console.error(`${SERVER_NAME} running on stdio`);
