#!/usr/bin/env bash

set -euo pipefail
IFS=$'\n\t'

readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
readonly DEFAULT_SURFPOOL_RPC_URL="http://127.0.0.1:8899"
readonly SURFPOOL_RPC_URL="${SURFPOOL_RPC_URL:-${DEFAULT_SURFPOOL_RPC_URL}}"
readonly SURFPOOL_HOST="${SURFPOOL_HOST:-127.0.0.1}"
readonly SURFPOOL_PORT="${SURFPOOL_PORT:-8899}"
readonly SURFPOOL_WS_PORT="${SURFPOOL_WS_PORT:-8900}"
readonly SURFPOOL_LOG_DIR="${SURFPOOL_LOG_DIR:-${REPO_ROOT}/.surfpool/logs}"
readonly SURFPOOL_MANIFEST_PATH="${SURFPOOL_MANIFEST_PATH:-${REPO_ROOT}/tests/surfpool/txtx.yml}"
readonly ANCHOR_WALLET_PATH="${ANCHOR_WALLET:-${HOME}/.config/solana/id.json}"

started_surfpool=false
surfpool_pid=""
surfpool_log_file=""

log() {
  printf '[surfpool-e2e] %s\n' "$*"
}

rpc_health_check() {
  local rpc_url="$1"

  curl --silent --show-error --fail --max-time 2 \
    --header 'Content-Type: application/json' \
    --data '{"jsonrpc":"2.0","id":1,"method":"getHealth"}' \
    "${rpc_url}" | grep -q '"result":"ok"'
}

wait_for_rpc() {
  local rpc_url="$1"
  local attempt=0
  local max_attempts=60

  until rpc_health_check "${rpc_url}"; do
    attempt=$((attempt + 1))
    if (( attempt >= max_attempts )); then
      return 1
    fi
    sleep 1
  done
}

wait_for_tcp_port() {
  local host="$1"
  local port="$2"
  local attempt=0
  local max_attempts=60

  until nc -z "${host}" "${port}" >/dev/null 2>&1; do
    attempt=$((attempt + 1))
    if (( attempt >= max_attempts )); then
      return 1
    fi
    sleep 1
  done
}

terminate_process_tree() {
  local pid="$1"
  local child_pids

  child_pids="$(pgrep -P "${pid}" 2>/dev/null || true)"
  for child_pid in ${child_pids}; do
    terminate_process_tree "${child_pid}"
  done

  kill -TERM "${pid}" 2>/dev/null || true
  sleep 1
  if kill -0 "${pid}" 2>/dev/null; then
    kill -KILL "${pid}" 2>/dev/null || true
  fi
  wait "${pid}" 2>/dev/null || true
}

cleanup() {
  if [[ "${started_surfpool}" == "true" && -n "${surfpool_pid}" ]]; then
    if kill -0 "${surfpool_pid}" 2>/dev/null; then
      log "stopping Surfpool process ${surfpool_pid}"
      terminate_process_tree "${surfpool_pid}"
    fi
  fi

  if [[ -n "${surfpool_log_file}" && -f "${surfpool_log_file}" ]]; then
    log "Surfpool logs: ${surfpool_log_file}"
  fi
}

trap cleanup EXIT INT TERM

cd "${REPO_ROOT}"

log "building Anchor workspace"
anchor build

export ANCHOR_PROVIDER_URL="${SURFPOOL_RPC_URL}"
export ANCHOR_WALLET="${ANCHOR_WALLET_PATH}"

if rpc_health_check "${SURFPOOL_RPC_URL}"; then
  log "reusing existing Surfpool endpoint at ${SURFPOOL_RPC_URL}"
else
  if [[ "${SURFPOOL_RPC_URL}" != "${DEFAULT_SURFPOOL_RPC_URL}" ]]; then
    log "Surfpool is not running at ${SURFPOOL_RPC_URL}"
    log "start it manually and re-run this harness, or use the default local endpoint ${DEFAULT_SURFPOOL_RPC_URL}"
    exit 1
  fi

  log "starting Surfpool at ${SURFPOOL_RPC_URL}"
  mkdir -p "${SURFPOOL_LOG_DIR}"
  surfpool_log_file="$(mktemp "${SURFPOOL_LOG_DIR}/surfpool-e2e.XXXXXX")"

  if [[ -f "${SURFPOOL_MANIFEST_PATH}" ]]; then
    log "using Surfpool manifest ${SURFPOOL_MANIFEST_PATH}"
    surfpool start \
      --manifest-file-path "${SURFPOOL_MANIFEST_PATH}" \
      --host "${SURFPOOL_HOST}" \
      --port "${SURFPOOL_PORT}" \
      --ws-port "${SURFPOOL_WS_PORT}" \
      --ci \
      --legacy-anchor-compatibility \
      --no-tui \
      --no-studio \
      --offline \
      --log-path "${SURFPOOL_LOG_DIR}" \
      >"${surfpool_log_file}" 2>&1 &
  else
    log "Surfpool manifest not found at ${SURFPOOL_MANIFEST_PATH}; starting against the default local endpoint contract"
    surfpool start \
      --host "${SURFPOOL_HOST}" \
      --port "${SURFPOOL_PORT}" \
      --ws-port "${SURFPOOL_WS_PORT}" \
      --ci \
      --legacy-anchor-compatibility \
      --no-tui \
      --no-studio \
      --offline \
      --log-path "${SURFPOOL_LOG_DIR}" \
      >"${surfpool_log_file}" 2>&1 &
  fi

  surfpool_pid="$!"
  started_surfpool=true

  if ! wait_for_rpc "${SURFPOOL_RPC_URL}"; then
    log "Surfpool did not become healthy"
    if [[ -f "${surfpool_log_file}" ]]; then
      tail -n 200 "${surfpool_log_file}" >&2 || true
    fi
    exit 1
  fi

  if ! wait_for_tcp_port "${SURFPOOL_HOST}" "${SURFPOOL_WS_PORT}"; then
    log "Surfpool websocket port ${SURFPOOL_WS_PORT} did not become ready"
    if [[ -f "${surfpool_log_file}" ]]; then
      tail -n 200 "${surfpool_log_file}" >&2 || true
    fi
    exit 1
  fi
fi

log "running Anchor tests against ${SURFPOOL_RPC_URL}"
if ! anchor test \
  --skip-build \
  --skip-deploy \
  --skip-lint \
  --skip-local-validator \
  --provider.cluster "${SURFPOOL_RPC_URL}" \
  --provider.wallet "${ANCHOR_WALLET_PATH}"; then
  log "Anchor tests against Surfpool did not complete"
  log "Surfpool started, but the Anchor suite under tests/*.ts failed"
  exit 1
fi
