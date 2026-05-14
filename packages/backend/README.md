# @extraction/backend

NestJS application that hosts the PROJECT EXTRACTION operational hub:
authentication, mission engine, event sourcing, telemetry ingestion,
scoring, consequences, difficulty engine, announcements, and a Socket.io
real-time gateway.

## Module map

| Module | Responsibility |
| --- | --- |
| `AuthModule` | JWT login / register / refresh |
| `UsersModule` | User CRUD, preferences |
| `MissionsModule` | Mission lifecycle |
| `RoundsModule` | Round lifecycle + operational state machine |
| `EventsModule` | Append-only event store + dispatcher + snapshots |
| `TelemetryModule` | Telemetry batch ingestion + decomposition |
| `ScoringModule` | Multi-signal productivity scoring + anomaly detection |
| `ConsequencesModule` | Consequence issuance + acknowledgement |
| `DifficultyModule` | Sustainable ceiling + adaptive difficulty vector |
| `AnnouncementsModule` | AI client + template fallback + persistence |
| `WebsocketsModule` | Socket.io gateway + Redis broadcaster |
| `HealthModule` | `/health` liveness |
| `RedisModule` | ioredis client + pub/sub + cache helpers |

## REST endpoints (all under `/api`, JWT-guarded unless noted)

### Auth (`AuthModule`)
- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/refresh`

### Users
- `GET /api/users/me`
- `PATCH /api/users/me`

### Missions
- `GET /api/missions`
- `POST /api/missions`
- `GET /api/missions/:id`
- `PATCH /api/missions/:id`

### Rounds
- `GET /api/rounds/current`
- `GET /api/rounds?status=&missionId=&limit=&offset=`
- `POST /api/rounds`
- `GET /api/rounds/:id`
- `PATCH /api/rounds/:id`
- `POST /api/rounds/:id/start`
- `POST /api/rounds/:id/complete`
- `POST /api/rounds/:id/abandon`
- `GET /api/rounds/:id/behavioral-record`

### Events
- `GET /api/events?roundId=&type=&limit=&offset=` (own events only)

### Telemetry
- `POST /api/telemetry/batch`

### Consequences
- `GET /api/consequences`
- `PATCH /api/consequences/:id/acknowledge`

### Announcements
- `GET /api/announcements?status=pending|delivered&roundId=&limit=&offset=`
- `PATCH /api/announcements/:id/acknowledge`
- `POST /api/announcements/:id/played`

### Health
- `GET /health` (no prefix)

## Socket.io

Namespace: `/operational`. JWT supplied as `handshake.auth.token` or query `token`.

Client → Server:
- `telemetry:batch` — same payload as `POST /api/telemetry/batch`
- `round:status` — returns current round summary
- `user:check-in` — emits a `behavior.recovery_action` event

Server → Client (per-user rooms `user:${userId}` and `round:${roundId}`):
- `round:started`
- `round:updated`
- `behavioral:violation-detected`
- `announcement:incoming`
- `consequence:issued`
- `state:transitioned`
- `stats:update`

## Background pipeline

Events emitted via `EventsService.emit` are:
1. Persisted to `events` table (append-only).
2. Pushed to Redis Stream `extraction:events:stream` (capped at ~100k entries).
3. Published to `extraction:events:broadcast:${userId}` for Socket.io fan-out.

The `EventProcessor` reacts to events of interest:
- `round.completed` → publishes hints on `extraction:work:scoring`,
  `extraction:work:difficulty`, `extraction:work:announcements`.
- `behavior.distraction_detected` → updates round violation counter and
  publishes `extraction:work:state-escalation` once threshold is crossed.
- `state.transition` → caches the new state at `user:${userId}:current_state`.

A BullMQ wrapper (queues `events`, `announcements`, `scoring`, `difficulty`) is
the planned deployment topology; in this Phase the EventProcessor methods
can be invoked directly or driven from a Redis-stream consumer.

## AI Service

The backend talks to a separate microservice at `AI_SERVICE_URL` (default
`http://localhost:4001`) via `AiClientService`. Endpoints called:

- `POST /internal/generate-announcement`
- `POST /internal/analyze-behavior`
- `GET /health`

Each call has a 5s timeout and exponential backoff (1s, 2s, 4s — max 3
retries). On total failure callers fall back to hardcoded templates.

## Env vars (additions for Phase 2)

```
AI_SERVICE_URL=http://localhost:4001
HMAC_VERIFICATION_ENABLED=false
```

## Required new dependencies

```
npm install bullmq @socket.io/redis-adapter socket.io
```

(`@nestjs/websockets`, `@nestjs/platform-socket.io` were already declared.)
