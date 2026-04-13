export {
  TrustSubstrateClient,
  ReceiptLedger,
  assertDelegationAllowed,
  createDelegation,
  createIdentity,
  createReceipt,
  createTask,
  RECEIPT_KIND_CODES,
  RECEIPT_SCOPE_BITS,
} from "./client.js";

export { createMerkleTree, MerkleTree, verifyMerkleProof } from "./merkle.js";

export {
  EMPTY_ONCHAIN_ROOT,
  hashInternalBytes,
  hashLeafBytes,
  OnchainMerkleTree,
  verifyOnchainInclusion,
} from "./onchain-merkle.js";

export { deriveReputation } from "./reputation.js";

export {
  canonicalExecutionRecord,
  hashExecutionRecord,
  hashStep,
} from "./execution-record.js";

export type {
  ExecutionRecord,
  ExecutionRecordHash,
  ExecutionStep,
  ExecutionStepKind,
} from "./execution-record.js";

export type {
  DelegationAssertionInput,
  DelegationCreateInput,
  DelegationRecord,
  DelegationScope,
  IdentityCreateInput,
  IdentityRecord,
  ReceiptCreateInput,
  ReceiptKind,
  ReceiptRecord,
  TaskCreateInput,
  TaskRecord,
  TrustSubstrateProofInput,
} from "./client.js";

export type {
  MerkleProof,
  MerkleProofStep,
  MerkleVerificationInput,
} from "./merkle.js";

export type { OnchainProof } from "./onchain-merkle.js";

export type { ReputationProfile } from "./reputation.js";
