use anchor_lang::prelude::*;

#[event]
pub struct AdjudicatorRegistered {
    pub governance: Pubkey,
    pub adjudicator: Pubkey,
    pub treasury_vault: Pubkey,
    pub slot: u64,
}

#[event]
pub struct VerdictRecorded {
    pub dispute_receipt: Pubkey,
    pub target_identity: Pubkey,
    pub outcome: u8,
    pub slash_amount: u64,
    pub class: u8,
    pub stale_after_slot: u64,
    pub adjudicator: Pubkey,
    pub slot: u64,
}

#[event]
pub struct VerdictChallenged {
    pub verdict: Pubkey,
    pub dispute_receipt: Pubkey,
    pub challenger: Pubkey,
    pub adjudicator: Pubkey,
    pub slot: u64,
}
