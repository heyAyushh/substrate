#!/usr/bin/env bash
set -euo pipefail

SNAPSHOT_SOURCE="${TRUST_SUBSTRATE_SNAPSHOT_SOURCE:-examples/agent_loop/.snapshot/indexer.json}"
ARCHIVE_DIR="${TRUST_SUBSTRATE_ARCHIVE_DIR:-examples/agent_loop/.snapshot/archive}"
ARCHIVE_RETENTION="${TRUST_SUBSTRATE_ARCHIVE_RETENTION:-10}"

if [[ ! "$ARCHIVE_RETENTION" =~ ^[0-9]+$ ]] || [[ "$ARCHIVE_RETENTION" -lt 1 ]]; then
  echo "TRUST_SUBSTRATE_ARCHIVE_RETENTION must be a positive integer" >&2
  exit 1
fi

if [[ ! -f "$SNAPSHOT_SOURCE" ]]; then
  echo "Snapshot source not found: $SNAPSHOT_SOURCE" >&2
  exit 1
fi

mkdir -p "$ARCHIVE_DIR"

timestamp="$(date -u +"%Y-%m-%dT%H-%M-%SZ")"
destination="$ARCHIVE_DIR/indexer-$timestamp-$$.json"
cp "$SNAPSHOT_SOURCE" "$destination"

archive_count="$(find "$ARCHIVE_DIR" -maxdepth 1 -type f -name 'indexer-*.json' | wc -l | tr -d ' ')"
remove_count=$((archive_count - ARCHIVE_RETENTION))

if [[ "$remove_count" -gt 0 ]]; then
  removed=0
  while IFS= read -r archive_file; do
    if [[ "$removed" -ge "$remove_count" ]]; then
      break
    fi
    rm "$archive_file"
    removed=$((removed + 1))
  done < <(find "$ARCHIVE_DIR" -maxdepth 1 -type f -name 'indexer-*.json' | sort)
fi

echo "$destination"
