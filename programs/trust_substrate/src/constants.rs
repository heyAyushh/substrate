pub const IDENTITY_SEED: &[u8] = b"identity";
pub const TASK_SEED: &[u8] = b"task";
pub const RECEIPT_SEED: &[u8] = b"receipt";
pub const DELEGATION_SEED: &[u8] = b"delegation";
pub const CHECKPOINT_SEED: &[u8] = b"checkpoint";
pub const REPUTATION_SEED: &[u8] = b"reputation";

pub const EMPTY_SCOPE_BITMAP: u8 = 0;
pub const ASSIGNMENT_KIND: u8 = 1;
pub const HANDOFF_KIND: u8 = 2;
pub const COMPLETION_KIND: u8 = 3;
pub const DISPUTE_KIND: u8 = 4;
pub const COMPLETION_CREDIT: u64 = 1;
pub const DISPUTE_CREDIT: u64 = 1;
