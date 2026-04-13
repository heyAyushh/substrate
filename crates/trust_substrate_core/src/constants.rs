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
pub const DISPUTE_RESOLVED_KIND: u8 = 5;

pub const ASSIGNMENT_SCOPE_BIT: u8 = 1 << 0;
pub const HANDOFF_SCOPE_BIT: u8 = 1 << 1;
pub const COMPLETION_SCOPE_BIT: u8 = 1 << 2;
pub const DISPUTE_SCOPE_BIT: u8 = 1 << 3;
pub const DISPUTE_RESOLVED_SCOPE_BIT: u8 = 1 << 4;

pub const DEFAULT_COMPLETION_WEIGHT: u64 = 1;
pub const DEFAULT_DISPUTE_WEIGHT: u64 = 1;
pub const DEFAULT_DISPUTE_RESOLVED_WEIGHT: u64 = 1;

pub const COMPLETION_CREDIT: u64 = DEFAULT_COMPLETION_WEIGHT;
pub const DISPUTE_CREDIT: u64 = DEFAULT_DISPUTE_WEIGHT;

pub const TASK_STATUS_PENDING: u8 = 0;
pub const TASK_STATUS_ACTIVE: u8 = 1;
pub const TASK_STATUS_COMPLETED: u8 = 2;
pub const TASK_STATUS_DISPUTED: u8 = 3;
pub const TASK_STATUS_RESOLVED: u8 = 4;

pub fn scope_bit_for_kind(kind: u8) -> Option<u8> {
    match kind {
        ASSIGNMENT_KIND => Some(ASSIGNMENT_SCOPE_BIT),
        HANDOFF_KIND => Some(HANDOFF_SCOPE_BIT),
        COMPLETION_KIND => Some(COMPLETION_SCOPE_BIT),
        DISPUTE_KIND => Some(DISPUTE_SCOPE_BIT),
        DISPUTE_RESOLVED_KIND => Some(DISPUTE_RESOLVED_SCOPE_BIT),
        _ => None,
    }
}

pub fn is_valid_receipt_kind(kind: u8) -> bool {
    matches!(
        kind,
        ASSIGNMENT_KIND | HANDOFF_KIND | COMPLETION_KIND | DISPUTE_KIND | DISPUTE_RESOLVED_KIND
    )
}
