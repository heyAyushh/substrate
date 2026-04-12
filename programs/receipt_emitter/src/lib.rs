pub mod events;
pub mod instructions;
pub mod state;

use anchor_lang::prelude::*;

pub use events::*;
pub use instructions::*;
pub use state::*;
pub use trust_substrate_core::{
    ASSIGNMENT_KIND, DISPUTE_KIND, HANDOFF_KIND, TrustSubstrateError,
};

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
        emit_receipt::handle_emit_receipt(
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
