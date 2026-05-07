import test from "node:test";
import { match, notEqual, ok, strictEqual, throws } from "node:assert/strict";

import {
  AGENT_ACTION_ENVELOPE_SCHEMA_VERSION,
  assertAgentActionEnvelopeChainBound,
  buildAgentActionEnvelope,
  hashAgentActionEnvelope,
} from "../../packages/sdk/src/index.js";

const makeEnvelopeInput = () => ({
  agentId: "agent-alpha",
  identityAddress: "Identity1111111111111111111111111111111111",
  taskAddress: "Task1111111111111111111111111111111111111",
  tick: 7,
  action: "completion",
  args: {
    recordId: "pi:agent-alpha:turn-1",
  },
  promptHash: "p".repeat(64),
  responseHash: "r".repeat(64),
  preStateHash: "a".repeat(64),
  postStateHash: "b".repeat(64),
  receiptAddress: "Receipt111111111111111111111111111111111",
  receiptPayloadHash: "c".repeat(64),
  txSignature: "tx_signature",
  slot: 42,
  agentSignature: "agent_signature",
  transcriptRoot: "d".repeat(64),
  leafHash: "e".repeat(64),
});

test("agent action envelope is the shared signed and chain-bound artifact", () => {
  const envelope = buildAgentActionEnvelope(makeEnvelopeInput());

  strictEqual(envelope.schemaVersion, AGENT_ACTION_ENVELOPE_SCHEMA_VERSION);
  strictEqual(envelope.agentId, "agent-alpha");
  strictEqual(
    envelope.taskAddress,
    "Task1111111111111111111111111111111111111",
  );
  strictEqual(envelope.receiptPayloadHash, "c".repeat(64));
  strictEqual(envelope.txSignature, "tx_signature");
  strictEqual(envelope.agentSignature, "agent_signature");
  strictEqual(envelope.transcriptRoot, "d".repeat(64));
  strictEqual(envelope.leafHash, "e".repeat(64));
  match(hashAgentActionEnvelope(envelope), /^[a-f0-9]{64}$/);
  ok(assertAgentActionEnvelopeChainBound(envelope));
});

test("agent action envelope hash changes when chain binding changes", () => {
  const original = buildAgentActionEnvelope(makeEnvelopeInput());
  const changed = buildAgentActionEnvelope({
    ...makeEnvelopeInput(),
    txSignature: "other_tx_signature",
  });

  notEqual(hashAgentActionEnvelope(original), hashAgentActionEnvelope(changed));
});

test("agent action envelope rejects unsigned or unbound JSON artifacts", () => {
  const missingSignature = {
    ...buildAgentActionEnvelope(makeEnvelopeInput()),
    agentSignature: "",
  };
  const missingReceipt = {
    ...buildAgentActionEnvelope(makeEnvelopeInput()),
    receiptAddress: "",
  };

  throws(
    () => assertAgentActionEnvelopeChainBound(missingSignature),
    /agentSignature/,
  );
  throws(
    () => assertAgentActionEnvelopeChainBound(missingReceipt),
    /receiptAddress/,
  );
});
