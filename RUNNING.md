# RUNNING PROJECT EXTRACTION

Local development setup, runtime operation, and production deployment.

**Status as of `d7bfb2b` (post architecture simplification):** All 6 packages compile clean. Full E2E verified on the simplified SQLite + in-memory + OpenAI stack.

> **⚠️ Architecture simplification (May 2026):** The system no longer uses PostgreSQL, Redis, or Kubernetes. It uses **SQLite** (two databases, WAL mode), **in-memory** cache and event bus, and deploys to a **single VPS** behind Caddy. For production deployment, use [`docs/simplification/VPS_DEPLOYMENT_GUIDE.md`](docs/simplification/VPS_DEPLOYMENT_GUIDE.md) — it is the authoritative production guide. The "Production Deployment" section below has been updated to point there.

---

## TABLE OF CONTENTS

1. [Prerequisites](#prerequisites)
2. [Credentials & Keys to Gather](#credentials--keys-to-gather)
3. [Local Development — Boot Sequence](#local-development--boot-sequence)
4. [Local Development — Component Run Commands](#local-development--component-run-commands)
5. [End-to-End Smoke Test](#end-to-end-smoke-test)
6. [Day-to-Day Operation](#day-to-day-operation)
7. [Troubleshooting](#troubleshooting)
8. [Production Deployment](#production-deployment)

---

## PREREQUISITES

Install once on your local machine:

| Tool | Version | macOS install |
|---|---|---|
| Node.js | ≥ 20 | `brew install node@20` |
| npm | ≥ 10 | (bundled with Node) |
| Docker Desktop | latest | https://docker.com/desktop |
| Go | ≥ 1.22 | `brew install go` |
| PostgreSQL client (`psql`) | any | `brew install libpq && brew link --force libpq` |
| Python 3 | for JSON helper | `brew install python` (pre-installed on macOS) |
| Xcode Command Line Tools | latest | `xcode-select --install` (for CGO + macOS APIs in desktop agent) |
| Ollama (optional) | latest | `brew install ollama` (only if you want local AI; otherwise use Claude) |

Verify:
```bash
node --version    # v20+
docker --version  # 24+
go version        # 1.22+
```

---

## CREDENTIALS & KEYS TO GATHER

### Required (free, generated locally)

Run once and save the three values somewhere safe:

```bash
openssl rand -hex 32  # → JWT_SECRET
openssl rand -hex 32  # → JWT_REFRESH_SECRET
openssl rand -hex 32  # → INTERNAL_API_TOKEN
```

### Choose ONE: AI text generation provider

**Option A — Anthropic Claude (recommended)**
- Get API key: https://console.anthropic.com → API Keys → Create Key
- Pricing: Haiku 4.5 ≈ $1/MTok input + $5/MTok output. Expect cents/day for typical use.
- Set: `ANTHROPIC_API_KEY=sk-ant-...` + `USE_PROVIDER=claude`

**Option B — Ollama (local, free, slower)**
- Install + pull a model: `brew install ollama && ollama serve & ollama pull llama3.1:8b`
- Set: `USE_PROVIDER=ollama` (no API key needed)

### Optional: TTS provider (voice announcements)

Skip entirely if you only want text announcements.

**ElevenLabs (recommended for voice quality)**
- Get API key: https://elevenlabs.io/app/settings/api-keys
- Pick a voice ID: https://elevenlabs.io/app/voice-library — choose a calm, mid-low pitch female voice (e.g., "Rachel"). Copy its voice ID.
- Set: `ELEVENLABS_API_KEY=...` + `ELEVENLABS_VOICE_ID=...`

### Optional: Mission verification via GitHub

- Generate a personal access token at https://github.com/settings/tokens with `repo` scope (read-only is fine for monitoring commits)
- Set: `GITHUB_TOKEN=ghp_...`
- Not yet wired into the backend — Phase 3+ feature.

---

## LOCAL DEVELOPMENT — BOOT SEQUENCE

### One-time setup

```bash
# Clone if you haven't (you're already in the repo)
cd /Users/sahilsapariya/Documents/projects/devils-game

# Install all dependencies (Node packages across all workspaces)
npm install

# Make scripts executable
chmod +x scripts/*.sh

# Build shared package (other packages depend on its compiled output)
npm --workspace @extraction/shared run build
```

### Create the backend `.env`

```bash
cat > packages/backend/.env <<EOF
NODE_ENV=development
PORT=3001
API_PREFIX=api

# SQLite (auto-created on first migration run)
DATABASE_PATH=./data/operational.db
TELEMETRY_DATABASE_PATH=./data/telemetry.db
DATABASE_LOGGING=false

# Auth secrets (USE YOUR GENERATED VALUES)
JWT_SECRET=<paste-your-openssl-rand-hex-32-here>
JWT_REFRESH_SECRET=<paste-your-different-openssl-rand-hex-32-here>
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=30d
BCRYPT_ROUNDS=12

# CORS — mobile dev + web dashboard
CORS_ORIGINS=http://localhost:8081,http://localhost:3000

# Logging
LOG_LEVEL=debug

# AI service
AI_SERVICE_URL=http://localhost:4001

# Telemetry HMAC verification (disable for dev)
HMAC_VERIFICATION_ENABLED=false
EOF
```

### Create the AI service `.env`

Pick ONE provider config:

**For Claude:**
```bash
cat > packages/ai-service/.env <<EOF
PORT=4001
USE_PROVIDER=claude
ANTHROPIC_API_KEY=<paste-your-anthropic-key>
ANTHROPIC_MODEL=claude-haiku-4-5-20251001
INTERNAL_API_TOKEN=<paste-your-openssl-rand-hex-32>

# Optional voice
ELEVENLABS_API_KEY=<optional>
ELEVENLABS_VOICE_ID=<optional>
ELEVENLABS_MODEL=eleven_turbo_v2_5
VOICE_CACHE_DIR=./voice-cache
VOICE_CACHE_TTL_HOURS=24
EOF
```

**For Ollama:**
```bash
cat > packages/ai-service/.env <<EOF
PORT=4001
USE_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_TEXT_MODEL=llama3.1:8b
INTERNAL_API_TOKEN=<paste-your-openssl-rand-hex-32>
EOF
```

### Start infrastructure (none required — SQLite + in-memory)

The system no longer needs PostgreSQL or Redis containers. SQLite databases are auto-created on first boot. The only optional service in `docker-compose.yml` is Ollama (opt-in via `--profile ai`):

```bash
# Nothing to start by default
# If you want local AI fallback:
docker compose --profile ai up -d ollama
```

### Apply database migrations

```bash
cd packages/backend
mkdir -p data
npm run migration:run
# Creates ./data/operational.db and ./data/telemetry.db with WAL mode
# (Migration also auto-runs on backend boot via migrationsRun: true.)
cd ../..
```

---

## LOCAL DEVELOPMENT — COMPONENT RUN COMMANDS

Each component runs in its own terminal/process. The system is designed to operate even if some components are down.

### Backend (terminal 1)

```bash
cd packages/backend
npm run dev          # watch mode, recompiles on save (port 3001)
# OR for production-like:
npm run build && node dist/main.js
```

Expected log line:
```
[Bootstrap] PROJECT EXTRACTION backend listening on port 3001 (env=development)
```

Health check: `curl http://localhost:3001/health` → `{"status":"ok",...}`

### AI service (terminal 2)

```bash
cd packages/ai-service
npm run dev          # watch mode (port 4001)
# OR
npm run build && node dist/main.js
```

Expected log line:
```
[Bootstrap] PROJECT EXTRACTION ai-service listening on :4001
```

Health check: `curl http://localhost:4001/health` → `{"ok":true,"providers":{...}}`

If Ollama is running, providers should report `ollama: true`. If you set an Anthropic key, `claude: true`. ElevenLabs key → `elevenlabs: true`.

### Mobile (terminal 3)

```bash
cd packages/mobile
npm run start        # boots Expo dev server, opens QR code
```

Then either:
- Press `i` to open iOS simulator (requires Xcode)
- Press `a` to open Android emulator
- Scan the QR code with Expo Go app on your phone (download from App Store / Play Store)

The mobile app expects backend at `http://localhost:3001/api` and WebSocket at `http://localhost:3001`. To point at a different host (e.g., your machine's LAN IP when testing on a phone), edit `packages/mobile/app.json`:

```json
"extra": {
  "apiBaseUrl": "http://192.168.1.10:3001/api",
  "wsBaseUrl": "http://192.168.1.10:3001"
}
```

### Desktop agent (terminal 4)

```bash
cd packages/desktop-agent

# First-time build
go build -o ./bin/agent ./cmd/agent

# Enroll the agent with your backend account
./bin/agent enroll --user-token <your-jwt-from-mobile-or-curl>

# Run the agent (foreground; for daemon mode see Production section)
./bin/agent
```

On first run, macOS will prompt for **Automation** permission (System Events). Grant it.

To install git hooks for commit tracking in a specific repo:
```bash
./bin/agent install-hooks --repo ~/path/to/your/dev/repo
```

### Browser extension (terminal 5, then Chrome)

```bash
cd packages/extension
npm run build       # produces dist/
```

Then in Chrome:
1. Open `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked**
4. Select `packages/extension/dist/`
5. Click the extension icon → paste your auth token (JWT from mobile login)

---

## END-TO-END SMOKE TEST

After backend + AI service are running, validate the full flow from a fresh terminal:

```bash
# 1. Register a new operator
REG=$(curl -s -X POST http://localhost:3001/api/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"you@example.com","password":"SomePassword123!","displayName":"You"}')
echo "$REG"

TOKEN=$(echo "$REG" | python3 -c 'import sys,json; print(json.load(sys.stdin)["tokens"]["accessToken"])')

# 2. Confirm authenticated user
curl -s http://localhost:3001/api/users/me -H "Authorization: Bearer $TOKEN"

# 3. Create a mission
MISSION=$(curl -s -X POST http://localhost:3001/api/missions \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"title":"Ship the ERP","description":"Complete School ERP system","priority":1}')
MISSION_ID=$(echo "$MISSION" | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])')
echo "Mission: $MISSION_ID"

# 4. Create a round under that mission
ROUND=$(curl -s -X POST http://localhost:3001/api/rounds \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"missionId\":\"$MISSION_ID\",\"scheduledStart\":\"2026-05-15T14:00:00Z\",\"scheduledEnd\":\"2026-05-15T16:00:00Z\",\"durationMinutes\":120}")
echo "Round: $ROUND"

# 5. Submit telemetry
curl -s -X POST http://localhost:3001/api/telemetry/batch \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"source":"desktop_agent","deviceId":"smoke-test","batches":[{"periodStart":"2026-05-15T14:00:00Z","periodEnd":"2026-05-15T14:05:00Z","metrics":{"totalFocusMinutes":5,"appSwitches":1,"idleMinutes":0,"distractionCount":0,"productiveAppsActive":["VSCode"]},"events":[]}]}'

# 6. Test AI service announcement generation
curl -s -X POST http://localhost:4001/internal/generate-announcement \
  -H 'Content-Type: application/json' \
  -H "X-Internal-Token: $(grep INTERNAL_API_TOKEN packages/ai-service/.env | cut -d= -f2)" \
  -d '{"type":"status_report","context":{"state":"OPERATIONAL","timeRemainingSec":1200,"violations":2}}'
```

If all return 2xx (no 4xx/5xx errors), the system is operational.

---

## DAY-TO-DAY OPERATION

### Quick start (after first-time setup)

```bash
# Terminal 0: bring up infra
docker compose up -d postgres redis

# Terminal 1: backend
cd packages/backend && npm run dev

# Terminal 2: AI service
cd packages/ai-service && npm run dev

# Terminal 3: mobile (optional)
cd packages/mobile && npm run start

# Terminal 4: desktop agent
cd packages/desktop-agent && ./bin/agent
```

### Helper script

There's a convenience script that does all of the above:

```bash
./scripts/dev.sh    # starts docker, waits healthy, runs migrations, starts turbo dev
```

### Stop everything

```bash
# Stop dev servers: Ctrl+C in each terminal
docker compose down   # stops postgres + redis (data persists in volumes)
docker compose down -v  # also wipes the volumes (full reset)
```

### Inspect the database

```bash
docker compose exec postgres psql -U extraction -d extraction_dev

# Useful queries:
\dt                            -- list all 11 tables
SELECT * FROM users;
SELECT * FROM missions;
SELECT * FROM rounds;
SELECT * FROM events ORDER BY occurred_at DESC LIMIT 20;
SELECT * FROM telemetry_events ORDER BY occurred_at DESC LIMIT 20;
SELECT * FROM consequences;
SELECT * FROM announcements;
\q
```

### Inspect Redis

```bash
docker compose exec redis redis-cli
KEYS extraction:*
GET extraction:user:<uuid>:current_state
SUBSCRIBE extraction:events:broadcast:*
```

### Reset the system completely

```bash
docker compose down -v
rm -rf packages/*/dist packages/*/node_modules packages/desktop-agent/bin
rm packages/*/tsconfig.tsbuildinfo
rm packages/backend/.env packages/ai-service/.env
# Then re-run the boot sequence from "One-time setup"
```

---

## TROUBLESHOOTING

### Backend fails to compile with empty `dist/`

The `tsconfig.tsbuildinfo` incremental cache can get stale.

```bash
cd packages/backend
rm -rf dist tsconfig.tsbuildinfo
npm run build
```

### "Cannot find module 'dist/main.js'"

Same cause as above — the build emitted nothing because of a stale incremental cache. Delete `.tsbuildinfo` and rebuild.

### Backend says "Cannot find module '@extraction/shared'"

The shared package hasn't been built yet:

```bash
npm --workspace @extraction/shared run build
```

The backend's `prebuild` hook should do this automatically, but if you ran `tsc` directly, build shared manually first.

### `npm install` fails with workspace errors

Ensure you're using npm ≥ 10 and Node ≥ 20:

```bash
node --version
npm --version
```

### Migration fails with "extension not found"

Postgres needs the `uuid-ossp` extension. The migration creates it, but if your Postgres user lacks superuser:

```bash
docker compose exec postgres psql -U postgres -c "CREATE EXTENSION IF NOT EXISTS uuid-ossp;"
```

### Desktop agent crashes on macOS with "operation not permitted"

Grant Automation permission:
- System Settings → Privacy & Security → Automation → enable "System Events" for the terminal you're running the agent from.

### AI service returns 400 "context.property ... should not exist"

The AI DTO got out of sync with what the backend sends. The fix from sprint 1 should cover this, but if you're sending custom payloads, ensure all extra fields are declared as `@Allow()` or use `@IsOptional()`.

### Mobile app can't reach backend on physical device

Replace `localhost` with your machine's LAN IP in `packages/mobile/app.json` → `extra.apiBaseUrl` and `extra.wsBaseUrl`. The phone needs to be on the same Wi-Fi network.

### Ports already in use

```bash
# Find what's listening
lsof -i :3001 -i :4001 -i :5432 -i :6379

# Kill orphan node processes
pkill -f "node dist/main"
pkill -f "nest start"
```

---

## PRODUCTION DEPLOYMENT

**Production deployment is now a single-VPS Docker Compose setup behind Caddy.** The previous Kubernetes-based plan has been retired. See [`docs/simplification/VPS_DEPLOYMENT_GUIDE.md`](docs/simplification/VPS_DEPLOYMENT_GUIDE.md) for the full step-by-step setup (~30 minutes, ~$6/month).

### TL;DR

1. Provision a $5/month VPS (Hetzner CPX11 or equivalent, Ubuntu 24.04)
2. Point a domain at it via DNS A record
3. SSH in and run `scripts/vps-bootstrap.sh` (installs Docker, configures UFW, creates `/opt/extraction/data/`)
4. `git clone` the repo, copy `.env.production.example` → `.env.production`, fill in: JWT secrets, `OPENAI_API_KEY`, `DOMAIN`, `ACME_EMAIL`
5. Copy `Caddyfile.example` → `Caddyfile`, replace placeholder domain
6. `docker compose -f docker-compose.prod.yml up -d`
7. Wait ~30 seconds for Caddy to provision a Let's Encrypt cert
8. `curl https://<domain>/health` → 200

### Production architecture

```
   HTTPS (auto Let's Encrypt via Caddy)
                  │
   ┌──────────────▼──────────────┐
   │   VPS (single, ~$5/mo)      │
   │                             │
   │   ┌────────────────────┐    │
   │   │  Caddy (80/443)    │    │
   │   └─┬──────────────┬───┘    │
   │     │              │        │
   │  ┌──▼──────┐  ┌────▼────┐   │
   │  │ Backend │  │AI       │   │
   │  │ NestJS  │  │Service  │   │
   │  │ SQLite  │  │OpenAI   │   │
   │  │ in-mem  │  │client   │   │
   │  └─────────┘  └─────────┘   │
   │                             │
   │   ./data/operational.db     │
   │   ./data/telemetry.db       │
   └─────────────────────────────┘
```

Three containers (`caddy`, `backend`, `ai-service`), bind-mounted `./data` for SQLite + voice cache. Total RAM: ~300 MB.

### Backups

```bash
# Atomic snapshot via SQLite VACUUM INTO
/opt/extraction/scripts/backup-sqlite.sh
# → /opt/extraction/data/backups/YYYY-MM-DD-HHMM/{operational.db, telemetry.db}
```

Add to cron for nightly backups. Optionally `rclone` to off-site storage (Cloudflare R2, Backblaze B2 — ~$0.50/month).

### CI/CD

`.github/workflows/deploy.yml` provides SSH-based deploy via `appleboy/ssh-action`. Required secrets: `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`, `DOMAIN`. Manual approval gate via GitHub `production` environment.

```bash
ssh root@vps "cd /opt/extraction && git pull && docker compose -f docker-compose.prod.yml up -d --build"
```

### What's no longer required

The previous architecture's requirements list has been retired:
- ❌ Managed PostgreSQL (RDS / CloudSQL) — now SQLite
- ❌ Managed Redis cluster (ElastiCache / Memorystore) — now in-memory
- ❌ Kubernetes cluster (EKS / GKE) — now Docker Compose
- ❌ Application Load Balancer + ACM — now Caddy with auto Let's Encrypt
- ❌ Object storage for voice cache — now local bind mount (single replica)
- ❌ External Secrets Operator — now `.env.production` file (mode 600, root-owned)
- ❌ OTEL + Sentry + Prometheus stack — now Docker logs + SQLite `operational_logs` audit table

### Cost

| Item | Monthly |
|---|---|
| VPS (Hetzner CPX11) | ~$5 |
| Domain (annualized) | $1 |
| OpenAI API (gpt-5.4-nano with caching) | $1-3 |
| ElevenLabs TTS (optional Starter) | $0-5 |
| **Total** | **$7-15** |

See [`docs/simplification/UPDATED_COST_PROFILE.md`](docs/simplification/UPDATED_COST_PROFILE.md) for the breakdown.

---

## QUICK REFERENCE

### URLs

| Service | Dev URL | Production pattern |
|---|---|---|
| Backend API | http://localhost:3001/api | https://api.your-domain.com/api |
| Backend WS | ws://localhost:3001/operational | wss://api.your-domain.com/operational |
| AI service | http://localhost:4001/internal | http://ai-service.svc.cluster.local:4001/internal |
| Postgres | localhost:5432 | <managed-endpoint>:5432 |
| Redis | localhost:6379 | <managed-endpoint>:6379 |

### Default credentials (local only)

| Credential | Default |
|---|---|
| Postgres user | `extraction` |
| Postgres password | `development` |
| Postgres database | `extraction_dev` |
| Redis password | (none locally) |

### Endpoint summary

**Public:**
- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /health`

**JWT-guarded:**
- `GET/PATCH /api/users/me`
- `GET/POST/PATCH /api/missions[/:id]`
- `GET/POST/PATCH /api/rounds[/:id]` (also `/start`, `/complete`, `/abandon`, `/behavioral-record`)
- `GET /api/events`
- `POST /api/telemetry/batch`
- `GET /api/announcements`, `PATCH /api/announcements/:id/acknowledge`, `POST /api/announcements/:id/played`
- `GET /api/consequences`, `PATCH /api/consequences/:id/acknowledge`

**AI service (internal, X-Internal-Token guard):**
- `GET /health`
- `POST /internal/generate-announcement`
- `POST /internal/analyze-behavior`

**WebSocket namespace `/operational`** (JWT in `auth.token`):
- Client→Server: `telemetry:batch`, `round:status`, `user:check-in`
- Server→Client: `round:started`, `round:updated`, `round:ended`, `behavioral:violation-detected`, `announcement:incoming`, `consequence:issued`, `state:transitioned`

---

The operation is ready.
