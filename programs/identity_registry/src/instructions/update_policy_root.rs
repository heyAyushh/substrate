use anchor_lang::prelude::*;

use crate::state::AgentIdentity;
use trust_substrate_core::TrustSubstrateError;

#[derive(Accounts)]
pub struct UpdatePolicyRoot<'info> {
    #[account(mut)]
    pub identity: Account<'info, AgentIdentity>,
    pub authority: Signer<'info>,
}

pub fn handler(ctx: Context<UpdatePolicyRoot>, new_root: [u8; 32]) -> Result<()> {
    require_keys_eq!(
        ctx.accounts.identity.authority,
        ctx.accounts.authority.key(),
        TrustSubstrateError::IdentityAuthorityMismatch
    );

    ctx.accounts.identity.policy_root = new_root;

    Ok(())
}
