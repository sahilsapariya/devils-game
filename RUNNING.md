# RUNNING PROJECT EXTRACTION

Local development setup, runtime operation, and production deployment.

**Status as of `cf2bcf1`:** All 6 packages compile clean. Full E2E verified: register → login → mission → round → telemetry → announcement.

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

# Database (matches docker-compose defaults)
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_USERNAME=extraction
DATABASE_PASSWORD=development
DATABASE_NAME=extraction_dev
DATABASE_SSL=false
DATABASE_POOL_SIZE=10
DATABASE_LOGGING=false

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_DB=0
REDIS_KEY_PREFIX=extraction

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

### Start infrastructure (PostgreSQL + Redis)

```bash
docker compose up -d postgres redis

# Wait a few seconds, then verify
docker compose exec postgres pg_isready -U extraction   # → accepting connections
docker compose exec redis redis-cli ping                # → PONG
```

### Apply database migrations

```bash
cd packages/backend
npm run migration:run
# Expected: 11 tables created (or "No migrations are pending" if already applied)
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

This is the architecture. Adapt to your specific cloud / on-prem setup.

### Infrastructure components

```
┌─────────────────────────────────────────────────────────┐
│                  CDN / Edge                              │
│  (CloudFront / Cloudflare / Vercel)                      │
└───────────────────────┬─────────────────────────────────┘
                        │
            ┌───────────▼────────────┐
            │   Load Balancer        │
            │   (ALB / GCP LB / NGINX)│
            │   TLS termination      │
            └───────────┬────────────┘
                        │
        ┌───────────────┴───────────────┐
        │                               │
┌───────▼────────┐              ┌──────▼─────────┐
│ Backend Pods   │              │ AI Service     │
│ (3+ replicas)  │◄────internal──┤ (2+ replicas) │
│ NestJS         │               │ NestJS         │
│ :3001          │               │ :4001          │
└───┬────────┬───┘               └────────────────┘
    │        │
    │ ┌──────▼───┐          ┌─────────────┐
    └─▶│  Redis   │          │ ElevenLabs  │
      │ Cluster  │          │ + Anthropic │
      │ (3-node) │          │ (external)  │
      └──────────┘          └─────────────┘
            │
    ┌───────▼────────┐
    │  PostgreSQL    │
    │  (managed:     │
    │   RDS/CloudSQL)│
    └────────────────┘
```

### Production checklist

#### 1. Managed services

- **PostgreSQL:** AWS RDS, GCP CloudSQL, Aiven, Supabase, etc. NOT a containerized statefulset in production unless you really know what you're doing.
- **Redis:** AWS ElastiCache, GCP Memorystore, Upstash, etc. 3-node cluster minimum for HA.
- **Object storage (for voice cache):** S3, GCS, R2.

#### 2. Secrets management

- Never bake secrets into images. Use:
  - AWS Secrets Manager + External Secrets Operator (if on K8s)
  - GCP Secret Manager
  - HashiCorp Vault
- Rotate JWT secrets, HMAC keys, and INTERNAL_API_TOKEN regularly.

#### 3. Backend deployment

```bash
# Build production image
docker build -f Dockerfile.backend -t your-registry/extraction-backend:v1 .
docker push your-registry/extraction-backend:v1

# Apply K8s manifests (templates exist in infra/k8s/)
kubectl apply -f infra/k8s/namespace.yaml
kubectl apply -f infra/k8s/configmap.yaml
# Fill in infra/k8s/secret.yaml from your secrets manager — NEVER commit it
kubectl apply -f infra/k8s/backend-deployment.yaml
kubectl apply -f infra/k8s/backend-service.yaml
kubectl apply -f infra/k8s/ingress.yaml
```

#### 4. AI service deployment

Same pattern as backend. Build the Dockerfile in `packages/ai-service/Dockerfile`, push, apply manifests (templates not yet provided — clone `backend-deployment.yaml` as starting point).

Critical production tweaks for AI service:
- Mount a shared volume or use S3 for `VOICE_CACHE_DIR` so multi-replica caching works
- Set `OLLAMA_TTS_MODEL` only if you've actually deployed an Ollama TTS sidecar
- Provision a real ElevenLabs voice ID

#### 5. Database migrations in CI/CD

In your deploy pipeline, before rolling out new backend pods:

```bash
docker run --rm --env-file .env.production \
  your-registry/extraction-backend:v1 \
  npm run migration:run
```

#### 6. Backend env vars for production

```
NODE_ENV=production
PORT=3001
API_PREFIX=api
DATABASE_HOST=<managed-pg-endpoint>
DATABASE_PORT=5432
DATABASE_USERNAME=<from-secrets>
DATABASE_PASSWORD=<from-secrets>
DATABASE_NAME=extraction_prod
DATABASE_SSL=true
DATABASE_POOL_SIZE=20
REDIS_HOST=<managed-redis-endpoint>
REDIS_PORT=6379
REDIS_PASSWORD=<from-secrets>
JWT_SECRET=<from-secrets, 64+ chars>
JWT_REFRESH_SECRET=<from-secrets>
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=14d
BCRYPT_ROUNDS=12
CORS_ORIGINS=https://app.your-domain.com
LOG_LEVEL=warn
AI_SERVICE_URL=http://ai-service.extraction.svc.cluster.local:4001
HMAC_VERIFICATION_ENABLED=true  # ENABLE in prod
```

#### 7. Observability

Set these to enable instrumentation (Phase 3+ wiring needed):
- `OTEL_EXPORTER_OTLP_ENDPOINT=...` (Honeycomb, Datadog, Tempo, etc)
- `SENTRY_DSN=...` (error tracking)
- Add Prometheus annotations to deployment manifests

#### 8. Mobile app distribution

- **Internal testing:** Expo EAS Build → TestFlight (iOS) + Google Play Internal Track (Android)
  ```bash
  cd packages/mobile
  npx eas build --platform ios
  npx eas build --platform android
  ```
- **Public release:** Submit to App Store / Play Store. Requires:
  - Apple Developer account ($99/year)
  - Google Play Developer account ($25 one-time)
  - App icons, screenshots, privacy policy URL

#### 9. Desktop agent distribution

For internal team use:
- Build per-arch binaries: `GOOS=darwin GOARCH=arm64 go build ...` and `GOOS=darwin GOARCH=amd64 go build ...`
- Distribute via internal package manager or shared drive

For public distribution:
- Apple Developer ID certificate ($99/year) for code signing
- `codesign --sign "Developer ID Application: Your Name" --options runtime ./bin/agent`
- Notarize with `xcrun notarytool submit` (required for macOS Gatekeeper)
- Ship a `LaunchAgent` plist for auto-start at login (template not yet provided; Phase 3)

#### 10. Browser extension distribution

- **Chrome Web Store:** Create developer account ($5 one-time fee), upload `packages/extension/dist/` as a ZIP, submit for review. Approval typically takes 1-3 days.
- **Self-hosted enterprise:** Distribute the unpacked extension and use Chrome's enterprise policies to allow it.

#### 11. CI/CD

GitHub Actions workflows are in `.github/workflows/`:
- `ci.yml` — runs on every PR (lint, typecheck, build, tests)
- `deploy.yml` — placeholder; gated by `staging` / `production` GitHub environments with manual approval

Configure your registry credentials as GitHub Secrets:
- `DOCKER_REGISTRY_URL`
- `DOCKER_REGISTRY_USERNAME`
- `DOCKER_REGISTRY_PASSWORD`
- `KUBECONFIG` (base64-encoded)

#### 12. Backup & disaster recovery

- **Database backups:** Managed PG providers do this automatically; verify retention (≥30 days recommended).
- **Manual snapshot:** `docker compose exec postgres pg_dump -U extraction extraction_dev > backup.sql`
- **Restore:** `docker compose exec -T postgres psql -U extraction extraction_dev < backup.sql`
- **Redis:** generally ephemeral, but enable AOF persistence if event stream replay matters across restarts

#### 13. Production hardening required (not yet implemented)

Before serving real users:

- [ ] Wire BullMQ consumers (currently inline event processing — slow)
- [ ] Wire Socket.io Redis adapter in `main.ts` (currently single-server only)
- [ ] Implement real HMAC verification in `telemetry.service.ts` (currently returns `true`)
- [ ] Add rate limiting via `@nestjs/throttler`
- [ ] Wire OTEL + Sentry instrumentation
- [ ] Implement mobile background service (Expo task-manager + iOS background modes + Android foreground service)
- [ ] Wire `stats:update` socket emission from event processor
- [ ] Provision actual ElevenLabs voice ID
- [ ] Replace `INTERNAL_API_TOKEN` shared secret with mTLS or signed service-to-service JWT

See `docs/FIX_PRIORITY_MATRIX.md` for the full prioritized list.

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
