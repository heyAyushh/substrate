use anchor_lang::prelude::*;

#[error_code]
pub enum TrustSubstrateError {
    #[msg("The receipt kind is not part of the canonical receipt vocabulary")]
    InvalidReceiptKind,
    #[msg("Delegation scope must allow at least one action")]
    EmptyDelegationScope,
    #[msg("The receipt does not belong to this agent identity")]
    ReceiptIdentityMismatch,
    #[msg("The reputation domain does not match the receipt domain")]
    ReputationDomainMismatch,
    #[msg("The delegation has been revoked")]
    DelegationRevoked,
    #[msg("The delegation has expired")]
    DelegationExpired,
    #[msg("The delegation does not allow this receipt kind")]
    DelegationScopeMismatch,
    #[msg("The supplied Merkle proof did not reconstruct the expected root")]
    InvalidMerkleProof,
    #[msg("The Merkle proof index is out of range for the checkpoint leaf count")]
    ProofIndexOutOfRange,
    #[msg("The checkpoint does not belong to this agent identity")]
    CheckpointIdentityMismatch,
    #[msg("The receipt does not belong to the supplied task")]
    ReceiptTaskMismatch,
    #[msg("The delegation scope contains unsupported action bits")]
    InvalidDelegationScope,
    #[msg("The delegation does not belong to this agent identity")]
    DelegationIdentityMismatch,
    #[msg("The task does not belong to this agent identity")]
    TaskIdentityMismatch,
    #[msg("The checkpoint epoch cannot be incremented without overflowing")]
    CheckpointEpochOverflow,
    #[msg("Checkpoint epoch must increase by exactly one")]
    CheckpointEpochNotSequential,
    #[msg("Checkpoint leaf count cannot decrease")]
    CheckpointLeafCountRegression,
    #[msg("The reputation domain does not belong to this agent identity")]
    ReputationIdentityMismatch,
    #[msg("Dispute resolution requires an active or historical dispute")]
    TaskDisputeRequiredForResolution,
    #[msg("This receipt kind cannot update task status")]
    ReceiptKindNotSyncableToTask,
    #[msg("This receipt kind does not affect reputation accumulation")]
    ReceiptKindNotAppliedToReputation,
    #[msg("Expected an agent identity account")]
    IdentityAccountTypeMismatch,
    #[msg("Expected a receipt account")]
    ReceiptAccountTypeMismatch,
    #[msg("The signer cannot create or update tasks for this agent identity")]
    TaskAuthorityMismatch,
    #[msg("The signer cannot create or revoke delegations for this agent identity")]
    DelegationAuthorityMismatch,
    #[msg("The signer cannot emit receipts for this agent identity")]
    ReceiptAuthorityMismatch,
    #[msg("The signer cannot checkpoint history for this agent identity")]
    CheckpointAuthorityMismatch,
    #[msg("The signer cannot update reputation for this agent identity")]
    ReputationAuthorityMismatch,
    #[msg("The signer does not match the delegation delegate")]
    DelegationDelegateMismatch,
    #[msg("This receipt has already been applied to the task")]
    ReceiptAlreadyAppliedToTask,
    #[msg("This receipt has already been applied to the reputation domain")]
    ReceiptAlreadyAppliedToReputation,
    #[msg("The checkpoint is no longer the latest checkpoint for this agent identity")]
    StaleCheckpoint,
}
