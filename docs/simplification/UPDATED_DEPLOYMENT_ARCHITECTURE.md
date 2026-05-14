# UPDATED DEPLOYMENT ARCHITECTURE

The new deployment architecture: **one VPS, three containers, automatic HTTPS**.

---

## TARGET ARCHITECTURE

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                  │
│    Operator (single user)                                        │
│                                                                  │
└──────────┬──────────────────┬─────────────────────┬─────────────┘
           │                  │                     │
   HTTPS / WSS         HTTPS / WSS              HTTPS
           │                  │                     │
   ┌───────▼──────┐    ┌──────▼──────┐      ┌───────▼────────┐
   │ Mobile App   │    │ Desktop     │      │ Browser        │
   │ (RN, phone)  │    │ Agent (Go)  │      │ Extension      │
   │              │    │ runs on the │      │ (Manifest V3,  │
   │              │    │ operator's  │      │ on the         │
   │              │    │ laptop)     │      │ operator's     │
   │              │    │             │      │ browser)       │
   └──────┬───────┘    └──────┬──────┘      └────────┬───────┘
          │                   │                      │
          └─────────────┬─────┴──────────────────────┘
                        │
                        │  HTTPS / WSS
                        │  to https://<your-domain>
                        │
            ┌───────────▼─────────────────────────┐
            │                                      │
            │   VPS (e.g. Hetzner CPX11, $5/mo)   │
            │   Ubuntu 24.04 + Docker            │
            │                                      │
            │   ┌──────────────────────────────┐  │
            │   │  Caddy (reverse proxy)       │  │
            │   │  :80, :443                   │  │
            │   │  Auto Let's Encrypt          │  │
            │   └──────┬───────────────┬───────┘  │
            │          │               │          │
            │   /api/* │   /ai-int/*   │          │
            │          │               │          │
            │   ┌──────▼─────┐  ┌──────▼─────┐    │
            │   │  Backend   │  │ AI Service │    │
            │   │  NestJS    │  │ NestJS     │    │
            │   │  :3001     │  │ :4001      │    │
            │   │            │  │            │    │
            │   │ SQLite     │  │ Voice      │    │
            │   │ + in-mem   │  │ cache      │    │
            │   │ + Socket.io│  │ (local FS) │    │
            │   └──────┬─────┘  └──────┬─────┘    │
            │          │               │          │
            │   ┌──────▼───────────────▼──────┐   │
            │   │   Host volumes              │   │
            │   │   ./data/operational.db     │   │
            │   │   ./data/telemetry.db       │   │
            │   │   ./data/voice-cache/       │   │
            │   │   ./data/logs/              │   │
            │   └─────────────────────────────┘   │
            │                                      │
            └────────────────┬─────────────────────┘
                             │
                             │  HTTPS
                             │
                  ┌──────────▼────────────┐
                  │  OpenAI API           │
                  │  (gpt-5.4-nano)       │
                  │  (cloud, external)    │
                  └───────────────────────┘
```

That's it. No Kubernetes, no managed Postgres, no Redis cluster, no observability stack, no load balancer service, no multi-region anything.

---

## CONTAINER INVENTORY

Three containers run on the VPS:

| Container | Image | Resource budget | Purpose |
|---|---|---|---|
| `caddy` | `caddy:2-alpine` | ~20 MB RAM | TLS termination, reverse proxy, automatic certificate issuance |
| `backend` | built locally or `ghcr.io/<you>/extraction-backend:latest` | ~150 MB RAM | NestJS, SQLite, in-memory cache & event bus, Socket.io |
| `ai-service` | built locally or `ghcr.io/<you>/extraction-ai-service:latest` | ~120 MB RAM | NestJS, OpenAI client, ElevenLabs client (optional), voice cache |

**Total VPS load:** ~300 MB RAM, < 0.5 vCPU at idle, brief spikes during AI calls. Fits comfortably in a 2 GB / 2 vCPU instance with massive headroom.

---

## NETWORK TOPOLOGY

### Public-facing

- Port `80` (HTTP) — only used by Caddy for ACME HTTP-01 challenge; redirects to HTTPS
- Port `443` (HTTPS / WSS) — all real traffic

All other ports are firewalled (Docker doesn't publish them).

### Internal Docker network

- Backend listens on `:3001` inside its container
- AI service listens on `:4001` inside its container
- Caddy reaches them by service name (`backend:3001`, `ai-service:4001`) via Docker's default bridge network
- Neither service exposes its port to the host

### Caddy routing

A single domain (e.g., `extraction.example.com`) handles everything:

```
https://extraction.example.com/api/*              → backend:3001
https://extraction.example.com/operational (WS)   → backend:3001/operational
https://extraction.example.com/ai-internal/*      → ai-service:4001/internal/*
https://extraction.example.com/health             → backend:3001/health
```

The `ai-internal` path is **not** publicly reachable in practice because:
1. It requires the `X-Internal-Token` header (shared secret in env)
2. Only the backend (running on the same Docker network) actually calls it — backend uses the internal Docker DNS name `http://ai-service:4001/internal/...` directly, bypassing Caddy entirely

Why route AI service through Caddy at all? For optional debugging from outside. Can be removed if you want it strictly internal.

---

## DATA PERSISTENCE

Everything that matters lives in **host-mounted volumes**:

```
/opt/extraction/data/
├── operational.db            # SQLite — users, missions, rounds, events
├── operational.db-wal        # SQLite WAL log
├── operational.db-shm        # SQLite shared-mem index
├── telemetry.db              # SQLite — telemetry events
├── telemetry.db-wal
├── telemetry.db-shm
├── voice-cache/              # AI service voice MP3 cache
│   ├── <hash1>.mp3
│   └── <hash2>.mp3
├── logs/                     # Optional container log archive
│   ├── backend-2026-05-15.log
│   └── ai-service-2026-05-15.log
└── caddy/
    ├── caddy_data/           # Caddy storage (certs, ACME state)
    └── caddy_config/         # Caddy runtime config
```

A single nightly `tar.gz` of `/opt/extraction/data/` is sufficient backup.

---

## DEPLOYMENT PROCESS

### First-time setup (~15 minutes)

1. SSH to VPS
2. Run `scripts/vps-bootstrap.sh` (installs Docker, creates `/opt/extraction/`, opens firewall ports)
3. `git clone` the repo onto the VPS
4. Edit `/opt/extraction/.env.production`
5. `docker compose -f docker-compose.prod.yml up -d`
6. Wait ~30 seconds for Caddy to provision TLS cert from Let's Encrypt
7. `curl https://<your-domain>/health` should return 200

### Updates (after first deploy)

```bash
ssh vps "cd /opt/extraction && git pull && docker compose -f docker-compose.prod.yml up -d --build"
```

Or, with prebuilt images pushed to a registry:
```bash
ssh vps "cd /opt/extraction && docker compose -f docker-compose.prod.yml pull && docker compose -f docker-compose.prod.yml up -d"
```

### Backups

```bash
ssh vps "/opt/extraction/scripts/backup-sqlite.sh"
# → /opt/extraction/data/backups/YYYY-MM-DD/operational.db, telemetry.db
```

Optional: nightly cron job pushes the backup tarball to a remote storage provider via `rclone`.

---

## SECURITY POSTURE

| Concern | Mitigation |
|---|---|
| SSH brute force | UFW firewall allows SSH only from specified IPs (or use fail2ban + SSH keys) |
| Backend exposed to internet | Behind Caddy, TLS only; JWT-guarded endpoints |
| AI service exposed | `X-Internal-Token` header + Docker network isolation (Caddy can be removed from its route entirely if not needed externally) |
| SQLite file leaked | Restrict `/opt/extraction/data` to root:root mode 0700 on the VPS |
| OpenAI API key leaked | Stored in `.env.production` file readable only by root |
| HMAC key compromise | Per-device, generated locally; revocable via `agent reset` and re-enrollment |
| TLS cert | Caddy auto-renews via Let's Encrypt every 60 days |
| Container escape | Non-root users in backend + ai-service Dockerfiles; read-only filesystem where possible |
| Telemetry spoofing | HMAC verification flag (enable in `.env.production` once device registration is wired) |

---

## DISASTER RECOVERY

### If the VPS dies

1. Provision a new VPS (same OS)
2. Restore `/opt/extraction/data/` from most recent backup
3. Re-run `scripts/vps-bootstrap.sh`
4. `docker compose -f docker-compose.prod.yml up -d`
5. Update DNS to point at new VPS IP
6. Wait for Caddy to re-issue cert
7. Operator's mobile app reconnects automatically (clients are pull-based on backend availability)

**Total recovery time:** 20-30 minutes including DNS propagation.

### If a container dies

Docker Compose `restart: unless-stopped` policy automatically restarts. Healthchecks detect persistent failure within ~30 seconds.

### If SQLite file corrupts

Restore from backup. Use `sqlite3 db_file 'PRAGMA integrity_check;'` to verify.

---

## OBSERVABILITY (LIGHTWEIGHT)

No OTEL, no Sentry, no Prometheus. Instead:

| Signal | Where to look |
|---|---|
| Backend logs | `docker compose -f docker-compose.prod.yml logs backend` (live), `/opt/extraction/data/logs/backend-*.log` (archived if logrotate is set up) |
| AI service logs | `docker compose logs ai-service` |
| Caddy access logs | `docker compose logs caddy` |
| Operational audit trail | SQLite `operational_logs` table — `sqlite3 operational.db "SELECT * FROM operational_logs ORDER BY created_at DESC LIMIT 50;"` |
| Behavioral history | SQLite `events` table |
| Resource usage | `docker stats` |
| Disk usage | `du -sh /opt/extraction/data` |

If anything breaks, SSH in and grep logs. For a single-user system, this is **sufficient**. No dashboards required.

---

## WHAT THIS REPLACES

| Old plan | New plan |
|---|---|
| AWS EKS / GCP GKE / DigitalOcean Kubernetes ($30+/month base) | One VPS ($5/month) |
| Managed PostgreSQL (RDS $20+/month) | SQLite (free) |
| Managed Redis cluster (ElastiCache $15+/month) | In-memory Map + EventEmitter (free) |
| Application Load Balancer + ACM TLS ($20+/month) | Caddy with auto Let's Encrypt (free) |
| External Secrets Operator + Vault | `.env.production` file on the VPS (root-readable only) |
| Argo Rollouts + canary deploys | `docker compose up -d --build` |
| Prometheus + Grafana + Sentry + Datadog ($30-100+/month) | `docker compose logs` + SQLite audit table (free) |
| CI/CD with cluster apply | CI/CD with `ssh && git pull && compose up` |
| Multi-region failover | Daily backups + manual restore (acceptable for personal use) |

---

## DETAILED COMPOSE FILE

See `docker-compose.prod.yml` (generated by Subagent INFRA-VPS):

```yaml
version: '3.9'

services:
  caddy:
    image: caddy:2-alpine
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
      - caddy_config:/config
    depends_on:
      - backend
      - ai-service
    networks:
      - extraction

  backend:
    image: extraction-backend:latest
    build:
      context: .
      dockerfile: Dockerfile.backend
    restart: unless-stopped
    env_file:
      - .env.production
    volumes:
      - ./data:/app/data
    expose:
      - "3001"
    networks:
      - extraction
    healthcheck:
      test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://localhost:3001/health"]
      interval: 30s
      timeout: 5s
      retries: 3

  ai-service:
    image: extraction-ai-service:latest
    build:
      context: .
      dockerfile: packages/ai-service/Dockerfile
    restart: unless-stopped
    env_file:
      - .env.production
    volumes:
      - ./data/voice-cache:/app/voice-cache
    expose:
      - "4001"
    networks:
      - extraction
    healthcheck:
      test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://localhost:4001/health"]
      interval: 30s
      timeout: 5s
      retries: 3

networks:
  extraction:
    driver: bridge

volumes:
  caddy_data:
  caddy_config:
```

---

## CADDYFILE

Single-domain example:

```caddy
extraction.example.com {
    # Reverse proxy for the backend API
    handle /api/* {
        reverse_proxy backend:3001
    }

    # Socket.io upgrade for the operational namespace
    handle /operational/* {
        reverse_proxy backend:3001 {
            transport http {
                versions h1
            }
        }
    }

    # Backend health (publicly accessible)
    handle /health {
        reverse_proxy backend:3001
    }

    # AI service internal (X-Internal-Token guards real access)
    handle /ai-internal/* {
        uri strip_prefix /ai-internal
        reverse_proxy ai-service:4001
    }

    # Default deny
    handle {
        respond "Not found" 404
    }

    # Caddy automatic HTTPS, security headers
    encode gzip zstd
    header {
        Strict-Transport-Security "max-age=31536000; includeSubDomains"
        X-Content-Type-Options "nosniff"
        X-Frame-Options "DENY"
        Referrer-Policy "no-referrer"
        -Server
    }

    log {
        output file /var/log/caddy/access.log {
            roll_size 100MiB
            roll_keep 5
        }
    }
}
```

For local testing without a domain, replace `extraction.example.com` with `localhost` (Caddy issues a self-signed cert) or `:443` for HTTP-only on internal networks.

---

Next: [`VPS_DEPLOYMENT_GUIDE.md`](VPS_DEPLOYMENT_GUIDE.md) for the actual setup walkthrough.
