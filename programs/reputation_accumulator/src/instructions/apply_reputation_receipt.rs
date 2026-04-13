use crate::{
    identity_registry::state::AgentIdentity, receipt_emitter::state::ReceiptRecord,
    state::ReputationAccumulator, TrustSubstrateError,
};
use anchor_lang::prelude::*;
use trust_substrate_core::{COMPLETION_KIND, DISPUTE_KIND, DISPUTE_RESOLVED_KIND};

pub fn handler(ctx: Context<ApplyReputationReceipt>) -> Result<()> {
    require_keys_eq!(
        ctx.accounts.identity.authority,
        ctx.accounts.authority.key(),
        TrustSubstrateError::InvalidAuthority
    );
    require_keys_eq!(
        ctx.accounts.receipt.identity,
        ctx.accounts.identity.key(),
        TrustSubstrateError::ReceiptIdentityMismatch
    );
    require!(
        ctx.accounts.reputation.domain == ctx.accounts.receipt.domain,
        TrustSubstrateError::ReputationDomainMismatch
    );

    let reputation = &mut ctx.accounts.reputation;
    match ctx.accounts.receipt.kind {
        COMPLETION_KIND => {
            reputation.completed = reputation
                .completed
                .saturating_add(reputation.completion_weight);
        }
        DISPUTE_KIND => {
            reputation.disputed = reputation
                .disputed
                .saturating_add(reputation.dispute_weight);
        }
        DISPUTE_RESOLVED_KIND => {
            let credit = reputation.dispute_resolved_weight.min(reputation.disputed);
            reputation.disputed = reputation.disputed.saturating_sub(credit);
            reputation.resolved = reputation.resolved.saturating_add(credit);
        }
        _ => {}
    }

    Ok(())
}

#[derive(Accounts)]
pub struct ApplyReputationReceipt<'info> {
    pub identity: Account<'info, AgentIdentity>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub receipt: Account<'info, ReceiptRecord>,
    #[account(mut)]
    pub reputation: Account<'info, ReputationAccumulator>,
}
