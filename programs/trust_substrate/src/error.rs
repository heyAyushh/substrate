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
}
