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
    #[msg("The receipt does not belong to this checkpoint's agent identity")]
    CheckpointReceiptIdentityMismatch,
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
    #[msg("The signer cannot update this identity policy root")]
    IdentityAuthorityMismatch,
    #[msg("The signer is not the valid history updater PDA")]
    InvalidHistoryUpdater,
    #[msg("The receipt does not extend the task's latest receipt")]
    ReceiptChainBroken,
    #[msg("Receipt sequence must increase by exactly one")]
    ReceiptSequenceNotMonotonic,
    #[msg("The signer cannot checkpoint history for this agent identity")]
    CheckpointAuthorityMismatch,
    #[msg("The signer is not the configured checkpoint import authority")]
    CheckpointImportAuthorityMismatch,
    #[msg("Checkpoint receipts must be appended in canonical task and sequence order")]
    CheckpointOrderingViolation,
    #[msg("This receipt has already been appended to the checkpoint")]
    CheckpointReceiptAlreadyAppended,
    #[msg("The checkpoint cannot append more receipts without overflowing its frontier")]
    CheckpointLeafCountOverflow,
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
    #[msg("Imported checkpoints cannot accept direct receipt appends")]
    CheckpointImportedIsReadOnly,
    #[msg("The signer cannot mutate this stake account")]
    StakeAuthorityMismatch,
    #[msg("The signer cannot slash this stake account")]
    StakeSlashAuthorityMismatch,
    #[msg("Stake amount cannot be added without overflowing")]
    StakeAmountOverflow,
    #[msg("Stake amount must be greater than zero")]
    StakeAmountMustBePositive,
    #[msg("The stake account does not have enough lamports available")]
    StakeInsufficient,
    #[msg("The unstake cooldown has not elapsed")]
    StakeCooldownNotElapsed,
    #[msg("The dispute receipt does not belong to this stake identity")]
    StakeReceiptIdentityMismatch,
    #[msg("Slashing requires a dispute_resolved receipt")]
    StakeReceiptKindMismatch,
    #[msg("This dispute receipt has already been used for slashing")]
    StakeSlashAlreadyApplied,
    #[msg("The receipt kind cannot be emitted as an audit receipt")]
    ReceiptKindNotAuditable,
    #[msg("The receipt kind cannot be emitted as a self-receipt")]
    ReceiptKindNotSelfEmittable,
    #[msg("An audit receipt must target another agent identity's receipt")]
    ReceiptAuditorCannotTargetOwnReceipt,
    #[msg("The domain is not registered in the canonical domain catalog")]
    DomainNotRegistered,
    #[msg("The domain is already registered in the canonical domain catalog")]
    DomainAlreadyRegistered,
    #[msg("The domain catalog has reached its maximum capacity")]
    DomainCatalogFull,
    #[msg("Challenge receipts must include a positive deadline slot")]
    ChallengeDeadlineMissing,
    #[msg("The challenge deadline has not elapsed yet")]
    ChallengeDeadlineNotElapsed,
    #[msg("The supplied receipt is not a challenge receipt")]
    ChallengeReceiptKindMismatch,
    #[msg("The supplied challenge does not target this receipt")]
    ChallengeTargetReceiptMismatch,
    #[msg("The supplied challenge response does not answer this challenge")]
    ChallengeResponseMismatch,
    #[msg("The supplied receipt is not a challenge response receipt")]
    ChallengeResponseKindMismatch,
    #[msg("A valid challenge response already exists")]
    ChallengeAlreadyResponded,
    #[msg("The challenge response window has closed")]
    ChallengeResponseWindowClosed,
    #[msg("Challenge responses must be emitted through the dedicated instruction")]
    ChallengeResponseMustUseDedicatedInstruction,
    #[msg("Non-challenge receipts cannot carry a deadline slot")]
    ReceiptDeadlineNotSupported,
    #[msg("Receipt sequence cannot be incremented without overflowing")]
    ReceiptSequenceOverflow,
}
