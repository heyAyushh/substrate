pub mod instructions;
pub mod state;

use anchor_lang::prelude::*;

pub use instructions::*;
pub use state::*;
pub use trust_substrate_core::{TrustSubstrateError, DELEGATION_SEED, EMPTY_SCOPE_BITMAP};

declare_id!("HoRjTc9J44oSqBC4DeHfDTavkR15Le8FY3qyPFy4pg49");

#[program]
pub mod delegation_engine {
    use super::*;

    pub fn create_delegation(
        ctx: Context<CreateDelegation>,
        allowed_actions: u8,
        expires_at_slot: u64,
    ) -> Result<()> {
        create_delegation::handle_create_delegation(ctx, allowed_actions, expires_at_slot)
    }

    pub fn revoke_delegation(ctx: Context<RevokeDelegation>) -> Result<()> {
        revoke_delegation::handle_revoke_delegation(ctx)
    }
}
