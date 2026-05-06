#!/usr/bin/env bash

set -euo pipefail
IFS=$'\n\t'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly SCRIPT_DIR
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
readonly REPO_ROOT
readonly ANCHOR_WALLET_PATH="${ANCHOR_WALLET:-${HOME}/.config/solana/id.json}"
readonly TEST_RUN_PATH="${1:-tests/*.ts tests/surfpool/pi_extension_e2e.test.ts}"
readonly ANCHOR_BUILD_TARGET_DIR="${ANCHOR_BUILD_TARGET_DIR:-${REPO_ROOT}/target/surfpool-build}"

log() {
  printf '[surfpool-e2e] %s\n' "$*"
}

die() {
  log "error: $*"
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || die "missing required command: $1"
}

cd "${REPO_ROOT}"

require_command anchor
require_command pnpm

[[ -f "${ANCHOR_WALLET_PATH}" ]] || die "wallet not found at ${ANCHOR_WALLET_PATH}"

export ANCHOR_WALLET="${ANCHOR_WALLET_PATH}"
export SUBSTRATE_KEYPAIR="${SUBSTRATE_KEYPAIR:-${ANCHOR_WALLET_PATH}}"

log "building TypeScript packages for Surfpool E2E"
pnpm --filter @trust-substrate/sdk build
pnpm --filter @trust-substrate/indexer build
pnpm --filter @trust-substrate/pi-extension build

log "running Anchor Surfpool suite: ${TEST_RUN_PATH}"
CARGO_TARGET_DIR="${ANCHOR_BUILD_TARGET_DIR}" \
ANCHOR_TEST_RUN="${TEST_RUN_PATH}" \
anchor test \
  --skip-lint \
  --validator surfpool
