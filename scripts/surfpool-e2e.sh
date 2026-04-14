#!/usr/bin/env bash

set -euo pipefail
IFS=$'\n\t'

readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
readonly ANCHOR_WALLET_PATH="${ANCHOR_WALLET:-${HOME}/.config/solana/id.json}"
readonly TEST_RUN_PATH="${1:-tests/*.ts}"
readonly ANCHOR_BUILD_TARGET_DIR="${ANCHOR_BUILD_TARGET_DIR:-/tmp/trust-substrate-surfpool-build}"

log() {
  printf '[surfpool-e2e] %s\n' "$*"
}

cd "${REPO_ROOT}"

export ANCHOR_WALLET="${ANCHOR_WALLET_PATH}"

log "building Anchor workspace"
CARGO_TARGET_DIR="${ANCHOR_BUILD_TARGET_DIR}" anchor build --ignore-keys

log "running Anchor tests on Surfpool: ${TEST_RUN_PATH}"
ANCHOR_TEST_RUN="${TEST_RUN_PATH}" anchor test \
  --skip-build \
  --skip-lint \
  --validator surfpool \
  --provider.wallet "${ANCHOR_WALLET_PATH}"
