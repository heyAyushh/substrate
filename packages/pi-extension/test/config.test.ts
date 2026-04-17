import test from "node:test";
import { strictEqual } from "node:assert/strict";

import {
  DEFAULT_RPC_URL,
  DEFAULT_RPC_SUBSCRIPTIONS_URL,
  DEFAULT_DOMAIN,
  DEFAULT_IDENTITY_LABEL,
  DEFAULT_TASK_TITLE,
  DEFAULT_INDEX_DB_PATH,
  DEFAULT_RUN_DASHBOARD_URL,
  loadExtensionConfig,
  DEFAULT_SURFPOOL_STUDIO_URL,
} from "../src/config.js";

test("loadExtensionConfig returns safe defaults when env is empty", () => {
  const config = loadExtensionConfig({
    env: {},
    home: "/tmp/home",
    cwd: "/tmp/cwd",
  });
  strictEqual(config.rpcUrl, DEFAULT_RPC_URL);
  strictEqual(config.rpcSubscriptionsUrl, DEFAULT_RPC_SUBSCRIPTIONS_URL);
  strictEqual(config.keypairPath, "/tmp/home/.config/solana/id.json");
  strictEqual(config.domain, DEFAULT_DOMAIN);
  strictEqual(config.identityLabel, DEFAULT_IDENTITY_LABEL);
  strictEqual(config.taskTitle, DEFAULT_TASK_TITLE);
  strictEqual(config.blobDir, "/tmp/cwd/.pi/substrate-blobs");
  strictEqual(config.indexDbPath, "/tmp/cwd/.pi/substrate-index.sqlite");
  strictEqual(config.autoProvisionIdentity, true);
  strictEqual(config.surfpoolStudioUrl, DEFAULT_SURFPOOL_STUDIO_URL);
  strictEqual(config.runDashboardUrl, DEFAULT_RUN_DASHBOARD_URL);
  strictEqual(DEFAULT_INDEX_DB_PATH, ".pi/substrate-index.sqlite");
});

test("loadExtensionConfig lets env override each setting", () => {
  const config = loadExtensionConfig({
    env: {
      SUBSTRATE_RPC_URL: "https://api.devnet.solana.com",
      SUBSTRATE_RPC_SUBSCRIPTIONS_URL: "wss://api.devnet.solana.com",
      SUBSTRATE_KEYPAIR: "/etc/substrate/id.json",
      SUBSTRATE_DOMAIN: "writing",
      SUBSTRATE_IDENTITY_LABEL: "devnet-agent",
      SUBSTRATE_TASK_TITLE: "pi devnet session",
      SUBSTRATE_BLOB_DIR: "/var/substrate/blobs",
      SUBSTRATE_INDEX_DB: "/var/substrate/index.sqlite",
      SUBSTRATE_AUTO_PROVISION_IDENTITY: "0",
      SUBSTRATE_SURFPOOL_STUDIO_URL: "http://127.0.0.1:18490",
      SUBSTRATE_RUN_DASHBOARD_URL: "http://127.0.0.1:4174/live",
    },
    home: "/tmp/home",
    cwd: "/tmp/cwd",
  });
  strictEqual(config.rpcUrl, "https://api.devnet.solana.com");
  strictEqual(config.rpcSubscriptionsUrl, "wss://api.devnet.solana.com");
  strictEqual(config.keypairPath, "/etc/substrate/id.json");
  strictEqual(config.domain, "writing");
  strictEqual(config.identityLabel, "devnet-agent");
  strictEqual(config.taskTitle, "pi devnet session");
  strictEqual(config.blobDir, "/var/substrate/blobs");
  strictEqual(config.indexDbPath, "/var/substrate/index.sqlite");
  strictEqual(config.autoProvisionIdentity, false);
  strictEqual(config.surfpoolStudioUrl, "http://127.0.0.1:18490");
  strictEqual(config.runDashboardUrl, "http://127.0.0.1:4174/live");
});
