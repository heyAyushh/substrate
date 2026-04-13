use anchor_lang::prelude::*;

#[error_code]
pub enum TrustSubstrateError {
    #[msg("The signer does not control this agent identity")]
    InvalidAuthority,
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
    #[msg("The delegate does not match the signer")]
    DelegateMismatch,
    #[msg("The supplied Merkle proof did not reconstruct the expected root")]
    InvalidMerkleProof,
    #[msg("The Merkle proof index is out of range for the checkpoint leaf count")]
    ProofIndexOutOfRange,
    #[msg("The checkpoint does not belong to this agent identity")]
    CheckpointIdentityMismatch,
    #[msg("The task status transition is not allowed")]
    InvalidTaskStatusTransition,
    #[msg("The receipt does not belong to the supplied task")]
    ReceiptTaskMismatch,
}
