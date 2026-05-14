#!/usr/bin/env bash
# =============================================================================
# PROJECT EXTRACTION — SQLite backup
# =============================================================================
# Atomic SQLite snapshots via `VACUUM INTO`. Safe to run while the backend is
# actively writing. Designed to be invoked from cron or manually.
#
#   sudo bash scripts/backup-sqlite.sh
#
# Environment overrides:
#   COMPOSE_FILE   — path to docker-compose.prod.yml   (default: /opt/extraction/app/docker-compose.prod.yml)
#   BACKUP_DIR     — backup root on the host           (default: /opt/extraction/data/backups)
#   KEEP_DAYS      — retention window                  (default: 30)
#   TAR_ARCHIVE    — set to `1` to also produce tar.gz (default: 1)
# =============================================================================

set -euo pipefail

COMPOSE_FILE="${COMPOSE_FILE:-/opt/extraction/app/docker-compose.prod.yml}"
BACKUP_DIR="${BACKUP_DIR:-/opt/extraction/data/backups}"
KEEP_DAYS="${KEEP_DAYS:-30}"
TAR_ARCHIVE="${TAR_ARCHIVE:-1}"

TS="$(date +%Y-%m-%d-%H%M)"
DEST="${BACKUP_DIR}/${TS}"

log()  { printf '\033[1;34m[backup]\033[0m %s\n' "$*"; }
die()  { printf '\033[1;31m[backup FAIL]\033[0m %s\n' "$*" >&2; exit 1; }

# Sanity: compose file must exist
[[ -f "${COMPOSE_FILE}" ]] || die "compose file not found: ${COMPOSE_FILE}"

log "snapshot timestamp: ${TS}"
log "destination:        ${DEST}"
mkdir -p "${DEST}"

# -----------------------------------------------------------------------------
# Snapshot each SQLite database via VACUUM INTO inside the backend container.
# `VACUUM INTO` is atomic and produces a clean copy without WAL/SHM sidecars.
# -----------------------------------------------------------------------------

snapshot_db() {
  local src="$1" name="$2"
  log "snapshotting ${name} (${src})"
  docker compose -f "${COMPOSE_FILE}" exec -T backend \
    sqlite3 "${src}" "VACUUM INTO '/app/data/backups/${TS}/${name}'" \
    || die "VACUUM INTO failed for ${name}"
}

snapshot_db /app/data/operational.db operational.db
snapshot_db /app/data/telemetry.db   telemetry.db

# Verify integrity of both backup copies
for f in operational.db telemetry.db; do
  full="${DEST}/${f}"
  [[ -f "${full}" ]] || die "expected backup not present on host: ${full}"
  result="$(sqlite3 "${full}" "PRAGMA integrity_check;" || echo "ERROR")"
  if [[ "${result}" != "ok" ]]; then
    die "integrity check failed for ${full}: ${result}"
  fi
  size="$(du -h "${full}" | cut -f1)"
  log "  ✓ ${f} ${size} integrity=ok"
done

# -----------------------------------------------------------------------------
# Optional tar.gz
# -----------------------------------------------------------------------------

if [[ "${TAR_ARCHIVE}" == "1" ]]; then
  tarball="${BACKUP_DIR}/${TS}.tar.gz"
  log "tar+gzip snapshot to ${tarball}"
  tar -C "${BACKUP_DIR}" -czf "${tarball}" "${TS}"
  log "  ✓ $(du -h "${tarball}" | cut -f1)"
fi

# -----------------------------------------------------------------------------
# Retention: prune anything older than KEEP_DAYS days
# -----------------------------------------------------------------------------

log "pruning backups older than ${KEEP_DAYS} days"
find "${BACKUP_DIR}" -mindepth 1 -maxdepth 1 \( -type d -o -name '*.tar.gz' \) \
  -mtime "+${KEEP_DAYS}" -print -exec rm -rf {} +

log "backup complete: ${DEST}"
