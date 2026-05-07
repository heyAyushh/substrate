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

# Keep live write routes local by default. Set this only for an intentional
# public demo where anyone with the URL may advance the local Surfpool session.
export SUBSTRATE_ALLOW_PUBLIC_LIVE_MUTATION="${SUBSTRATE_ALLOW_PUBLIC_LIVE_MUTATION:-0}"

# Optional Pi action prompts. Disabled by default so Go live / Step / Play do
# not spend model tokens unless you intentionally enable them.
export SUBSTRATE_SOCIETY_PI_ACTIONS="${SUBSTRATE_SOCIETY_PI_ACTIONS:-0}"
export SUBSTRATE_SOCIETY_PI_RUNTIME_URL="${SUBSTRATE_SOCIETY_PI_RUNTIME_URL:-http://127.0.0.1:5173}"
export SUBSTRATE_SOCIETY_PI_PROVIDER="${SUBSTRATE_SOCIETY_PI_PROVIDER:-openai-codex}"
export SUBSTRATE_SOCIETY_PI_MODEL="${SUBSTRATE_SOCIETY_PI_MODEL:-gpt-5.4-mini}"
