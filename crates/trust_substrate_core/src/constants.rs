use solana_sha256_hasher::hashv;

pub const IDENTITY_SEED: &[u8] = b"identity";
pub const PENDING_ROTATION_SEED: &[u8] = b"pending_rotation";
pub const GUARDIAN_SET_SEED: &[u8] = b"guardian_set";
pub const IDENTITY_BOND_SEED: &[u8] = b"bond";
pub const TASK_SEED: &[u8] = b"task";
pub const SOCIETY_WORLD_SEED: &[u8] = b"society_world";
pub const RECEIPT_SEED: &[u8] = b"receipt";
pub const AUDIT_RECEIPT_SEED: &[u8] = b"audit_receipt";
pub const CHALLENGE_RESPONSE_SEED: &[u8] = b"challenge_response";
pub const DELEGATION_SEED: &[u8] = b"delegation";
pub const CHECKPOINT_SEED: &[u8] = b"checkpoint";
pub const CHECKPOINT_IMPORTER_SEED: &[u8] = b"checkpoint_importer";
pub const ADJUDICATOR_CONFIG_SEED: &[u8] = b"adjudicator_config";
pub const TREASURY_VAULT_SEED: &[u8] = b"treasury";
pub const VERDICT_SEED: &[u8] = b"verdict";
pub const REPUTATION_SEED: &[u8] = b"reputation";
pub const STAKE_SEED: &[u8] = b"stake";
pub const TOKEN_STAKE_SEED: &[u8] = b"token_stake";
pub const TOKEN_STAKE_VAULT_SEED: &[u8] = b"token_stake_vault";
pub const TOKEN_TREASURY_VAULT_SEED: &[u8] = b"token_treasury_vault";
pub const SLASH_MARKER_SEED: &[u8] = b"slash_marker";
pub const LATEST_CHECKPOINT_SEED: &[u8] = b"latest_checkpoint";
pub const TASK_RECEIPT_APPLICATION_SEED: &[u8] = b"task_receipt_application";
pub const REPUTATION_RECEIPT_APPLICATION_SEED: &[u8] = b"reputation_receipt_application";
pub const DOMAIN_CATALOG_SEED: &[u8] = b"domain_catalog";
pub const DOMAIN_STATS_SEED: &[u8] = b"domain_stats";
pub const RUNTIME_ATTESTATION_SEED: &[u8] = b"runtime_attestation";
pub const ATTESTER_CONFIG_SEED: &[u8] = b"attester_config";
pub const ATTESTER_RECORD_SEED: &[u8] = b"attester";

pub const EMPTY_SCOPE_BITMAP: u8 = 0;

pub const IDENTITY_TIER_UNBONDED: u8 = 0;
pub const IDENTITY_TIER_BONDED: u8 = 1;
pub const MAX_ATTESTER_EFFECTIVE_TIER: u8 = 3;
pub const MAX_ATTESTER_CATEGORY_LEN: usize = 32;
pub const IDENTITY_BOND_LAMPORTS: u64 = 100_000_000;
pub const ATTESTER_BOND_LAMPORTS: u64 = 200_000_000;

pub const ASSIGNMENT_KIND: u8 = 1;
pub const HANDOFF_KIND: u8 = 2;
pub const COMPLETION_KIND: u8 = 3;
pub const DISPUTE_KIND: u8 = 4;
pub const DISPUTE_RESOLVED_KIND: u8 = 5;
pub const CHALLENGE_KIND: u8 = 6;
pub const CHALLENGE_RESPONSE_KIND: u8 = 7;
pub const ATTESTATION_KIND: u8 = 8;
pub const COMMIT_KIND: u8 = 9;
pub const REVEAL_KIND: u8 = 10;

pub const ASSIGNMENT_SCOPE_BIT: u8 = 1 << 0;
pub const HANDOFF_SCOPE_BIT: u8 = 1 << 1;
pub const COMPLETION_SCOPE_BIT: u8 = 1 << 2;
pub const DISPUTE_SCOPE_BIT: u8 = 1 << 3;
pub const DISPUTE_RESOLVED_SCOPE_BIT: u8 = 1 << 4;
pub const CHALLENGE_SCOPE_BIT: u8 = 1 << 5;
pub const CHALLENGE_RESPONSE_SCOPE_BIT: u8 = 1 << 6;

// Delegation scopes only cover the receipt kinds with explicit delegate-authorized
// paths. Audit receipts and the commit/reveal helpers do not currently have their
// own delegation bits.
pub const VALID_SCOPE_BITMAP: u8 = ASSIGNMENT_SCOPE_BIT
    | HANDOFF_SCOPE_BIT
    | COMPLETION_SCOPE_BIT
    | DISPUTE_SCOPE_BIT
    | DISPUTE_RESOLVED_SCOPE_BIT
    | CHALLENGE_SCOPE_BIT
    | CHALLENGE_RESPONSE_SCOPE_BIT;

pub const DEFAULT_COMPLETION_WEIGHT: u64 = 1;
pub const DEFAULT_DISPUTE_WEIGHT: u64 = 1;
pub const DEFAULT_DISPUTE_RESOLVED_WEIGHT: u64 = 1;

pub const TASK_STATUS_PENDING: u8 = 0;
pub const TASK_STATUS_ACTIVE: u8 = 1;
pub const TASK_STATUS_COMPLETED: u8 = 2;
pub const TASK_STATUS_DISPUTED: u8 = 3;
pub const TASK_STATUS_RESOLVED: u8 = 4;
pub const SOCIETY_WORLD_STATUS_ACTIVE: u8 = 0;
pub const SOCIETY_WORLD_STATUS_COMPLETE: u8 = 1;
pub const SOCIETY_WORLD_STATUS_FAILED: u8 = 2;
pub const MAX_SOCIETY_WORLD_STATE_BYTES: usize = 9 * 1024;
pub const MAX_GUARDIANS: usize = 5;
pub const ROTATION_COOLDOWN_SLOTS: u64 = 5;
pub const STAKE_COOLDOWN_SLOTS: u64 = 5;

pub const AUTHORITY_ROTATION_MODE_NORMAL: u8 = 0;
pub const AUTHORITY_ROTATION_MODE_EMERGENCY: u8 = 1;

pub const TRUST_MODE_VERDICT: u8 = 0;
pub const TRUST_MODE_AUTHORITY: u8 = 1;

pub const AGENT_WON_OUTCOME: u8 = 0;
pub const AGENT_LOST_OUTCOME: u8 = 1;
pub const NO_FAULT_OUTCOME: u8 = 2;

pub const VERDICT_CLASS_SAFETY: u8 = 0;
pub const VERDICT_CLASS_PERFORMANCE: u8 = 1;
pub const VERDICT_CLASS_POLICY: u8 = 2;

pub fn scope_bit_for_kind(kind: u8) -> Option<u8> {
    match kind {
        ASSIGNMENT_KIND => Some(ASSIGNMENT_SCOPE_BIT),
        HANDOFF_KIND => Some(HANDOFF_SCOPE_BIT),
        COMPLETION_KIND => Some(COMPLETION_SCOPE_BIT),
        DISPUTE_KIND => Some(DISPUTE_SCOPE_BIT),
        DISPUTE_RESOLVED_KIND => Some(DISPUTE_RESOLVED_SCOPE_BIT),
        CHALLENGE_KIND => Some(CHALLENGE_SCOPE_BIT),
        CHALLENGE_RESPONSE_KIND => Some(CHALLENGE_RESPONSE_SCOPE_BIT),
        // These kinds are valid protocol receipts, but there is no delegation
        // bitmap slot for them in the current on-chain delegation surface.
        ATTESTATION_KIND | COMMIT_KIND | REVEAL_KIND => None,
        _ => None,
    }
}

pub fn is_valid_trust_mode(trust_mode: u8) -> bool {
    matches!(trust_mode, TRUST_MODE_VERDICT | TRUST_MODE_AUTHORITY)
}

pub fn is_valid_verdict_outcome(outcome: u8) -> bool {
    matches!(
        outcome,
        AGENT_WON_OUTCOME | AGENT_LOST_OUTCOME | NO_FAULT_OUTCOME
    )
}

pub fn is_valid_verdict_class(class: u8) -> bool {
    matches!(
        class,
        VERDICT_CLASS_SAFETY | VERDICT_CLASS_PERFORMANCE | VERDICT_CLASS_POLICY
    )
}

pub fn is_self_emittable_receipt_kind(kind: u8) -> bool {
    matches!(
        kind,
        ASSIGNMENT_KIND
            | HANDOFF_KIND
            | COMPLETION_KIND
            | DISPUTE_KIND
            | DISPUTE_RESOLVED_KIND
            | COMMIT_KIND
            | REVEAL_KIND
    )
}

pub fn is_system_emittable_receipt_kind(kind: u8) -> bool {
    matches!(kind, CHALLENGE_RESPONSE_KIND)
}

pub fn is_auditable_receipt_kind(kind: u8) -> bool {
    matches!(kind, CHALLENGE_KIND | DISPUTE_KIND | ATTESTATION_KIND)
}

pub fn is_valid_receipt_kind(kind: u8) -> bool {
    is_self_emittable_receipt_kind(kind)
        || is_system_emittable_receipt_kind(kind)
        || is_auditable_receipt_kind(kind)
}

pub fn is_valid_society_world_status(status: u8) -> bool {
    matches!(
        status,
        SOCIETY_WORLD_STATUS_ACTIVE | SOCIETY_WORLD_STATUS_COMPLETE | SOCIETY_WORLD_STATUS_FAILED
    )
}

pub fn hash_society_world_state(state: &[u8]) -> [u8; 32] {
    hashv(&[b"society_world_state", state]).to_bytes()
}

pub fn derive_audit_receipt_id(
    auditor_identity: &[u8],
    target_receipt: &[u8],
    kind: u8,
    round: u16,
) -> [u8; 32] {
    let kind_bytes = kind.to_le_bytes();
    let round_bytes = round.to_le_bytes();

    hashv(&[
        AUDIT_RECEIPT_SEED,
        auditor_identity,
        target_receipt,
        kind_bytes.as_ref(),
        round_bytes.as_ref(),
    ])
    .to_bytes()
}
