use solana_sha256_hasher::hashv;

pub const EMPTY_MERKLE_ROOT: [u8; 32] = [0; 32];
pub const MERKLE_FRONTIER_HEIGHT: usize = 32;
pub type MerkleFrontier = [[u8; 32]; MERKLE_FRONTIER_HEIGHT];

pub fn hash_leaf(data: &[u8]) -> [u8; 32] {
    hashv(&[b"leaf:", data]).to_bytes()
}

pub fn hash_internal(left: &[u8; 32], right: &[u8; 32]) -> [u8; 32] {
    hashv(&[b"node:", left.as_ref(), right.as_ref()]).to_bytes()
}

pub fn empty_frontier() -> MerkleFrontier {
    [EMPTY_MERKLE_ROOT; MERKLE_FRONTIER_HEIGHT]
}

pub fn append_leaf(frontier: &mut MerkleFrontier, leaf_count: u64, leaf: [u8; 32]) -> Option<u64> {
    let mut node = leaf;
    let mut occupied = leaf_count;
    let mut level = 0usize;

    while occupied & 1 == 1 {
        if level >= MERKLE_FRONTIER_HEIGHT {
            return None;
        }

        node = hash_internal(&frontier[level], &node);
        frontier[level] = EMPTY_MERKLE_ROOT;
        occupied >>= 1;
        level += 1;
    }

    if level >= MERKLE_FRONTIER_HEIGHT {
        return None;
    }

    frontier[level] = node;
    leaf_count.checked_add(1)
}

pub fn frontier_root(frontier: &MerkleFrontier, leaf_count: u64) -> [u8; 32] {
    if leaf_count == 0 {
        return EMPTY_MERKLE_ROOT;
    }

    let mut root = EMPTY_MERKLE_ROOT;
    let mut has_root = false;
    let mut root_level = 0usize;

    for level in 0..MERKLE_FRONTIER_HEIGHT {
        if (leaf_count >> level) & 1 == 0 {
            continue;
        }

        if !has_root {
            root = frontier[level];
            root_level = level;
            has_root = true;
            continue;
        }

        while root_level < level {
            root = hash_internal(&root, &root);
            root_level += 1;
        }

        root = hash_internal(&frontier[level], &root);
        root_level = level + 1;
    }

    root
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
