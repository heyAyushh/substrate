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

pub mod __client_accounts_emit_receipt {
    pub use crate::instructions::emit_receipt::__client_accounts_emit_receipt::*;
}

#[cfg(feature = "cpi")]
pub mod __cpi_client_accounts_emit_delegated_receipt {
    pub use crate::instructions::emit_delegated_receipt::__cpi_client_accounts_emit_delegated_receipt::*;
}

#[cfg(feature = "cpi")]
pub mod __cpi_client_accounts_emit_receipt {
    pub use crate::instructions::emit_receipt::__cpi_client_accounts_emit_receipt::*;
}

declare_id!("FV5Nsn3jHH8xxBP6m1N43NawgswmMkhZo72HGYJaJLHp");

#[program]
pub mod receipt_emitter {
    use super::*;

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
}
