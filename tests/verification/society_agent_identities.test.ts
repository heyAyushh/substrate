import test from "node:test";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createPublicKey, sign, verify } from "node:crypto";
import { deepStrictEqual, strictEqual } from "node:assert/strict";

import { loadOrCreateSocietyAgentIdentity } from "../../examples/multi_agent/society_agent_identities.ts";

test("society agent identities keep one reusable keypair per agent folder", async () => {
  const rootDirectory = await mkdtemp(
    join(tmpdir(), "trust-substrate-society-identities-"),
  );
  const input = {
    rootDirectory,
    sessionId: "live-session",
    agentId: "agent/alpha",
    agentName: "Alpha",
  };

  const first = await loadOrCreateSocietyAgentIdentity(input);
  const second = await loadOrCreateSocietyAgentIdentity(input);
  const keypair = JSON.parse(
    await readFile(first.keypairPath, "utf8"),
  ) as number[];
  const message = Buffer.from("society-action");
  const signature = sign(null, message, first.actionSigningKey);

  strictEqual(first.created, true);
  strictEqual(second.created, false);
  strictEqual(first.signer.address, second.signer.address);
  strictEqual(keypair.length, 64);
  strictEqual(first.directory, second.directory);
  deepStrictEqual(first.keypairPath, second.keypairPath);
  strictEqual(
    verify(null, message, createPublicKey(first.actionSigningKey), signature),
    true,
  );
});
