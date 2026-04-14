#!/usr/bin/env bash

set -euo pipefail
IFS=$'\n\t'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly SCRIPT_DIR
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
readonly REPO_ROOT
readonly ANCHOR_WALLET_PATH="${ANCHOR_WALLET:-${HOME}/.config/solana/id.json}"
readonly TEST_RUN_PATH="${1:-tests/*.ts}"
readonly ANCHOR_BUILD_TARGET_DIR="${ANCHOR_BUILD_TARGET_DIR:-${REPO_ROOT}/target/surfpool-build}"
readonly SURFPOOL_HOST="${SURFPOOL_HOST:-127.0.0.1}"
readonly SURFPOOL_PORT="${SURFPOOL_PORT:-8899}"
readonly SURFPOOL_WS_PORT="${SURFPOOL_WS_PORT:-8900}"
readonly SURFPOOL_RPC_URL="${SURFPOOL_RPC_URL:-http://${SURFPOOL_HOST}:${SURFPOOL_PORT}}"
readonly SURFPOOL_LOG_DIR="${SURFPOOL_LOG_DIR:-${REPO_ROOT}/.surfpool/logs}"
readonly SURFPOOL_STARTUP_WAIT_SECONDS="${SURFPOOL_STARTUP_WAIT_SECONDS:-60}"

surfpool_pid=""
surfpool_log_file=""

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

rpc_ready() {
  local response

  response="$(curl -fsS \
    -H 'content-type: application/json' \
    --data '{"jsonrpc":"2.0","id":1,"method":"getLatestBlockhash"}' \
    "${SURFPOOL_RPC_URL}" 2>/dev/null || true)"

  [[ "${response}" == *'"result"'* ]]
}

print_surfpool_log_tail() {
  if [[ -n "${surfpool_log_file}" && -f "${surfpool_log_file}" ]]; then
    log "last Surfpool log lines from ${surfpool_log_file}"
    tail -n 80 "${surfpool_log_file}" || true
  fi
}

cleanup() {
  local waited_seconds

  if [[ -n "${surfpool_pid}" ]] && kill -0 "${surfpool_pid}" 2>/dev/null; then
    log "stopping Surfpool pid ${surfpool_pid}"
    kill "${surfpool_pid}" 2>/dev/null || true

    for ((waited_seconds = 0; waited_seconds < 5; waited_seconds += 1)); do
      if ! kill -0 "${surfpool_pid}" 2>/dev/null; then
        wait "${surfpool_pid}" 2>/dev/null || true
        return
      fi
      sleep 1
    done

    log "force-stopping Surfpool pid ${surfpool_pid}"
    kill -9 "${surfpool_pid}" 2>/dev/null || true
    wait "${surfpool_pid}" 2>/dev/null || true
  fi
}

start_surfpool() {
  local waited_seconds

  if rpc_ready; then
    log "using existing Surfpool-compatible RPC at ${SURFPOOL_RPC_URL}"
    return
  fi

  mkdir -p "${SURFPOOL_LOG_DIR}"
  surfpool_log_file="${SURFPOOL_LOG_DIR}/surfpool-e2e.$(date +%Y%m%d%H%M%S).log"

  log "starting Surfpool at ${SURFPOOL_RPC_URL}"
  surfpool start \
    --host "${SURFPOOL_HOST}" \
    --port "${SURFPOOL_PORT}" \
    --ws-port "${SURFPOOL_WS_PORT}" \
    --no-tui \
    --ci \
    --offline \
    --legacy-anchor-compatibility \
    --airdrop-keypair-path "${ANCHOR_WALLET_PATH}" \
    --log-path "${SURFPOOL_LOG_DIR}" \
    >"${surfpool_log_file}" 2>&1 &
  surfpool_pid="$!"

  for ((waited_seconds = 0; waited_seconds < SURFPOOL_STARTUP_WAIT_SECONDS; waited_seconds += 1)); do
    if rpc_ready; then
      log "Surfpool RPC is ready"
      return
    fi

    if ! kill -0 "${surfpool_pid}" 2>/dev/null; then
      print_surfpool_log_tail
      die "Surfpool exited before RPC became ready"
    fi

    sleep 1
  done

  print_surfpool_log_tail
  die "Surfpool RPC was not ready after ${SURFPOOL_STARTUP_WAIT_SECONDS}s"
}

trap cleanup EXIT

cd "${REPO_ROOT}"

require_command anchor
require_command curl
require_command surfpool

[[ -f "${ANCHOR_WALLET_PATH}" ]] || die "wallet not found at ${ANCHOR_WALLET_PATH}"

export ANCHOR_WALLET="${ANCHOR_WALLET_PATH}"

log "building Anchor workspace"
CARGO_TARGET_DIR="${ANCHOR_BUILD_TARGET_DIR}" anchor build --ignore-keys

start_surfpool

log "running Anchor tests on Surfpool: ${TEST_RUN_PATH}"
ANCHOR_TEST_RUN="${TEST_RUN_PATH}" anchor test \
  --skip-build \
  --skip-lint \
  --skip-local-validator \
  --skip-deploy \
  --provider.cluster "${SURFPOOL_RPC_URL}" \
  --provider.wallet "${ANCHOR_WALLET_PATH}"
