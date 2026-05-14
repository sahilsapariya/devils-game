#!/usr/bin/env bash
# scripts/build-all.sh
# Build every package in dependency order. Turbo handles the DAG; this script
# wraps it with friendly logging plus a desktop-agent (Go) build pass.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

log() { printf '[build-all] %s\n' "$*"; }

log "Building TypeScript packages via turbo (shared -> backend -> mobile -> extension)..."
npm run build

if [ -d "packages/desktop-agent" ] && [ -f "packages/desktop-agent/go.mod" ]; then
  log "Building desktop-agent (Go)..."
  (
    cd "$ROOT/packages/desktop-agent"
    mkdir -p bin
    go build -v -o bin/desktop-agent ./...
  )
else
  log "packages/desktop-agent not found — skipping."
fi

log "All builds complete."
