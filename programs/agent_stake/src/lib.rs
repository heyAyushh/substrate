pub mod events;
pub mod instructions;
pub mod state;

use anchor_lang::prelude::*;

pub use events::*;
pub use instructions::*;
pub use state::*;
pub use trust_substrate_core::{
    TrustSubstrateError, AGENT_LOST_OUTCOME, AGENT_WON_OUTCOME, NO_FAULT_OUTCOME,
    SLASH_MARKER_SEED, STAKE_SEED, TOKEN_STAKE_SEED, TOKEN_STAKE_VAULT_SEED,
    TOKEN_TREASURY_VAULT_SEED, TREASURY_VAULT_SEED, TRUST_MODE_VERDICT, VERDICT_SEED,
};

pub mod __client_accounts_finalize_unstake {
    pub use crate::instructions::finalize_unstake::__client_accounts_finalize_unstake::*;
}

pub mod __client_accounts_initialize_stake {
    pub use crate::instructions::initialize_stake::__client_accounts_initialize_stake::*;
}

pub mod __client_accounts_initialize_token_treasury_vault {
    pub use crate::instructions::initialize_token_treasury_vault::__client_accounts_initialize_token_treasury_vault::*;
}

pub mod __client_accounts_initialize_token_stake {
    pub use crate::instructions::initialize_token_stake::__client_accounts_initialize_token_stake::*;
}

pub mod __client_accounts_request_unstake {
    pub use crate::instructions::request_unstake::__client_accounts_request_unstake::*;
}

pub mod __client_accounts_request_unstake_token {
    pub use crate::instructions::request_unstake_token::__client_accounts_request_unstake_token::*;
}

pub mod __client_accounts_finalize_unstake_token {
    pub use crate::instructions::finalize_unstake_token::__client_accounts_finalize_unstake_token::*;
}

pub mod __client_accounts_slash_with_authority {
    pub use crate::instructions::slash_with_authority::__client_accounts_slash_with_authority::*;
}

pub mod __client_accounts_slash_with_verdict {
    pub use crate::instructions::slash_with_verdict::__client_accounts_slash_with_verdict::*;
}

pub mod __client_accounts_slash_token_with_authority {
    pub use crate::instructions::slash_token_with_authority::__client_accounts_slash_token_with_authority::*;
}

pub mod __client_accounts_slash_token_with_verdict {
    pub use crate::instructions::slash_token_with_verdict::__client_accounts_slash_token_with_verdict::*;
}

pub mod __client_accounts_stake {
    pub use crate::instructions::stake::__client_accounts_stake::*;
}

pub mod __client_accounts_stake_token {
    pub use crate::instructions::stake_token::__client_accounts_stake_token::*;
}

#[cfg(feature = "cpi")]
pub mod __cpi_client_accounts_finalize_unstake {
    pub use crate::instructions::finalize_unstake::__cpi_client_accounts_finalize_unstake::*;
}

#[cfg(feature = "cpi")]
pub mod __cpi_client_accounts_finalize_unstake_token {
    pub use crate::instructions::finalize_unstake_token::__cpi_client_accounts_finalize_unstake_token::*;
}

#[cfg(feature = "cpi")]
pub mod __cpi_client_accounts_initialize_stake {
    pub use crate::instructions::initialize_stake::__cpi_client_accounts_initialize_stake::*;
}

#[cfg(feature = "cpi")]
pub mod __cpi_client_accounts_initialize_token_treasury_vault {
    pub use crate::instructions::initialize_token_treasury_vault::__cpi_client_accounts_initialize_token_treasury_vault::*;
}

#[cfg(feature = "cpi")]
pub mod __cpi_client_accounts_initialize_token_stake {
    pub use crate::instructions::initialize_token_stake::__cpi_client_accounts_initialize_token_stake::*;
}

#[cfg(feature = "cpi")]
pub mod __cpi_client_accounts_request_unstake {
    pub use crate::instructions::request_unstake::__cpi_client_accounts_request_unstake::*;
}

#[cfg(feature = "cpi")]
pub mod __cpi_client_accounts_request_unstake_token {
    pub use crate::instructions::request_unstake_token::__cpi_client_accounts_request_unstake_token::*;
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
pub mod __cpi_client_accounts_slash_token_with_authority {
    pub use crate::instructions::slash_token_with_authority::__cpi_client_accounts_slash_token_with_authority::*;
}

#[cfg(feature = "cpi")]
pub mod __cpi_client_accounts_slash_token_with_verdict {
    pub use crate::instructions::slash_token_with_verdict::__cpi_client_accounts_slash_token_with_verdict::*;
}

#[cfg(feature = "cpi")]
pub mod __cpi_client_accounts_stake {
    pub use crate::instructions::stake::__cpi_client_accounts_stake::*;
}

#[cfg(feature = "cpi")]
pub mod __cpi_client_accounts_stake_token {
    pub use crate::instructions::stake_token::__cpi_client_accounts_stake_token::*;
}

declare_id!("47FjPydQsbVfMHAb1apZTRrY1pWq2JGyRzgenUaos9on");

#[program]
pub mod agent_stake {
    use super::*;

    pub fn initialize_stake(
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

    pub fn initialize_token_stake(
        ctx: Context<InitializeTokenStake>,
        scope: Pubkey,
        slash_authority: Pubkey,
        trust_mode: u8,
    ) -> Result<()> {
        instructions::initialize_token_stake::handler(ctx, scope, slash_authority, trust_mode)
    }

    pub fn initialize_token_treasury_vault(
        ctx: Context<InitializeTokenTreasuryVault>,
    ) -> Result<()> {
        instructions::initialize_token_treasury_vault::handler(ctx)
    }

    pub fn stake_token(ctx: Context<StakeToken>, amount: u64) -> Result<()> {
        instructions::stake_token::handler(ctx, amount)
    }

    pub fn request_unstake_token(ctx: Context<RequestUnstakeToken>, amount: u64) -> Result<()> {
        instructions::request_unstake_token::handler(ctx, amount)
    }

    pub fn finalize_unstake_token(ctx: Context<FinalizeUnstakeToken>) -> Result<()> {
        instructions::finalize_unstake_token::handler(ctx)
    }

    pub fn slash_token_with_verdict(ctx: Context<SlashTokenWithVerdict>) -> Result<()> {
        instructions::slash_token_with_verdict::handler(ctx)
    }

    pub fn slash_token_with_authority(
        ctx: Context<SlashTokenWithAuthority>,
        amount: u64,
    ) -> Result<()> {
        instructions::slash_token_with_authority::handler(ctx, amount)
    }
}
