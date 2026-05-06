import { createHash } from "node:crypto";
import {
  getAddressEncoder,
  isAddress,
  type Address,
  type ReadonlyUint8Array,
} from "@solana/kit";

import type { IdentityRecord, ReceiptRecord, TaskRecord } from "./client.js";
import { hashCanonical } from "./canonical.js";

const BYTES32_LENGTH = 32;
const HEX_BYTES32_LENGTH = BYTES32_LENGTH * 2;
const BYTES32_ZERO = new Uint8Array(BYTES32_LENGTH);

const HEX_BYTES32_PATTERN = /^[0-9a-f]{64}$/i;
const ADDRESS_ENCODER = getAddressEncoder();
const AUDIT_RECEIPT_SEED = Buffer.from("audit_receipt", "utf8");
const AUDIT_RECEIPT_ROUND_SHIFT = 8;
const AUDIT_RECEIPT_ROUND_MASK = 0xffff;
const BYTE_MASK = 0xff;

const toBytes32 = (hex: string): Uint8Array => {
  if (!HEX_BYTES32_PATTERN.test(hex)) {
    throw new Error(`Expected 32-byte hex string, received "${hex}"`);
  }
  return Uint8Array.from(Buffer.from(hex, "hex"));
};

export const bytes32Equals = (
  left: ReadonlyUint8Array,
  right: ReadonlyUint8Array,
): boolean => Buffer.from(left).equals(Buffer.from(right));

export const bytes32ToHex = (value: ReadonlyUint8Array): string =>
  Buffer.from(value).toString("hex");

export const zeroBytes32 = (): Uint8Array => BYTES32_ZERO.slice();

export const deriveProtocolBytes32 = (
  namespace: string,
  value: unknown,
): Uint8Array => toBytes32(hashCanonical({ namespace, value }));

export const normalizeBytes32 = (
  value: string,
  namespace: string,
): Uint8Array =>
  HEX_BYTES32_PATTERN.test(value)
    ? toBytes32(value.toLowerCase())
    : deriveProtocolBytes32(namespace, value);

export const deriveAgentIdBytes = (
  identity: Pick<IdentityRecord, "identityId">,
): Uint8Array => deriveProtocolBytes32("agent_id", identity.identityId);

export const deriveTaskIdBytes = (
  task: Pick<TaskRecord, "taskId">,
): Uint8Array => deriveProtocolBytes32("task_id", task.taskId);

export const deriveSubtaskRootBytes = (
  task: Pick<TaskRecord, "taskId" | "subtasks" | "description">,
): Uint8Array =>
  deriveProtocolBytes32("subtask_root", {
    taskId: task.taskId,
    subtasks: task.subtasks,
    description: task.description ?? "",
  });

export const deriveDomainBytes = (
  taskOrDomain: Pick<TaskRecord, "domain"> | string,
): Uint8Array =>
  deriveProtocolBytes32(
    "domain",
    typeof taskOrDomain === "string" ? taskOrDomain : taskOrDomain.domain,
  );

export const deriveReceiptIdBytes = (
  receipt: Pick<ReceiptRecord, "receiptId">,
): Uint8Array => deriveProtocolBytes32("receipt_id", receipt.receiptId);

export const deriveAuditReceiptIdBytes = (input: {
  readonly auditorIdentity: Address;
  readonly targetReceipt: Address;
  readonly kind: number;
  readonly round: number;
}): Uint8Array => {
  const auditorIdentity = Uint8Array.from(
    ADDRESS_ENCODER.encode(input.auditorIdentity),
  );
  const targetReceipt = Uint8Array.from(
    ADDRESS_ENCODER.encode(input.targetReceipt),
  );
  const round = input.round & AUDIT_RECEIPT_ROUND_MASK;
  const digest = createHash("sha256")
    .update(AUDIT_RECEIPT_SEED)
    .update(auditorIdentity)
    .update(targetReceipt)
    .update(Uint8Array.of(input.kind & BYTE_MASK))
    .update(
      Uint8Array.of(
        round & BYTE_MASK,
        (round >>> AUDIT_RECEIPT_ROUND_SHIFT) & BYTE_MASK,
      ),
    )
    .digest();
  return Uint8Array.from(digest);
};

export const derivePreviousReceiptBytes = (
  receipt: Pick<ReceiptRecord, "previousReceiptId">,
): Uint8Array =>
  receipt.previousReceiptId
    ? isAddress(receipt.previousReceiptId)
      ? Uint8Array.from(
          ADDRESS_ENCODER.encode(receipt.previousReceiptId as Address),
        )
      : deriveProtocolBytes32("receipt_id", receipt.previousReceiptId)
    : zeroBytes32();

export const derivePayloadHashBytes = (
  payloadHash: string | undefined,
): Uint8Array => {
  if (!payloadHash) {
    throw new Error("Receipt payload is missing payloadHash");
  }
  if (payloadHash.length !== HEX_BYTES32_LENGTH) {
    throw new Error(
      `Receipt payloadHash must be 32-byte hex, received "${payloadHash}"`,
    );
  }
  return normalizeBytes32(payloadHash, "payload_hash");
};

export const derivePolicyRootBytes = (
  identity: Pick<IdentityRecord, "policyRoot">,
): Uint8Array => normalizeBytes32(identity.policyRoot, "policy_root");

export const deriveHistoryRootBytes = (
  identity: Pick<IdentityRecord, "historyRoot">,
): Uint8Array => normalizeBytes32(identity.historyRoot, "history_root");
