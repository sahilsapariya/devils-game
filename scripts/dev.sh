#!/usr/bin/env bash
# scripts/dev.sh
# Bring up the local dev stack: docker services + turbo dev.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

log() { printf '[dev] %s\n' "$*"; }

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    log "ERROR: required command '$1' not found in PATH"
    exit 1
  fi
}

require_cmd docker
require_cmd npm

# Prefer `docker compose` (v2); fall back to `docker-compose`.
if docker compose version >/dev/null 2>&1; then
  COMPOSE=(docker compose)
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE=(docker-compose)
else
  log "ERROR: neither 'docker compose' nor 'docker-compose' is available"
  exit 1
fi

log "Starting infra services (postgres, redis)..."
"${COMPOSE[@]}" up -d postgres redis

log "Waiting for services to report healthy..."
deadline=$(( $(date +%s) + 60 ))
while :; do
  unhealthy=$("${COMPOSE[@]}" ps --format json 2>/dev/null \
    | grep -c '"Health":"unhealthy"\|"Health":"starting"' || true)
  if [ "${unhealthy:-0}" = "0" ]; then
    break
  fi
  if [ "$(date +%s)" -ge "$deadline" ]; then
    log "WARN: services not healthy within 60s; continuing anyway"
    break
  fi
  sleep 2
done

log "Setting up database..."
bash "$ROOT/scripts/db-setup.sh" || log "db-setup encountered issues; continuing"

log "Starting all packages via turbo..."
exec npm run dev
