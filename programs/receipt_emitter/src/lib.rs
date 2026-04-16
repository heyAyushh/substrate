pub mod events;
pub mod instructions;
pub mod state;

use anchor_lang::prelude::*;

pub use events::*;
pub use instructions::*;
pub use state::*;
pub use trust_substrate_core::{
    TrustSubstrateError, ASSIGNMENT_KIND, COMPLETION_KIND, DISPUTE_KIND, DISPUTE_RESOLVED_KIND,
    HANDOFF_KIND,
};

pub mod __client_accounts_emit_delegated_receipt {
    pub use crate::instructions::emit_delegated_receipt::__client_accounts_emit_delegated_receipt::*;
}

pub mod __client_accounts_emit_audit_receipt {
    pub use crate::instructions::emit_audit_receipt::__client_accounts_emit_audit_receipt::*;
}

pub mod __client_accounts_emit_challenge_response {
    pub use crate::instructions::emit_challenge_response::__client_accounts_emit_challenge_response::*;
}

pub mod __client_accounts_emit_receipt {
    pub use crate::instructions::emit_receipt::__client_accounts_emit_receipt::*;
}

pub mod __client_accounts_finalize_unanswered_challenge {
    pub use crate::instructions::finalize_unanswered_challenge::__client_accounts_finalize_unanswered_challenge::*;
}

pub mod __client_accounts_initialize_cpi_authority {
    pub use crate::instructions::initialize_cpi_authority::__client_accounts_initialize_cpi_authority::*;
}

#[cfg(feature = "cpi")]
pub mod __cpi_client_accounts_emit_delegated_receipt {
    pub use crate::instructions::emit_delegated_receipt::__cpi_client_accounts_emit_delegated_receipt::*;
}

#[cfg(feature = "cpi")]
pub mod __cpi_client_accounts_emit_audit_receipt {
    pub use crate::instructions::emit_audit_receipt::__cpi_client_accounts_emit_audit_receipt::*;
}

#[cfg(feature = "cpi")]
pub mod __cpi_client_accounts_emit_challenge_response {
    pub use crate::instructions::emit_challenge_response::__cpi_client_accounts_emit_challenge_response::*;
}

#[cfg(feature = "cpi")]
pub mod __cpi_client_accounts_emit_receipt {
    pub use crate::instructions::emit_receipt::__cpi_client_accounts_emit_receipt::*;
}

#[cfg(feature = "cpi")]
pub mod __cpi_client_accounts_finalize_unanswered_challenge {
    pub use crate::instructions::finalize_unanswered_challenge::__cpi_client_accounts_finalize_unanswered_challenge::*;
}

#[cfg(feature = "cpi")]
pub mod __cpi_client_accounts_initialize_cpi_authority {
    pub use crate::instructions::initialize_cpi_authority::__cpi_client_accounts_initialize_cpi_authority::*;
}

declare_id!("FV5Nsn3jHH8xxBP6m1N43NawgswmMkhZo72HGYJaJLHp");

#[program]
pub mod receipt_emitter {
    use super::*;

    pub fn initialize_cpi_authority(ctx: Context<InitializeCpiAuthority>) -> Result<()> {
        let authority = &mut ctx.accounts.cpi_authority;
        authority.bump = ctx.bumps.cpi_authority;
        Ok(())
    }

    pub fn emit_receipt(
        ctx: Context<EmitReceipt>,
        receipt_id: [u8; 32],
        kind: u8,
        sequence: u64,
        domain: [u8; 32],
        previous_receipt: [u8; 32],
        payload_hash: [u8; 32],
    ) -> Result<()> {
        emit_receipt::handler(
            ctx,
            receipt_id,
            kind,
            sequence,
            domain,
            previous_receipt,
            payload_hash,
        )
    }

    pub fn emit_delegated_receipt(
        ctx: Context<EmitDelegatedReceipt>,
        receipt_id: [u8; 32],
        kind: u8,
        sequence: u64,
        domain: [u8; 32],
        previous_receipt: [u8; 32],
        payload_hash: [u8; 32],
    ) -> Result<()> {
        emit_delegated_receipt::handler(
            ctx,
            receipt_id,
            kind,
            sequence,
            domain,
            previous_receipt,
            payload_hash,
        )
    }

    pub fn emit_audit_receipt(
        ctx: Context<EmitAuditReceipt>,
        kind: u8,
        domain: [u8; 32],
        payload_hash: [u8; 32],
        sequence: u64,
        round: u16,
        deadline_slot: u64,
    ) -> Result<()> {
        emit_audit_receipt::handler(ctx, kind, domain, payload_hash, sequence, round, deadline_slot)
    }

    pub fn emit_challenge_response(
        ctx: Context<EmitChallengeResponse>,
        payload_hash: [u8; 32],
    ) -> Result<()> {
        emit_challenge_response::handler(ctx, payload_hash)
    }

    pub fn finalize_unanswered_challenge(
        ctx: Context<FinalizeUnansweredChallenge>,
    ) -> Result<()> {
        finalize_unanswered_challenge::handler(ctx)
    }
}
