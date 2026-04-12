export {
  TrustSubstrateClient,
  ReceiptLedger,
  assertDelegationAllowed,
  createDelegation,
  createIdentity,
  createReceipt,
  createTask,
} from "./client.js";

export { createMerkleTree, MerkleTree, verifyMerkleProof } from "./merkle.js";

export { deriveReputation } from "./reputation.js";

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

export type { ReputationProfile } from "./reputation.js";
