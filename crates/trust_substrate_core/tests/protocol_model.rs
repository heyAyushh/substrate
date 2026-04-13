use trust_substrate_core::model::{
    derive_reputation, hash_receipt, verify_merkle_proof, Delegation, MerkleTree, Receipt,
    ReceiptKind, ReputationDomain,
};

const AGENT_A: [u8; 32] = [1; 32];
const AGENT_B: [u8; 32] = [2; 32];
const TASK_ID: [u8; 32] = [3; 32];
const RECEIPT_A: [u8; 32] = [4; 32];
const RECEIPT_B: [u8; 32] = [5; 32];
const COORDINATION_DOMAIN: [u8; 32] = [6; 32];
const COMPLETION_WEIGHT: u64 = 1;

fn receipt(receipt_id: [u8; 32], kind: ReceiptKind, sequence: u64) -> Receipt {
    Receipt {
        receipt_id,
        task_id: TASK_ID,
        actor_id: AGENT_A,
        kind,
        sequence,
        domain: COORDINATION_DOMAIN,
        previous_receipt: None,
        payload_hash: [9; 32],
    }
}

#[test]
fn receipt_hash_changes_with_meaningful_fields() {
    let assignment = receipt(RECEIPT_A, ReceiptKind::Assignment, 1);
    let completion = receipt(RECEIPT_A, ReceiptKind::Completion, 1);

    assert_ne!(hash_receipt(&assignment), hash_receipt(&completion));
}

#[test]
fn delegation_rejects_actions_outside_scope() {
    let delegation = Delegation::new(
        AGENT_A,
        AGENT_B,
        &[ReceiptKind::Assignment, ReceiptKind::Handoff],
    );

    assert!(delegation.allows(ReceiptKind::Assignment));
    assert!(!delegation.allows(ReceiptKind::Completion));
    assert!(!delegation.allows(ReceiptKind::Challenge));
}

#[test]
fn challenge_receipts_do_not_change_reputation() {
    let history = vec![
        receipt(RECEIPT_A, ReceiptKind::Challenge, 1),
        receipt(RECEIPT_B, ReceiptKind::ChallengeResponse, 2),
    ];
    let reputation = derive_reputation(&history);

    assert_eq!(reputation.overall, 0);
    assert_eq!(reputation.domains[0].completed, 0);
    assert_eq!(reputation.domains[0].disputed, 0);
}

#[test]
fn merkle_proofs_reject_forged_leaves() {
    let leaves = vec![
        hash_receipt(&receipt(RECEIPT_A, ReceiptKind::Assignment, 1)),
        hash_receipt(&receipt(RECEIPT_B, ReceiptKind::Completion, 2)),
    ];
    let tree = MerkleTree::new(leaves.clone());
    let proof = tree
        .proof(1)
        .expect("proof should exist for the second leaf");

    assert!(verify_merkle_proof(&leaves[1], &proof, tree.root(), 1));
    assert!(!verify_merkle_proof(&[7u8; 32], &proof, tree.root(), 1));
}

#[test]
fn reputation_is_derived_from_verified_history() {
    let history = vec![
        receipt(RECEIPT_A, ReceiptKind::Assignment, 1),
        receipt(RECEIPT_B, ReceiptKind::Completion, 2),
    ];
    let reputation = derive_reputation(&history);
    let domain = ReputationDomain {
        domain: COORDINATION_DOMAIN,
        completed: COMPLETION_WEIGHT,
        disputed: 0,
    };

    assert_eq!(reputation.agent_id, AGENT_A);
    assert_eq!(reputation.domains, vec![domain]);
    assert!(reputation.overall > 0);
}
