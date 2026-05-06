use anchor_lang::prelude::*;
use trust_substrate_core::MAX_SOCIETY_WORLD_STATE_BYTES;

const PUBKEY_BYTES: usize = 32;
const U32_BYTES: usize = 4;
const U64_BYTES: usize = 8;
const U8_BYTES: usize = 1;
const VEC_PREFIX_BYTES: usize = 4;
const STATE_HASH_BYTES: usize = 32;

#[account]
pub struct SocietyWorld {
    pub identity: Pubkey,
    pub task: Pubkey,
    pub current_tick: u32,
    pub last_sequence: u64,
    pub last_receipt: Pubkey,
    pub state_hash: [u8; 32],
    pub status: u8,
    pub state: Vec<u8>,
    pub bump: u8,
}

impl SocietyWorld {
    pub const SPACE: usize = PUBKEY_BYTES
        + PUBKEY_BYTES
        + U32_BYTES
        + U64_BYTES
        + PUBKEY_BYTES
        + STATE_HASH_BYTES
        + U8_BYTES
        + VEC_PREFIX_BYTES
        + MAX_SOCIETY_WORLD_STATE_BYTES
        + U8_BYTES;
}
