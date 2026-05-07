use anchor_lang::prelude::*;

#[event]
pub struct AuthorityRotationRequested {
    pub identity: Pubkey,
    pub previous_authority: Pubkey,
    pub new_authority: Pubkey,
    pub unlock_slot: u64,
    pub slot: u64,
}

#[event]
pub struct AuthorityRotated {
    pub identity: Pubkey,
    pub previous_authority: Pubkey,
    pub new_authority: Pubkey,
    pub slot: u64,
    pub mode: u8,
}

#[event]
pub struct GuardianSetInitialized {
    pub identity: Pubkey,
    pub guardians: Vec<Pubkey>,
    pub threshold: u8,
    pub slot: u64,
}

#[event]
pub struct IdentityBondDeposited {
    pub identity: Pubkey,
    pub authority: Pubkey,
    pub amount: u64,
    pub slot: u64,
}

#[event]
pub struct IdentityBondWithdrawn {
    pub identity: Pubkey,
    pub authority: Pubkey,
    pub amount: u64,
    pub slot: u64,
}

#[event]
pub struct IdentityTaskCountAdjusted {
    pub identity: Pubkey,
    pub authority: Pubkey,
    pub open_task_count: u32,
    pub delta: i8,
    pub slot: u64,
}

#[event]
pub struct IdentityChallengeCountAdjusted {
    pub identity: Pubkey,
    pub authority: Pubkey,
    pub open_challenge_count: u32,
    pub delta: i8,
    pub slot: u64,
}

#[event]
pub struct IdentityStakeActivitySynced {
    pub identity: Pubkey,
    pub authority: Pubkey,
    pub active_stake: bool,
    pub active_stake_count: u32,
    pub slot: u64,
}

#[event]
pub struct RuntimeAttestationAppended {
    pub identity: Pubkey,
    pub runtime_attestation: Pubkey,
    pub runtime_authority: Pubkey,
    pub runtime_commit: [u8; 32],
    pub valid_from_slot: u64,
}
