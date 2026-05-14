# ARCHITECTURE SIMPLIFICATION PLAN

**Status:** Approved direction. Refactor pending.
**Effective commit baseline:** `beac7a3`
**New product positioning:** Single-user, self-hosted, personal operational ecosystem.

---

## REASSESSED PRODUCT IDENTITY

PROJECT EXTRACTION is **not** a SaaS product. It is **one operator's personal operational environment** — a coordinated mobile + desktop + browser surveillance system that runs on **one cheap VPS** for one person.

### What changes

| Old assumption | New reality |
|---|---|
| Multi-user SaaS scaling to 1000+ users | One operator, one ecosystem |
| Kubernetes cluster with horizontal scaling | Single VPS, Docker Compose |
| Managed PostgreSQL + Redis cluster | SQLite + in-memory state |
| OTEL distributed tracing + Sentry + Prometheus | Local structured logs + audit trail |
| Anthropic Claude + ElevenLabs (paid AI maximalism) | OpenAI GPT-5.4 nano (cheap, fast) + optional TTS |
| Multi-pod Socket.io with Redis adapter | Single-node Socket.io with in-memory broadcasting |
| Enterprise observability stack | Lightweight operational logging |
| $200-700/month production cost | $5-15/month VPS + $1-3/month AI |
| Production hardening = mandatory before launch | Production hardening = optional luxury |

### What stays the same

These are **core product identity** and remain intact:

- Operational state machine (Dormant → Monitoring → Operational → Critical → Recovery → Extraction → Silence)
- Immersion engine (4 cascading layers: announcement frequency, UI intensity, overlays, sound design)
- Adaptive difficulty engine (6-dimensional, orbits sustainable maximum)
- Behavioral telemetry pipeline (multi-signal verification)
- Desktop activity monitoring (Go agent)
- Browser distraction tracking (extension)
- Procedural AI-generated announcements (with quality gates and template fallback)
- Psychological pacing systems
- Event sourcing (immutable event store)
- Consequence system (reputation + recovery mechanics)
- HMAC-signed telemetry batches
- Offline operational continuity (mobile = runtime authority)

---

## THE 12 CHANGES

### 1. PostgreSQL → SQLite (dual database)

- Replace TypeORM Postgres driver with SQLite (`better-sqlite3`)
- Two database files:
  - `data/operational.db` — users, missions, rounds, events, consequences, announcements, operational_logs (low write rate, append-only event sourcing is fine on SQLite with WAL)
  - `data/telemetry.db` — telemetry_events, behavioral_records (high write rate, isolated to avoid blocking operational queries)
- WAL mode enabled on both
- `journal_mode = WAL`, `synchronous = NORMAL`, `busy_timeout = 5000`
- Migration tool: TypeORM SQLite migrations (compatible with existing migration patterns; raw-SQL migration rewritten for SQLite syntax)
- ORM stays as TypeORM (Drizzle would require rewriting entities; not worth the churn given TypeORM works fine on SQLite)

### 2. Remove Redis entirely

- Delete `packages/backend/src/modules/redis/`
- Delete `ioredis` dependency
- Replace usages:
  - `Cacheable` decorator → in-memory `Map` with TTL (no need for cross-process cache; single-node system)
  - Event broadcaster pub/sub → Node.js `EventEmitter` (single-process, in-memory)
  - Operational state cache → in-memory `Map`
  - Redis Streams → SQLite events table (event sourcing already there)
- Health check no longer pings Redis
- Docker Compose loses redis service
- `.env.example` loses Redis variables

### 3. Remove Kubernetes entirely

- Delete `infra/k8s/` directory
- Delete K8s references from CI / deploy workflows
- Replace deployment story with **single VPS + Docker Compose + Caddy**

### 4. Deployment target: cheap VPS

- Target: Hetzner CPX11 (€4.51/mo, 2 vCPU / 2 GB RAM), DigitalOcean Basic ($6/mo), Vultr Cloud Compute ($6/mo), or similar
- Stack: Ubuntu 24.04 + Docker Compose + Caddy
- One `docker-compose.prod.yml` brings up: backend + ai-service + caddy
- SQLite databases live on a host-mounted volume `./data/`
- Caddy reverse proxy fronts both backend (port 3001) and ai-service (port 4001) under one domain

### 5. TLS via Caddy automatic HTTPS

- Caddy auto-provisions Let's Encrypt certs on first request to a domain
- Zero manual cert management
- HTTPS is mandatory because:
  - Socket.io reliability (WSS required for many corporate networks)
  - Android mobile compatibility (cleartext disabled by default)
  - Browser extension Manifest V3 (HTTPS-only for `host_permissions`)
  - Service worker stability (must be HTTPS context)

### 6. AI provider: OpenAI GPT-5.4 nano primary

- `ai-service` uses OpenAI's `gpt-5.4-nano` model as default
- Reason: cheap (sub-cent per announcement), fast (~500ms p50), reliable cloud API, no GPU required, no model download
- Anthropic Claude support stays as a configurable alternate but isn't default
- Ollama becomes optional offline fallback only (not default install)

### 7. Ollama is optional

- Remove Ollama from default `.env.example`
- Remove Ollama from default Docker Compose (only available via `--profile ai` flag)
- Document Ollama as a power-user enhancement for offline operation
- System functions fully without it

### 8. Mobile app as runtime authority (strengthened)

- Mobile must operate completely standalone for at least 24 hours offline
- Round timers, announcement queue, telemetry buffer all local (already implemented)
- Reconnect sync handles eventual consistency
- Pre-download announcement templates at round start so mobile can render text-only announcements without backend
- No assumption that desktop agent is running

### 9. Remove enterprise observability

- Drop OTEL_EXPORTER_OTLP_ENDPOINT from `.env.example`
- Drop Sentry references
- Drop Prometheus annotations from manifests (no manifests anyway after change #3)
- Replace with:
  - Structured stdout logs (already in place via Nest Logger)
  - SQLite-backed `operational_logs` audit trail (already in schema)
  - Optional: persist Docker container logs to disk via `docker compose logs > file` cron

### 10. Cost optimization priorities

- Optimize AI token usage aggressively (see change #11)
- Avoid premium TTS unless explicitly enabled (ElevenLabs is now opt-in)
- Use cheapest workable VPS tier (2 GB RAM is sufficient)
- Use SQLite to eliminate managed-DB cost entirely
- **Do not** degrade immersion quality to save money

### 11. AI token optimization

- All AI calls use structured JSON outputs (OpenAI's `response_format: { type: "json_schema" }`)
- Behavioral context summarized to a fixed-size compact format before send (e.g., `peak_hours: [9,10,14]`, `top_distractions: [instagram,youtube]`, `avg_focus_min: 45`) — never send raw event history
- Template-driven prompts with placeholder substitution; minimize variable prose
- Aggressive caching: identical context signatures reuse the last announcement for that signature for up to 10 minutes
- Reuse common operational phrases ("Operational check.", "Round status:") as pre-written prefixes; AI only fills in the variable tail
- Batch where possible: behavioral analysis runs once per round, not per event

### 12. Remove all multi-user assumptions

- Auth/JWT stays (clients still need to authenticate sessions) but bootstrap flow is single-operator:
  - First run creates the single operator account; subsequent register attempts can be disabled via env flag
  - Ownership checks remain (defense in depth) but in practice there is only one user
- Drop CORS configuration for multi-domain; single domain only
- Drop public registration UI gating

---

## DEPENDENCY GRAPH

```
        ┌──────────────────────────────────────┐
        │  Change 12: Single-user assumptions  │
        │           (cross-cutting)            │
        └──────────────────────────────────────┘
                          │
            ┌─────────────┼─────────────┐
            │             │             │
     ┌──────▼────┐  ┌─────▼─────┐  ┌────▼──────┐
     │ Change 1: │  │ Change 2: │  │ Change 6: │
     │  SQLite   │  │  Redis    │  │  OpenAI   │
     │           │  │  removal  │  │           │
     └─────┬─────┘  └─────┬─────┘  └─────┬─────┘
           │              │              │
           │              │     ┌────────▼──────┐
           │              │     │ Change 11:    │
           │              │     │ Token optim.  │
           │              │     └───────────────┘
           │              │
           └──────┬───────┘
                  │
        ┌─────────▼──────────┐
        │ Change 3: K8s rm   │
        │ Change 4: VPS      │  ← infra layer
        │ Change 5: Caddy    │
        └────────────────────┘
                  │
        ┌─────────▼──────────┐
        │ Change 9: Drop OTEL│
        │ (cleanup)          │
        └────────────────────┘
```

Most changes are **independent** — they touch different files. Backend simplification (SQLite + Redis removal) is the only place where coordination matters.

---

## EXECUTION SEQUENCE

**Phase A — Planning (this commit):** Generate 7 planning docs.

**Phase B — Parallel refactor:**
- Subagent BACKEND-SIMPLIFY: SQLite migration + Redis removal (combined, single ownership of `packages/backend/`)
- Subagent AI-OPENAI: Switch ai-service primary to OpenAI + implement token optimizations
- Subagent INFRA-VPS: Delete K8s, create Caddy + docker-compose.prod.yml + VPS bootstrap script

**Phase C — Documentation reconciliation:** Update OVERVIEW.md, RUNNING.md, FIX_PRIORITY_MATRIX.md to match new architecture.

**Phase D — End-to-end verification:** Boot the simplified system locally, run E2E smoke, commit.

---

## NON-GOALS

- We are **not** retrofitting Drizzle ORM (TypeORM works fine on SQLite; switching ORMs is wasted churn)
- We are **not** rewriting client code (mobile, extension, desktop agent) — they're already protocol-agnostic and will work unchanged
- We are **not** deleting shared types / event vocabulary
- We are **not** deleting the operational state machine, immersion engine, difficulty engine, or any core product feature
- We are **not** removing JWT auth (single user still needs sessions)
- We are **not** removing the `users` table (single-row use is fine)

---

## RISK ASSESSMENT

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| SQLite migration breaks existing entities (Postgres-specific decorators like UUID generation, JSONB) | High | Medium | Rewrite entity decorators to be portable; use TypeORM's `simple-json` column type; use string UUIDs generated app-side |
| Removing Redis breaks event broadcasting | Medium | Medium | Replace with Node.js `EventEmitter` — same API surface, in-memory, single-node |
| OpenAI rate limits hit during testing | Low | Low | Use cached announcement responses; add per-minute backoff |
| Caddy auto-cert fails on first deploy | Low | Medium | Test with `--debug` flag; document fallback to staging cert endpoint |
| Single VPS becomes unavailable | Real | Low | Daily SQLite backup to off-VPS storage (rclone to S3-compatible cheap provider); acceptable for personal use |
| SQLite write contention between operational and telemetry | Low | Low | Two database files; WAL mode; telemetry writes are batched anyway |

---

## SUCCESS CRITERIA

The simplification is successful when:

1. `docker compose up` brings up the entire backend stack with **no postgres or redis containers** — just backend + ai-service (+ optional caddy)
2. Backend persists data to `./data/operational.db` and `./data/telemetry.db`
3. Full E2E smoke (register → mission → round → telemetry → announcement) passes against SQLite + in-memory broadcasting
4. Cost to run on a $5/mo VPS is realistic: backend (~150 MB RAM) + ai-service (~120 MB RAM) + Caddy (~20 MB RAM) = ~300 MB RAM total, well under 2 GB
5. Mobile app continues to work unchanged
6. Desktop agent continues to work unchanged
7. Extension continues to work unchanged
8. AI announcements use < 1k input tokens and < 200 output tokens per call
9. Documentation reflects the new architecture; old K8s/Redis/Postgres docs removed or archived
10. VPS deployment guide is complete and actionable

---

## REFERENCE: WHAT GETS DELETED

Specific paths that will be removed:

```
infra/k8s/                                          # entire directory
packages/backend/src/modules/redis/                 # entire directory
packages/backend/src/database/migrations/1700000000000-InitialSchema.ts  # rewritten as SQLite
docker-compose.yml's `postgres` and `redis` services # services removed (compose file retained for ollama profile)
.github/workflows/deploy.yml's K8s sections         # rewritten as VPS deploy
packages/backend/package.json: "pg", "ioredis"      # deps removed
packages/backend/.env.example: REDIS_*, DATABASE_*  # replaced with DATABASE_PATH
```

What gets added:

```
docker-compose.prod.yml                             # production compose with Caddy
Caddyfile                                           # Caddy config
scripts/vps-bootstrap.sh                            # one-shot VPS setup
scripts/backup-sqlite.sh                            # SQLite backup helper
packages/backend/src/database/migrations/1700000000000-InitialSchemaSqlite.ts  # new migration
data/.gitkeep                                       # data directory placeholder
```

---

Next document: [`MIGRATION_STRATEGY.md`](MIGRATION_STRATEGY.md) — how we sequence these changes safely.
