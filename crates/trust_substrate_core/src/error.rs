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
    #[msg("The task domain does not match the receipt domain")]
    TaskDomainMismatch,
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
    #[msg("The requested authority rotation unlock slot is earlier than the protocol cooldown")]
    AuthorityRotationUnlockTooSoon,
    #[msg("The authority rotation cooldown cannot be added to the current slot")]
    AuthorityRotationCooldownOverflow,
    #[msg("The authority rotation cooldown has not elapsed")]
    AuthorityRotationCooldownNotElapsed,
    #[msg("The pending authority rotation does not belong to this identity")]
    AuthorityRotationIdentityMismatch,
    #[msg("The pending authority rotation no longer matches the identity's current authority")]
    AuthorityRotationStateMismatch,
    #[msg("Guardian sets must contain between one and the protocol maximum number of guardians")]
    GuardianSetSizeInvalid,
    #[msg("Guardian threshold must be between one and the number of configured guardians")]
    GuardianThresholdInvalid,
    #[msg("Guardian sets cannot contain the same guardian more than once")]
    GuardianSetDuplicateMember,
    #[msg("This identity has not configured an emergency guardian set")]
    GuardianSetNotConfigured,
    #[msg("Emergency rotation requires more distinct guardian signatures")]
    GuardianSignatureThresholdNotMet,
    #[msg("Emergency rotation can only count configured guardian signers")]
    GuardianSignerNotAuthorized,
    #[msg("Each guardian may only approve an emergency rotation once")]
    GuardianSignerDuplicated,
    #[msg("Emergency rotation approvals must come from signer accounts")]
    GuardianSignatureMissing,
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
    #[msg("The supplied trust mode is not supported by this protocol")]
    InvalidTrustMode,
    #[msg("The signer cannot mutate this stake account")]
    StakeAuthorityMismatch,
    #[msg("The signer cannot slash this stake account")]
    StakeSlashAuthorityMismatch,
    #[msg("The stake account trust mode does not allow this slash path")]
    StakeTrustModeMismatch,
    #[msg("The stake account treasury vault does not match the protocol treasury PDA")]
    StakeTreasuryVaultMismatch,
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
    #[msg("The supplied verdict outcome is not part of the protocol vocabulary")]
    InvalidVerdictOutcome,
    #[msg("The supplied verdict class is not part of the protocol vocabulary")]
    InvalidVerdictClass,
    #[msg("Only the configured adjudicator can record or apply this verdict")]
    VerdictAdjudicatorMismatch,
    #[msg("The supplied receipt is not a dispute receipt")]
    VerdictReceiptKindMismatch,
    #[msg("The verdict does not target this stake identity")]
    VerdictTargetIdentityMismatch,
    #[msg("The verdict is not bound to the supplied dispute receipt")]
    VerdictDisputeReceiptMismatch,
    #[msg("Time-boxed verdicts must include a positive stale-after slot")]
    VerdictStaleWindowMissing,
    #[msg("The verdict is no longer slashable because its stale window has elapsed")]
    VerdictStale,
    #[msg("Only AGENT_LOST verdicts can slash stake")]
    VerdictOutcomeNotSlashable,
    #[msg("Safety verdicts cannot be retired through the stale-window challenge path")]
    VerdictChallengeUnsupported,
    #[msg("The verdict stale window is still open")]
    VerdictChallengeWindowOpen,
    #[msg("The receipt kind cannot be emitted as an audit receipt")]
    ReceiptKindNotAuditable,
    #[msg("The receipt kind cannot be emitted as a self-receipt")]
    ReceiptKindNotSelfEmittable,
    #[msg("An audit receipt must target another agent identity's receipt")]
    ReceiptAuditorCannotTargetOwnReceipt,
    #[msg("The audit receipt domain does not match the target receipt domain")]
    AuditDomainMismatch,
    #[msg("The domain is not registered in the canonical domain catalog")]
    DomainNotRegistered,
    #[msg("The domain is already registered in the canonical domain catalog")]
    DomainAlreadyRegistered,
    #[msg("The domain catalog has reached its maximum capacity")]
    DomainCatalogFull,
    #[msg("Applying a dispute receipt to reputation requires a matching verdict account")]
    ReputationVerdictMissing,
    #[msg("The supplied verdict does not match the dispute receipt being applied")]
    ReputationVerdictMismatch,
    #[msg("Only AGENT_LOST verdicts can degrade reputation")]
    ReputationVerdictOutcomeNotNegative,
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
    #[msg("This identity must post the protocol bond before it can use this surface")]
    IdentityBondRequired,
    #[msg("This identity has already posted the protocol bond")]
    IdentityAlreadyBonded,
    #[msg("This identity does not currently have a posted protocol bond")]
    IdentityNotBonded,
    #[msg("Identity bond withdrawal requires all tasks to be settled")]
    IdentityHasOpenTasks,
    #[msg("Identity bond withdrawal requires all open challenges to be resolved")]
    IdentityHasOpenChallenges,
    #[msg("Identity bond withdrawal requires stake activity to be cleared")]
    IdentityHasActiveStake,
    #[msg("Task count adjustment would underflow the identity state")]
    IdentityTaskCountUnderflow,
    #[msg("Challenge count adjustment would underflow the identity state")]
    IdentityChallengeCountUnderflow,
    #[msg("The supplied identity tier is not part of the protocol vocabulary")]
    InvalidIdentityTier,
    #[msg("Only the configured receipt emitter CPI authority may update challenge counts")]
    IdentityChallengeAuthorityMismatch,
    #[msg("Attester categories must be non-empty and fit within the configured limit")]
    AttesterCategoryInvalid,
    #[msg("The supplied attester tier is outside the configured range")]
    AttesterTierInvalid,
    #[msg("Only the configured attester curator may change effective attester tiers")]
    AttesterCuratorMismatch,
}
