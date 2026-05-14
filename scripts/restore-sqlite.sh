#!/usr/bin/env bash
# =============================================================================
# PROJECT EXTRACTION — SQLite restore
# =============================================================================
# Restore both SQLite databases from a previously created backup directory.
# The backend container is stopped during the restore to avoid races; the
# WAL/SHM sidecars are removed before copying, then the container is started
# back up and the health endpoint is verified.
#
#   sudo bash scripts/restore-sqlite.sh /opt/extraction/data/backups/2026-05-15-0200
#
# Environment overrides:
#   COMPOSE_FILE — path to docker-compose.prod.yml (default: /opt/extraction/app/docker-compose.prod.yml)
#   DATA_DIR     — host data dir                   (default: /opt/extraction/data)
#   DOMAIN       — used by the health probe        (default: read from .env.production if present)
# =============================================================================

set -euo pipefail

if [[ "$#" -ne 1 ]]; then
  echo "usage: $0 <backup-dir>" >&2
  echo "       (backup-dir must contain operational.db and telemetry.db)" >&2
  exit 2
fi

BACKUP_DIR="$1"
COMPOSE_FILE="${COMPOSE_FILE:-/opt/extraction/app/docker-compose.prod.yml}"
DATA_DIR="${DATA_DIR:-/opt/extraction/data}"

log()  { printf '\033[1;34m[restore]\033[0m %s\n' "$*"; }
die()  { printf '\033[1;31m[restore FAIL]\033[0m %s\n' "$*" >&2; exit 1; }

# -----------------------------------------------------------------------------
# 1. Validate inputs
# -----------------------------------------------------------------------------

[[ -d "${BACKUP_DIR}" ]] || die "backup directory not found: ${BACKUP_DIR}"
[[ -f "${COMPOSE_FILE}" ]] || die "compose file not found: ${COMPOSE_FILE}"

for f in operational.db telemetry.db; do
  src="${BACKUP_DIR}/${f}"
  [[ -f "${src}" ]] || die "missing backup file: ${src}"

  log "integrity check: ${src}"
  result="$(sqlite3 "${src}" "PRAGMA integrity_check;" || echo "ERROR")"
  [[ "${result}" == "ok" ]] || die "integrity check failed for ${src}: ${result}"
  log "  ✓ ok"
done

# -----------------------------------------------------------------------------
# 2. Stop backend
# -----------------------------------------------------------------------------

log "stopping backend container"
docker compose -f "${COMPOSE_FILE}" stop backend

# -----------------------------------------------------------------------------
# 3. Replace live DB files
# -----------------------------------------------------------------------------

for f in operational.db telemetry.db; do
  log "restoring ${f}"
  # Drop the WAL/SHM sidecars first so SQLite doesn't try to replay stale logs.
  rm -f "${DATA_DIR}/${f}-wal" "${DATA_DIR}/${f}-shm"
  cp -f "${BACKUP_DIR}/${f}" "${DATA_DIR}/${f}"
  log "  ✓ wrote ${DATA_DIR}/${f}"
done

# -----------------------------------------------------------------------------
# 4. Restart backend
# -----------------------------------------------------------------------------

log "starting backend container"
docker compose -f "${COMPOSE_FILE}" start backend

# -----------------------------------------------------------------------------
# 5. Verify /health (over Caddy if DOMAIN known; otherwise over the container)
# -----------------------------------------------------------------------------

# Try to discover the public DOMAIN from .env.production for an end-to-end probe
if [[ -z "${DOMAIN:-}" ]]; then
  ENV_FILE="$(dirname "${COMPOSE_FILE}")/.env.production"
  if [[ -f "${ENV_FILE}" ]]; then
    DOMAIN="$(grep -E '^DOMAIN=' "${ENV_FILE}" | head -n1 | cut -d= -f2- | tr -d '\r\n' || true)"
  fi
fi

log "waiting for backend /health"
HEALTH_OK=0
for i in $(seq 1 30); do
  if docker compose -f "${COMPOSE_FILE}" exec -T backend \
      wget --no-verbose --tries=1 --spider http://localhost:3001/health >/dev/null 2>&1; then
    HEALTH_OK=1
    log "  ✓ /health responding (attempt ${i})"
    break
  fi
  sleep 2
done

[[ "${HEALTH_OK}" -eq 1 ]] || die "backend /health did not come up within 60s"

if [[ -n "${DOMAIN:-}" ]]; then
  log "extra check: public probe https://${DOMAIN}/health"
  if curl -fsS --max-time 10 "https://${DOMAIN}/health" >/dev/null; then
    log "  ✓ public /health 200"
  else
    log "  ! public probe failed (DNS/TLS may need a moment); local health is OK"
  fi
fi

log "restore complete"
