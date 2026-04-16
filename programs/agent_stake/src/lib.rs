pub mod instructions;
pub mod state;

use anchor_lang::prelude::*;

pub use instructions::*;
pub use state::*;
pub use trust_substrate_core::{
    AGENT_LOST_OUTCOME, AGENT_WON_OUTCOME, NO_FAULT_OUTCOME, TrustSubstrateError,
    SLASH_MARKER_SEED, STAKE_SEED, TREASURY_VAULT_SEED, TRUST_MODE_AUTHORITY,
    TRUST_MODE_VERDICT, VERDICT_SEED,
};

pub mod __client_accounts_finalize_unstake {
    pub use crate::instructions::finalize_unstake::__client_accounts_finalize_unstake::*;
}

pub mod __client_accounts_initialize_stake {
    pub use crate::instructions::initialize_stake::__client_accounts_initialize_stake::*;
}

pub mod __client_accounts_initialize_stake_with_trust_mode {
    pub use crate::instructions::initialize_stake::__client_accounts_initialize_stake::*;
}

pub mod __client_accounts_request_unstake {
    pub use crate::instructions::request_unstake::__client_accounts_request_unstake::*;
}

pub mod __client_accounts_slash_already_applied {
    pub use crate::instructions::slash_already_applied::__client_accounts_slash_already_applied::*;
}

pub mod __client_accounts_slash_with_authority {
    pub use crate::instructions::slash_with_authority::__client_accounts_slash_with_authority::*;
}

pub mod __client_accounts_slash_with_verdict {
    pub use crate::instructions::slash_with_verdict::__client_accounts_slash_with_verdict::*;
}

pub mod __client_accounts_stake {
    pub use crate::instructions::stake::__client_accounts_stake::*;
}

#[cfg(feature = "cpi")]
pub mod __cpi_client_accounts_finalize_unstake {
    pub use crate::instructions::finalize_unstake::__cpi_client_accounts_finalize_unstake::*;
}

#[cfg(feature = "cpi")]
pub mod __cpi_client_accounts_initialize_stake {
    pub use crate::instructions::initialize_stake::__cpi_client_accounts_initialize_stake::*;
}

#[cfg(feature = "cpi")]
pub mod __cpi_client_accounts_initialize_stake_with_trust_mode {
    pub use crate::instructions::initialize_stake::__cpi_client_accounts_initialize_stake::*;
}

#[cfg(feature = "cpi")]
pub mod __cpi_client_accounts_request_unstake {
    pub use crate::instructions::request_unstake::__cpi_client_accounts_request_unstake::*;
}

#[cfg(feature = "cpi")]
pub mod __cpi_client_accounts_slash_already_applied {
    pub use crate::instructions::slash_already_applied::__cpi_client_accounts_slash_already_applied::*;
}

#[cfg(feature = "cpi")]
pub mod __cpi_client_accounts_slash_with_authority {
    pub use crate::instructions::slash_with_authority::__cpi_client_accounts_slash_with_authority::*;
}

#[cfg(feature = "cpi")]
pub mod __cpi_client_accounts_slash_with_verdict {
    pub use crate::instructions::slash_with_verdict::__cpi_client_accounts_slash_with_verdict::*;
}

#[cfg(feature = "cpi")]
pub mod __cpi_client_accounts_stake {
    pub use crate::instructions::stake::__cpi_client_accounts_stake::*;
}

declare_id!("GQrptAYan3qAvYf3qjr6LSyr3Hs622fygj2MDL2goANQ");

#[event]
pub struct StakeInitialized {
    pub identity: Pubkey,
    pub authority: Pubkey,
    pub slash_authority: Pubkey,
    pub trust_mode: u8,
    pub slot: u64,
}

#[event]
pub struct StakeDeposited {
    pub identity: Pubkey,
    pub authority: Pubkey,
    pub amount: u64,
    pub slot: u64,
}

#[event]
pub struct StakeUnstakeRequested {
    pub identity: Pubkey,
    pub authority: Pubkey,
    pub amount: u64,
    pub pending_unstake_amount: u64,
    pub unlocks_at_slot: u64,
    pub slot: u64,
}

#[event]
pub struct StakeUnstakeFinalized {
    pub identity: Pubkey,
    pub authority: Pubkey,
    pub amount: u64,
    pub slot: u64,
}

#[event]
pub struct StakeSlashedWithVerdict {
    pub identity: Pubkey,
    pub adjudicator: Pubkey,
    pub dispute_receipt: Pubkey,
    pub verdict: Pubkey,
    pub amount: u64,
    pub trust_mode: u8,
    pub slot: u64,
}

#[event]
pub struct StakeSlashedByAuthority {
    pub identity: Pubkey,
    pub slash_authority: Pubkey,
    pub dispute_receipt: Pubkey,
    pub amount: u64,
    pub trust_mode: u8,
    pub slot: u64,
}

#[program]
pub mod agent_stake {
    use super::*;

    pub fn initialize_stake(ctx: Context<InitializeStake>, slash_authority: Pubkey) -> Result<()> {
        instructions::initialize_stake::handler(
            ctx,
            slash_authority,
            TRUST_MODE_AUTHORITY,
        )
    }

    pub fn initialize_stake_with_trust_mode(
        ctx: Context<InitializeStake>,
        slash_authority: Pubkey,
        trust_mode: u8,
    ) -> Result<()> {
        instructions::initialize_stake::handler(ctx, slash_authority, trust_mode)
    }

    pub fn stake(ctx: Context<Stake>, amount: u64) -> Result<()> {
        instructions::stake::handler(ctx, amount)
    }

    pub fn request_unstake(ctx: Context<RequestUnstake>, amount: u64) -> Result<()> {
        instructions::request_unstake::handler(ctx, amount)
    }

    pub fn finalize_unstake(ctx: Context<FinalizeUnstake>) -> Result<()> {
        instructions::finalize_unstake::handler(ctx)
    }

    pub fn slash_with_verdict(ctx: Context<SlashWithVerdict>) -> Result<()> {
        instructions::slash_with_verdict::handler(ctx)
    }

    pub fn slash_with_authority(ctx: Context<SlashWithAuthority>, amount: u64) -> Result<()> {
        instructions::slash_with_authority::handler(ctx, amount)
    }

    pub fn slash_already_applied(ctx: Context<SlashAlreadyApplied>) -> Result<()> {
        instructions::slash_already_applied::handler(ctx)
    }
}
