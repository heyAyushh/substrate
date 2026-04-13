use anchor_lang::prelude::*;

#[event]
pub struct ReceiptCommitted {
    pub identity: Pubkey,
    pub task: Pubkey,
    pub receipt_id: [u8; 32],
    pub actor: Pubkey,
    pub kind: u8,
    pub sequence: u64,
    pub domain: [u8; 32],
    pub via_delegation: Pubkey,
}
