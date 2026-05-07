export {
  AGENT_ACTION_ENVELOPE_SCHEMA_VERSION,
  assertAgentActionEnvelopeChainBound,
  buildAgentActionEnvelope,
  hashAgentActionEnvelope,
} from "./agent-action-envelope.js";

export type {
  AgentActionEnvelope,
  AgentActionEnvelopeInput,
} from "./agent-action-envelope.js";

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
  signExecutionStep,
  verifyExecutionRecord,
} from "./execution-record.js";

export type {
  ExecutionRecord,
  ExecutionRecordHash,
  ExecutionRecordVerification,
  ExecutionStep,
  ExecutionStepKind,
  StepSignature,
} from "./execution-record.js";

export {
  adaptAndSignPiToolCalls,
  adaptPiToolCalls,
  PI_TOOL_TO_STEP_KIND,
} from "./pi-adapter.js";

export {
  KitTransactionDispatcher,
  TrustSubstrateOnchainClient,
  createKitTransactionDispatcher,
} from "./onchain-client.js";

export { PiToolStreamBridge } from "./pi-bridge.js";

export {
  bytes32Equals,
  bytes32ToHex,
  deriveAgentIdBytes,
  deriveAuditReceiptIdBytes,
  deriveDomainBytes,
  deriveHistoryRootBytes,
  derivePayloadHashBytes,
  derivePolicyRootBytes,
  derivePreviousReceiptBytes,
  deriveProtocolBytes32,
  deriveReceiptIdBytes,
  deriveSubtaskRootBytes,
  deriveTaskIdBytes,
  normalizeBytes32,
  zeroBytes32,
} from "./onchain-identifiers.js";

export {
  appendRuntimeAttestation,
  resolveRuntimeAtSlot,
} from "./runtime-attestation.js";

export type {
  RuntimeAttestationInput,
  RuntimeAttestationRecord,
} from "./runtime-attestation.js";

export {
  AGENT_TRACE_VERSION,
  canonicalAgentTrace,
  executionRecordToAgentTrace,
  hashAgentTrace,
} from "./agent-trace.js";

export {
  createDisputeReceipt,
  createReceiptFromExecution,
  createVerifiedReceiptFromExecution,
} from "./receipt-builders.js";

export {
  createStakeEvent,
  deriveStakeState,
  extractStakeEventsFromReceipt,
  STAKE_EVENT_MARKER,
} from "./stake.js";

export {
  DataAvailabilityError,
  verifyPayloadAvailable,
} from "./data-availability.js";

export {
  CHALLENGE_MARKER,
  CHALLENGE_RESPONSE_MARKER,
  buildUnansweredChallengePayload,
  createChallengeReceipt,
  createChallengeResponseReceipt,
  createUnansweredChallengeDispute,
  UNANSWERED_CHALLENGE_MARKER,
} from "./challenge.js";

export { withPayloadHash } from "./payload-hash.js";

export type {
  ChallengeReceiptInput,
  ChallengeResponseReceiptInput,
  UnansweredChallengeDisputeInput,
} from "./challenge.js";

export type {
  BlobFetchResult,
  BlobFetcher,
  VerifyPayloadInput,
} from "./data-availability.js";

export type {
  AdaptPiToolCallsInput,
  AdaptedSignedPiToolCalls,
  PiToolCall,
  PiToolName,
  SignedPiToolCalls,
} from "./pi-adapter.js";

export type {
  OnchainAuditReceiptBinding,
  OnchainIdentityBinding,
  OnchainIdentityBondBinding,
  OnchainOperationResult,
  OnchainReceiptBinding,
  OnchainReputationBinding,
  OnchainStakeBinding,
  OnchainAttesterBinding,
  OnchainDelegationBinding,
  OnchainHistoryCheckpointBinding,
  OnchainAdjudicatorBinding,
  OnchainVerdictBinding,
  OnchainTaskBinding,
  OnchainTransactionCommit,
  OnchainTransactionDispatcher,
  OnchainChallengeResponseBinding,
  OnchainSocietyWorldBinding,
  OnchainSocietyWorldRecord,
  TrustSubstrateDispatcherConfig,
  TrustSubstrateRpc,
  TrustSubstrateRpcSubscriptions,
} from "./onchain-client.js";

export type {
  PiBridgeCommitInput,
  PiBridgeCommitResult,
  PiBridgeExecutionResult,
  PiBridgeStakeInput,
  ReceiptIndexRecord,
  ReceiptIndexWriter,
} from "./pi-bridge.js";

export {
  COMMIT_MARKER,
  createCommitReceipt,
  createRevealReceipt,
  REVEAL_MARKER,
} from "./commit-reveal.js";

export {
  AUTHORITY_ROTATED_MARKER,
  configureGuardianSet,
  createAuthorityRotationEvent,
  emergencyRotateAuthority,
  finalizeAuthorityRotation,
  MAX_GUARDIAN_APPROVERS,
  requestAuthorityRotation,
} from "./rotation.js";

export type {
  CommitReceiptInput,
  RevealReceiptInput,
} from "./commit-reveal.js";

export type {
  DisputeReceiptInput,
  DisputeResolution,
  DisputeResolutionOutcome,
  ReceiptFromExecutionInput,
  ReceiptStorageRef,
} from "./receipt-builders.js";

export type {
  StakeAssetKind,
  StakeEvent,
  StakeEventInput,
  StakeEventKind,
  StakeState,
  TokenStakeState,
} from "./stake.js";

export type { AgentTraceBundle, AgentTraceFileEdit } from "./agent-trace.js";

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

export type {
  ReputationDerivationOptions,
  ReputationProfile,
} from "./reputation.js";

export type {
  AuthorityRotationEvent,
  AuthorityRotationEventInput,
  AuthorityRotationMode,
  ConfigureGuardianSetInput,
  EmergencyRotateAuthorityInput,
  FinalizeAuthorityRotationInput,
  GuardianSet,
  PendingAuthorityRotation,
  RotateAuthorityInput,
} from "./rotation.js";
