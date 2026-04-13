pub mod instructions;
pub mod state;

use anchor_lang::prelude::*;

pub use instructions::*;
pub use state::*;
pub use trust_substrate_core::{TrustSubstrateError, SLASH_MARKER_SEED, STAKE_SEED};

pub mod __client_accounts_finalize_unstake {
    pub use crate::instructions::finalize_unstake::__client_accounts_finalize_unstake::*;
}

pub mod __client_accounts_initialize_stake {
    pub use crate::instructions::initialize_stake::__client_accounts_initialize_stake::*;
}

pub mod __client_accounts_request_unstake {
    pub use crate::instructions::request_unstake::__client_accounts_request_unstake::*;
}

pub mod __client_accounts_slash {
    pub use crate::instructions::slash::__client_accounts_slash::*;
}

pub mod __client_accounts_slash_already_applied {
    pub use crate::instructions::slash::__client_accounts_slash_already_applied::*;
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
pub mod __cpi_client_accounts_request_unstake {
    pub use crate::instructions::request_unstake::__cpi_client_accounts_request_unstake::*;
}

#[cfg(feature = "cpi")]
pub mod __cpi_client_accounts_slash {
    pub use crate::instructions::slash::__cpi_client_accounts_slash::*;
}

#[cfg(feature = "cpi")]
pub mod __cpi_client_accounts_slash_already_applied {
    pub use crate::instructions::slash::__cpi_client_accounts_slash_already_applied::*;
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
pub struct StakeSlashed {
    pub identity: Pubkey,
    pub authority: Pubkey,
    pub dispute_receipt: Pubkey,
    pub amount: u64,
    pub slot: u64,
}

#[program]
pub mod agent_stake {
    use super::*;

    pub fn initialize_stake(ctx: Context<InitializeStake>, slash_authority: Pubkey) -> Result<()> {
        instructions::initialize_stake::handler(ctx, slash_authority)
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

    pub fn slash(ctx: Context<Slash>, amount: u64) -> Result<()> {
        instructions::slash::handler(ctx, amount)
    }

    pub fn slash_already_applied(ctx: Context<SlashAlreadyApplied>) -> Result<()> {
        instructions::slash::already_applied_handler(ctx)
    }
}
