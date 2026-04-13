use solana_sha256_hasher::hashv;

pub const EMPTY_MERKLE_ROOT: [u8; 32] = [0; 32];

pub fn hash_leaf(data: &[u8]) -> [u8; 32] {
    hashv(&[b"leaf:", data]).to_bytes()
}

pub fn hash_internal(left: &[u8; 32], right: &[u8; 32]) -> [u8; 32] {
    hashv(&[b"node:", left.as_ref(), right.as_ref()]).to_bytes()
}

pub fn verify_inclusion(
    leaf: [u8; 32],
    proof_siblings: &[[u8; 32]],
    leaf_index: u64,
    leaf_count: u64,
    root: [u8; 32],
) -> bool {
    if leaf_index >= leaf_count {
        return false;
    }

    let mut current = leaf;
    let mut index = leaf_index;

    for sibling in proof_siblings {
        let sibling_is_left = index & 1 == 1;
        current = if sibling_is_left {
            hash_internal(sibling, &current)
        } else {
            hash_internal(&current, sibling)
        };
        index >>= 1;
    }

    current == root
}
