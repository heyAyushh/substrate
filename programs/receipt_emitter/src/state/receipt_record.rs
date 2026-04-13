use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct ReceiptRecord {
    pub identity: Pubkey,
    pub task: Pubkey,
    pub receipt_id: [u8; 32],
    pub actor: Pubkey,
    pub kind: u8,
    pub sequence: u64,
    pub domain: [u8; 32],
    pub previous_receipt: [u8; 32],
    pub payload_hash: [u8; 32],
    pub via_delegation: Pubkey,
    pub bump: u8,
}
