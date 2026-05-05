# Source this file before running the live society demo, then override the
# public URLs with your current named tunnel or domain.

export SUBSTRATE_SOCIETY_PORT="${SUBSTRATE_SOCIETY_PORT:-4181}"
export SUBSTRATE_RPC_URL="${SUBSTRATE_RPC_URL:-http://127.0.0.1:8898}"
export SUBSTRATE_WS_URL="${SUBSTRATE_WS_URL:-ws://127.0.0.1:8897}"
export SUBSTRATE_SURFPOOL_STUDIO_URL="${SUBSTRATE_SURFPOOL_STUDIO_URL:-http://127.0.0.1:18488}"
export SUBSTRATE_KEYPAIR="${SUBSTRATE_KEYPAIR:-${HOME}/.config/solana/id.json}"

# Public links shown in the browser. Leave blank for local-only runs.
export SUBSTRATE_PUBLIC_SOCIETY_URL="${SUBSTRATE_PUBLIC_SOCIETY_URL:-}"
export SUBSTRATE_PUBLIC_RPC_URL="${SUBSTRATE_PUBLIC_RPC_URL:-}"
export SUBSTRATE_PUBLIC_SURFPOOL_STUDIO_URL="${SUBSTRATE_PUBLIC_SURFPOOL_STUDIO_URL:-}"
