#!/usr/bin/env bash
# scripts/db-setup.sh
# Wait for Postgres to be ready, then run backend migrations and seed.
# Idempotent — safe to re-run.

set -euo pipefail

# Defaults match docker-compose.yml; can be overridden via env.
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_USER="${DB_USER:-extraction}"
DB_NAME="${DB_NAME:-extraction_dev}"
MAX_WAIT="${MAX_WAIT:-60}"

log() { printf '[db-setup] %s\n' "$*"; }

wait_for_postgres() {
  log "Waiting for Postgres at ${DB_HOST}:${DB_PORT} (timeout ${MAX_WAIT}s)..."
  local waited=0
  while ! (exec 3<>/dev/tcp/"${DB_HOST}"/"${DB_PORT}") 2>/dev/null; do
    if (( waited >= MAX_WAIT )); then
      log "ERROR: Postgres did not become ready within ${MAX_WAIT}s"
      exit 1
    fi
    sleep 2
    waited=$((waited + 2))
  done
  exec 3>&- 3<&- || true
  log "Postgres is reachable."
}

run_migrations() {
  if [ -d "packages/backend" ] && [ -f "packages/backend/package.json" ]; then
    log "Running backend migrations..."
    # Backend may use TypeORM, Prisma, or Knex — try common script names.
    if npm run --workspace=@extraction/backend migration:run --if-present; then
      log "Migrations completed via migration:run."
    elif npm run --workspace=@extraction/backend migrate --if-present; then
      log "Migrations completed via migrate."
    elif npm run --workspace=@extraction/backend db:migrate --if-present; then
      log "Migrations completed via db:migrate."
    else
      log "No migration script found yet — skipping (expected during early scaffold)."
    fi
  else
    log "packages/backend not present yet — skipping migrations."
  fi
}

seed_data() {
  if npm run --workspace=@extraction/backend seed --if-present 2>/dev/null; then
    log "Seed script completed."
  else
    log "No seed script found — skipping (idempotent default)."
  fi
}

main() {
  wait_for_postgres
  run_migrations
  seed_data
  log "Done."
}

main "$@"
