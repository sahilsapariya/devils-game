# MIGRATION STRATEGY

How we move from the current SaaS-oriented architecture to the simplified single-user / self-hosted architecture **without breaking the system**.

---

## PRINCIPLES

1. **Atomic per-subsystem refactor** — each subagent owns one well-defined slice; no merge conflicts
2. **No data preservation needed** — there is no production deployment yet; we can wipe and restart
3. **Compile-clean at every commit** — the system must build between each refactor commit
4. **E2E smoke at the end** — verify the full operator flow against the simplified stack before declaring done
5. **Reversible** — if anything goes wrong, we can `git revert` since all changes are isolated commits

---

## REFACTOR SUBAGENT TOPOLOGY

Three parallel subagents, each with disjoint file ownership:

```
Subagent BACKEND-SIMPLIFY            Subagent AI-OPENAI               Subagent INFRA-VPS
─────────────────────────            ─────────────────────            ───────────────────────
packages/backend/**                  packages/ai-service/**           infra/**
  (SQLite + Redis removal)             (OpenAI + token optimization)    (delete K8s)
docker-compose.yml                                                    docker-compose.prod.yml (new)
  (drops postgres + redis services)                                   Caddyfile (new)
                                                                      scripts/vps-bootstrap.sh (new)
                                                                      scripts/backup-sqlite.sh (new)
                                                                      .github/workflows/deploy.yml
                                                                        (rewrite for VPS)
```

No two subagents touch the same file. Mergeable in any order.

---

## SUBAGENT BACKEND-SIMPLIFY — SEQUENCING WITHIN

The most complex subagent. Order matters within it:

```
Step 1: Replace Redis with in-memory equivalents          (small, easy, ~1h work)
        ├─ Delete RedisModule + ioredis dep
        ├─ Cacheable decorator → in-memory Map with TTL
        ├─ EventBroadcaster → Node EventEmitter
        └─ Health check no longer pings Redis

Step 2: Verify Step 1 by building (npm run build)         (gate before SQLite work)

Step 3: SQLite migration                                  (large, careful, ~3h work)
        ├─ Swap pg driver → better-sqlite3
        ├─ Update DataSource configuration (dual DB)
        ├─ Rewrite entity decorators (UUID generation, JSONB → simple-json)
        ├─ Rewrite InitialSchema migration as SQLite-compatible
        ├─ Update repositories for any pg-specific query patterns
        └─ Update .env.example (DATABASE_PATH instead of DATABASE_HOST etc)

Step 4: Update docker-compose.yml                         (delete postgres + redis services)

Step 5: Verify by running migration + booting backend + E2E smoke
```

Why this order: Redis removal is independent and reversible; it de-risks the larger SQLite refactor by leaving fewer moving pieces.

---

## ENTITY DECORATOR COMPATIBILITY MATRIX

Most entities will work unchanged. These need attention:

| Postgres-specific feature | SQLite-compatible replacement |
|---|---|
| `@PrimaryGeneratedColumn('uuid')` | `@PrimaryColumn('uuid')` + generate UUID app-side in service layer (`uuid` package or `crypto.randomUUID()`) |
| `@Column('jsonb')` | `@Column('simple-json')` (TypeORM serializes/deserializes JSON automatically) |
| `@Column({ type: 'timestamptz' })` | `@Column({ type: 'datetime' })` (SQLite stores as TEXT; TypeORM handles Date conversion) |
| Indexes with `WHERE` clauses (partial) | Removed — SQLite supports them but TypeORM's decorator API doesn't expose this cleanly; not needed for single-user volumes |
| `gen_random_uuid()` default in migration | App-side UUID generation |
| `now()` default | `CURRENT_TIMESTAMP` |
| `text` type | `text` (works fine) |
| `int`, `bigint` | `integer` (SQLite uses INTEGER for all int sizes) |

Action: A single sweep through `packages/backend/src/database/entities/` updates ~10 decorator usages.

---

## MIGRATION FILE STRATEGY

Two options:

**Option A: Rewrite InitialSchema as SQLite-only** (chosen)
- Delete the existing Postgres migration
- Generate a new initial schema migration with `npm run migration:generate` after entities are updated
- Single migration file that creates all tables fresh

**Option B: Add a parallel SQLite migration alongside the Postgres one**
- More complex; supports both DBs
- Rejected — we are single-DB now, no need

The migration's name remains `1700000000000-InitialSchema` for continuity; only the body changes.

---

## SHARED PACKAGE STAYS UNTOUCHED

`packages/shared/` contains only TypeScript types and constants. None of it is DB- or Redis-specific. Zero changes needed.

---

## CLIENT PACKAGES STAY UNTOUCHED

| Package | Change required? |
|---|---|
| Mobile (React Native) | No. Client speaks REST + Socket.io. Doesn't care what DB or broker is behind. |
| Desktop agent (Go) | No. HMAC + REST. Same. |
| Browser extension | No. REST only. |

If client tests fail post-refactor, it's a backend bug, not a client bug.

---

## TESTING STRATEGY

After all three subagents complete:

```bash
# 1. Static verification
npm install
npm --workspace @extraction/shared run build
for pkg in shared backend ai-service mobile extension; do
  (cd packages/$pkg && npx tsc --noEmit)
done
(cd packages/desktop-agent && go build -o ./bin/agent ./cmd/agent && go vet ./...)
(cd packages/extension && npm run build)

# 2. Runtime verification (dev mode)
docker compose up -d   # should bring up NOTHING by default (no postgres, no redis)
                       # only ollama if you ran `docker compose --profile ai up`
cd packages/backend
npm run migration:run  # creates ./data/operational.db and ./data/telemetry.db
nohup node dist/main.js > /tmp/backend.log 2>&1 &
sleep 5
curl http://localhost:3001/health  # must be 200, components: {sqlite, in_memory_cache}

cd ../ai-service
nohup node dist/main.js > /tmp/ai.log 2>&1 &
sleep 5
curl http://localhost:4001/health  # 200, providers: {openai: bool, ollama: bool}

# 3. Full E2E (as before, but against SQLite + in-memory)
# Register, login, mission, round, telemetry, announcement
```

Production verification:

```bash
# 4. Production stack
docker compose -f docker-compose.prod.yml up -d
# Should bring up: backend, ai-service, caddy
# Caddy fronts both at https://<domain>/api/* and https://<domain>/ai-internal/*
# (or however Caddyfile routes them)
```

---

## ROLLBACK PLAN

If a refactor lands and breaks E2E:

1. `git revert <commit>` — refactors are isolated commits
2. Investigate failure mode
3. Re-dispatch fix subagent with specific issue scope

Because there is no production deployment yet, rollback is purely a local concern.

---

## WHAT THE SUBAGENTS WILL **NOT** DO

To avoid scope creep, each subagent has clear no-touch zones:

**BACKEND-SIMPLIFY will NOT:**
- Modify the event sourcing logic
- Modify the state machine
- Modify scoring / consequence / difficulty engines
- Modify any controller or DTO (the API surface is stable)
- Modify auth flow
- Delete the `users` table or simplify it
- Touch any other package

**AI-OPENAI will NOT:**
- Modify text-generation prompt structure (operational tone stays)
- Modify quality gates
- Modify behavioral analyzer algorithm
- Delete Anthropic/Ollama support (just demote them)
- Touch any other package

**INFRA-VPS will NOT:**
- Modify any application code
- Modify package.json files
- Modify Dockerfiles (just docker-compose orchestration)
- Touch shared package

---

## EXPECTED OUTCOME

After all three subagents land + docs reconciliation:

- **Backend** runs on SQLite + in-memory broadcasting on a single Node process
- **AI service** defaults to OpenAI GPT-5.4 nano with token-optimized prompts
- **Production deployment** is `docker compose -f docker-compose.prod.yml up -d` on any VPS with Docker installed
- **Caddy** provides automatic HTTPS for the domain
- **Cost** to operate is < $10/month for the single operator (VPS + AI usage)
- **No** Kubernetes, no Redis, no Postgres, no managed services required
- **Mobile, desktop, extension** clients continue to function unchanged
- **Core product features** (state machine, immersion, difficulty, telemetry, consequences) intact

---

Next: [`SQLITE_MIGRATION_PLAN.md`](SQLITE_MIGRATION_PLAN.md) and [`REDIS_REMOVAL_PLAN.md`](REDIS_REMOVAL_PLAN.md) for per-subsystem detail.
