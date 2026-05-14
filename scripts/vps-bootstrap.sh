#!/usr/bin/env bash
# =============================================================================
# PROJECT EXTRACTION — VPS bootstrap
# =============================================================================
# Idempotent setup for a fresh Ubuntu 24.04 VPS. Installs Docker, common
# utilities, configures UFW + Docker daemon log rotation, and creates the
# /opt/extraction directory layout.
#
# Run as root (or via sudo):
#
#   curl -fsSL https://raw.githubusercontent.com/<you>/devils-game/main/scripts/vps-bootstrap.sh | sudo bash
#
# Or from a cloned checkout:
#
#   sudo bash scripts/vps-bootstrap.sh
# =============================================================================

set -euo pipefail

INSTALL_ROOT="${INSTALL_ROOT:-/opt/extraction}"

log()  { printf '\033[1;34m[bootstrap]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[bootstrap WARN]\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31m[bootstrap FAIL]\033[0m %s\n' "$*" >&2; exit 1; }

# -----------------------------------------------------------------------------
# 0. Pre-flight
# -----------------------------------------------------------------------------

if [[ "${EUID}" -ne 0 ]]; then
  die "this script must be run as root (try: sudo bash $0)"
fi

# -----------------------------------------------------------------------------
# 1. Detect OS
# -----------------------------------------------------------------------------

log "step 1/9 — detecting OS"
if [[ -r /etc/os-release ]]; then
  # shellcheck disable=SC1091
  . /etc/os-release
  log "detected: ${PRETTY_NAME:-unknown}"
  if [[ "${ID:-}" != "ubuntu" ]]; then
    warn "this script is tuned for Ubuntu; you're running ${ID:-unknown}. proceed with care."
  elif [[ "${VERSION_ID:-}" != "24.04" ]]; then
    warn "expected Ubuntu 24.04, found ${VERSION_ID:-unknown}. should still work but is untested."
  fi
else
  warn "/etc/os-release not found; OS detection skipped"
fi

# -----------------------------------------------------------------------------
# 2. apt update
# -----------------------------------------------------------------------------

log "step 2/9 — updating apt cache"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get upgrade -y

# -----------------------------------------------------------------------------
# 3. Install Docker Engine + compose plugin
# -----------------------------------------------------------------------------

log "step 3/9 — installing Docker Engine + compose plugin"
if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
  log "Docker + compose plugin already installed: $(docker --version)"
else
  apt-get install -y ca-certificates curl gnupg

  install -m 0755 -d /etc/apt/keyrings
  if [[ ! -f /etc/apt/keyrings/docker.gpg ]]; then
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    chmod a+r /etc/apt/keyrings/docker.gpg
  fi

  ARCH="$(dpkg --print-architecture)"
  CODENAME="$(. /etc/os-release && echo "${VERSION_CODENAME}")"
  echo "deb [arch=${ARCH} signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu ${CODENAME} stable" \
    > /etc/apt/sources.list.d/docker.list

  apt-get update -y
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi

# -----------------------------------------------------------------------------
# 4. Install supporting CLI tools
# -----------------------------------------------------------------------------

log "step 4/9 — installing git, sqlite3, ufw, curl, wget"
apt-get install -y git sqlite3 ufw curl wget jq

# -----------------------------------------------------------------------------
# 5. Configure UFW firewall
# -----------------------------------------------------------------------------

log "step 5/9 — configuring UFW (allow 22, 80, 443; deny everything else)"
ufw --force reset >/dev/null
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp  comment 'SSH'
ufw allow 80/tcp  comment 'HTTP (Caddy ACME)'
ufw allow 443/tcp comment 'HTTPS'
ufw allow 443/udp comment 'HTTP/3'
ufw --force enable
ufw status verbose || true

# -----------------------------------------------------------------------------
# 6. Create /opt/extraction/data/ layout
# -----------------------------------------------------------------------------

log "step 6/9 — creating ${INSTALL_ROOT} directory layout"
install -d -m 0700 -o root -g root \
  "${INSTALL_ROOT}" \
  "${INSTALL_ROOT}/data" \
  "${INSTALL_ROOT}/data/voice-cache" \
  "${INSTALL_ROOT}/data/logs" \
  "${INSTALL_ROOT}/data/logs/caddy" \
  "${INSTALL_ROOT}/data/backups"

# Note: SQLite files (operational.db, telemetry.db) are created by the backend
# at first run inside ${INSTALL_ROOT}/data/. No need to pre-create them.

# -----------------------------------------------------------------------------
# 7. Docker daemon log rotation
# -----------------------------------------------------------------------------

log "step 7/9 — configuring Docker daemon log rotation"
install -d -m 0755 /etc/docker
DAEMON_JSON=/etc/docker/daemon.json
DESIRED='{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  },
  "live-restore": true
}'
if [[ ! -f "${DAEMON_JSON}" ]] || ! diff -q <(echo "${DESIRED}") "${DAEMON_JSON}" >/dev/null 2>&1; then
  echo "${DESIRED}" > "${DAEMON_JSON}"
  log "wrote new ${DAEMON_JSON}"
  RESTART_DOCKER=1
else
  log "${DAEMON_JSON} already current"
  RESTART_DOCKER=0
fi

# -----------------------------------------------------------------------------
# 8. Enable Docker on boot + restart if config changed
# -----------------------------------------------------------------------------

log "step 8/9 — enabling Docker systemd unit"
systemctl enable docker
if [[ "${RESTART_DOCKER}" -eq 1 ]]; then
  log "restarting Docker to pick up daemon.json"
  systemctl restart docker
else
  systemctl start docker || true
fi

# -----------------------------------------------------------------------------
# 9. Done — next steps
# -----------------------------------------------------------------------------

log "step 9/9 — bootstrap complete"
cat <<EOF

==============================================================================
 Bootstrap complete.

 Next steps:

   1. Clone the repo into ${INSTALL_ROOT}:
        git clone https://github.com/<you>/devils-game.git ${INSTALL_ROOT}/app
        cd ${INSTALL_ROOT}/app

   2. Create the production env file:
        cp .env.production.example .env.production
        \$EDITOR .env.production            # fill in DOMAIN, ACME_EMAIL, secrets, OPENAI_API_KEY
        chmod 600 .env.production

   3. Create the production Caddyfile:
        cp Caddyfile.example Caddyfile
        \$EDITOR Caddyfile                  # replace extraction.example.com with your domain

   4. Point your DNS A record at this VPS:
        \$(hostname -I | awk '{print \$1}')

   5. Bring up the stack:
        docker compose -f docker-compose.prod.yml up -d --build

   6. Watch Caddy obtain its TLS cert (~30 seconds):
        docker compose -f docker-compose.prod.yml logs -f caddy

   7. Verify:
        curl -fsS https://<your-domain>/health
==============================================================================

EOF
