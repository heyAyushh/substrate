use solana_sha256_hasher::hashv;

const EMPTY_ROOT: [u8; 32] = [0; 32];
const COMPLETION_WEIGHT: u64 = 1;
const DISPUTE_WEIGHT: u64 = 1;
const ASSIGNMENT_KIND_CODE: u8 = 1;
const HANDOFF_KIND_CODE: u8 = 2;
const COMPLETION_KIND_CODE: u8 = 3;
const DISPUTE_KIND_CODE: u8 = 4;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ReceiptKind {
    Assignment,
    Handoff,
    Completion,
    Dispute,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Receipt {
    pub receipt_id: [u8; 32],
    pub task_id: [u8; 32],
    pub actor_id: [u8; 32],
    pub kind: ReceiptKind,
    pub sequence: u64,
    pub domain: [u8; 32],
    pub previous_receipt: Option<[u8; 32]>,
    pub payload_hash: [u8; 32],
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Delegation {
    pub delegator_id: [u8; 32],
    pub delegate_id: [u8; 32],
    allowed_actions: Vec<ReceiptKind>,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct MerkleProofNode {
    pub sibling: [u8; 32],
    pub sibling_is_left: bool,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MerkleTree {
    levels: Vec<Vec<[u8; 32]>>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ReputationDomain {
    pub domain: [u8; 32],
    pub completed: u64,
    pub disputed: u64,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ReputationVector {
    pub agent_id: [u8; 32],
    pub overall: u64,
    pub domains: Vec<ReputationDomain>,
}

impl Delegation {
    pub fn new(
        delegator_id: [u8; 32],
        delegate_id: [u8; 32],
        allowed_actions: &[ReceiptKind],
    ) -> Self {
        Self {
            delegator_id,
            delegate_id,
            allowed_actions: allowed_actions.to_vec(),
        }
    }

    pub fn allows(&self, action: ReceiptKind) -> bool {
        self.allowed_actions.contains(&action)
    }
}

impl MerkleTree {
    pub fn new(leaves: Vec<[u8; 32]>) -> Self {
        if leaves.is_empty() {
            return Self {
                levels: vec![vec![EMPTY_ROOT]],
            };
        }

        let mut levels = vec![leaves];
        while levels.last().expect("level exists").len() > 1 {
            let previous_level = levels.last().expect("level exists");
            let mut next_level = Vec::with_capacity((previous_level.len() + 1) / 2);
            for pair in previous_level.chunks(2) {
                let left = pair[0];
                let right = pair.get(1).copied().unwrap_or(left);
                next_level.push(hash_pair(left, right));
            }
            levels.push(next_level);
        }

        Self { levels }
    }

    pub fn root(&self) -> [u8; 32] {
        self.levels
            .last()
            .and_then(|level| level.first())
            .copied()
            .unwrap_or(EMPTY_ROOT)
    }

    pub fn proof(&self, leaf_index: usize) -> Option<Vec<MerkleProofNode>> {
        let leaf_count = self.levels.first()?.len();
        if leaf_index >= leaf_count {
            return None;
        }

        let mut proof = Vec::with_capacity(self.levels.len().saturating_sub(1));
        let mut current_index = leaf_index;
        for level in self.levels.iter().take(self.levels.len().saturating_sub(1)) {
            let is_right_node = current_index % 2 == 1;
            let sibling_index = if is_right_node {
                current_index.saturating_sub(1)
            } else {
                current_index + 1
            };
            let sibling = level
                .get(sibling_index)
                .copied()
                .unwrap_or_else(|| level[current_index]);
            proof.push(MerkleProofNode {
                sibling,
                sibling_is_left: is_right_node,
            });
            current_index /= 2;
        }

        Some(proof)
    }
}

pub fn hash_receipt(receipt: &Receipt) -> [u8; 32] {
    let kind = [receipt_kind_code(receipt.kind)];
    let sequence = receipt.sequence.to_le_bytes();
    let previous = receipt.previous_receipt.unwrap_or(EMPTY_ROOT);
    hashv(&[
        receipt.receipt_id.as_ref(),
        receipt.task_id.as_ref(),
        receipt.actor_id.as_ref(),
        kind.as_ref(),
        sequence.as_ref(),
        receipt.domain.as_ref(),
        previous.as_ref(),
        receipt.payload_hash.as_ref(),
    ])
    .to_bytes()
}

pub fn verify_merkle_proof(
    leaf: [u8; 32],
    proof: &[MerkleProofNode],
    root: [u8; 32],
    leaf_index: usize,
) -> bool {
    let mut current_hash = leaf;
    let mut current_index = leaf_index;

    for node in proof {
        let computed_sibling_is_left = current_index % 2 == 1;
        if computed_sibling_is_left != node.sibling_is_left {
            return false;
        }

        current_hash = if node.sibling_is_left {
            hash_pair(node.sibling, current_hash)
        } else {
            hash_pair(current_hash, node.sibling)
        };
        current_index /= 2;
    }

    current_hash == root
}

pub fn derive_reputation(history: &[Receipt]) -> ReputationVector {
    let agent_id = history
        .first()
        .map(|receipt| receipt.actor_id)
        .unwrap_or(EMPTY_ROOT);
    let mut domains = Vec::<ReputationDomain>::new();

    for receipt in history {
        let domain = find_or_insert_domain(&mut domains, receipt.domain);
        match receipt.kind {
            ReceiptKind::Completion => {
                domain.completed = domain.completed.saturating_add(COMPLETION_WEIGHT);
            }
            ReceiptKind::Dispute => {
                domain.disputed = domain.disputed.saturating_add(DISPUTE_WEIGHT);
            }
            ReceiptKind::Assignment | ReceiptKind::Handoff => {}
        }
    }

    let overall = domains.iter().fold(0_u64, |score, domain| {
        score.saturating_add(domain.completed.saturating_sub(domain.disputed))
    });

    ReputationVector {
        agent_id,
        overall,
        domains,
    }
}

fn find_or_insert_domain(
    domains: &mut Vec<ReputationDomain>,
    domain: [u8; 32],
) -> &mut ReputationDomain {
    if let Some(index) = domains
        .iter()
        .position(|candidate| candidate.domain == domain)
    {
        return &mut domains[index];
    }

    domains.push(ReputationDomain {
        domain,
        completed: 0,
        disputed: 0,
    });
    domains.last_mut().expect("domain was just inserted")
}

fn hash_pair(left: [u8; 32], right: [u8; 32]) -> [u8; 32] {
    hashv(&[left.as_ref(), right.as_ref()]).to_bytes()
}

fn receipt_kind_code(kind: ReceiptKind) -> u8 {
    match kind {
        ReceiptKind::Assignment => ASSIGNMENT_KIND_CODE,
        ReceiptKind::Handoff => HANDOFF_KIND_CODE,
        ReceiptKind::Completion => COMPLETION_KIND_CODE,
        ReceiptKind::Dispute => DISPUTE_KIND_CODE,
    }
}
