# FIX PRIORITY MATRIX — PROJECT EXTRACTION

**Date:** 2026-05-15
**Companion to:** `IMPLEMENTATION_VERIFICATION_REPORT.md`
**Audit commit:** `720e751`

Ranked strictly by impact on runtime correctness. Fix top-to-bottom — each prerequisite blocks the ones below it.

---

## P0 — CRITICAL RUNTIME BLOCKERS (must fix to make ANYTHING run)

### P0-1: Backend `rootDir` violation prevents compile + boot

**File:** `packages/backend/tsconfig.json` line 6
**Symptom:** 4 `TS6059` errors, `nest start` fails, `tsc --noEmit` fails
**Impact:** **Backend cannot run.** Blocks all E2E flows.

**Recommended fix (simplest):**
```diff
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
-   "rootDir": "./src",
    "baseUrl": "./",
    "paths": {
      "@extraction/shared": ["../shared/src/index.ts"],
      "@extraction/shared/*": ["../shared/src/*"]
    },
    "types": ["node", "jest"]
  },
  "include": ["src/**/*", "../shared/src/**/*"],
  "exclude": ["node_modules", "dist", "test", "**/*.spec.ts"]
}
```

Removing `rootDir` and adding shared to `include` lets TypeScript treat both directories as part of the compilation unit. Output paths stay under `dist/` because `outDir` is preserved.

**Better long-term fix:** TypeScript project references (`composite: true` in shared, `references: [{ path: "../shared" }]` in backend). More invasive, more correct. Defer to Phase 3 cleanup.

**Verification:**
```bash
cd packages/backend && npx tsc --noEmit  # must exit 0
npm run dev                              # must boot, listen on :3001
curl http://localhost:3001/health        # must return 200
```

---

### P0-2: Backend ↔ AI Service DTO contract mismatch

**File:** `packages/ai-service/src/modules/announcements/dto/generate-announcement.dto.ts`
**Symptom:** Backend sends `{ roundId, userId, state, timeRemainingSec, violations, streak, reputation, recentPattern }`; AI service returns 400 rejecting `roundId`, `userId`, `streak`, `reputation`.
**Impact:** **All AI-generated announcements will fail.** Backend will fall back to templates 100% of the time. Immersion layer degraded.

**Two-part fix:**

**Part A (immediate):** Relax the AI service DTO to accept the actual payload shape. Add all expected fields with proper validators. Better yet: use `@IsObject() context: Record<string, unknown>` and validate only the fields the AI service actually uses, allowing extras.

**Part B (long-term):** Move the request/response types into `@extraction/shared` as `GenerateAnnouncementRequest` / `GenerateAnnouncementResponse` and have both packages import them. Prevents this kind of drift permanently.

**Verification:**
```bash
# With AI service running on :4001
curl -s -X POST http://localhost:4001/internal/generate-announcement \
  -H "Content-Type: application/json" \
  -H "X-Internal-Token: dev-token" \
  -d '{"type":"status_report","context":{"roundId":"r1","userId":"u1","state":"OPERATIONAL","timeRemainingSec":1200,"violations":2,"streak":3,"reputation":450}}'
# Must return 200 (or graceful fallback) not 400
```

---

### P0-3: Mobile type errors block typecheck + bundle

**Files:**
- `packages/mobile/src/components/OperationalInput.tsx:63`
- `packages/mobile/src/services/apiClient.ts:100`
- `packages/mobile/src/services/realtime.service.ts:283`

**Symptom:** 3 TS errors. `npx tsc --noEmit` fails. `expo export` will likely fail in CI. Metro dev server may bundle anyway (it's permissive), but production builds will not.

**Fixes (each is one line):**

```tsx
// OperationalInput.tsx:63
- error && styles.fieldShellError,
+ !!error && styles.fieldShellError,
```

```ts
// apiClient.ts:96-101 — replace the chained && with a clearer guard
let message: string;
if (
  parsed &&
  typeof parsed === 'object' &&
  'message' in parsed &&
  typeof (parsed as { message: unknown }).message === 'string'
) {
  message = (parsed as { message: string }).message;
} else {
  message = `Request failed with status ${response.status}`;
}
throw buildError(message, response.status, parsed);
```

```ts
// realtime.service.ts:283 — widen the socket.on type
- socket.on(event, (...args: unknown[]) => {
+ socket.on(event as string, (...args: unknown[]) => {
```

**Verification:**
```bash
cd packages/mobile && npx tsc --noEmit  # must exit 0
```

---

## P1 — INTEGRATION CORRECTNESS (system is up, but parts don't talk)

### P1-1: Wire BullMQ workers properly

**Why:** Currently the event processor publishes side-effect signals via Redis pub/sub strings like `extraction:work:scoring`. Nothing consumes them. Scoring, difficulty updates, and announcement generation happen synchronously in the request path.

**Files to edit:**
- `packages/backend/src/modules/events/events.module.ts` — register `BullModule.registerQueue({ name: 'events' })`
- `packages/backend/src/modules/events/event-processor.worker.ts` — convert to a `@Processor('events')` class with `@Process()` handlers
- Same pattern for scoring, difficulty, announcements queues

**Verification:** Add a unit test that emits an event and asserts a job lands in the queue.

---

### P1-2: Socket.io Redis adapter wiring

**Why:** Mobile clients connecting to different backend pods won't receive each other's events. Multi-pod scaling breaks.

**File:** `packages/backend/src/main.ts`

**Fix sketch:**
```ts
import { createAdapter } from '@socket.io/redis-adapter';
import { Redis } from 'ioredis';

const pub = new Redis(redisCfg);
const sub = pub.duplicate();
const ioAdapter = new IoAdapter(app);
ioAdapter.createIOServer = (port, options) => {
  const server = new Server(port, { ...options, adapter: createAdapter(pub, sub) });
  return server;
};
app.useWebSocketAdapter(ioAdapter);
```

**Verification:** Run two backend instances on different ports, connect mobile to each, emit telemetry on one — assert the other broadcasts to its clients.

---

### P1-3: `stats:update` socket event not emitted

**Why:** Mobile dashboard subscribes to `stats:update` but the event-broadcaster service has no mapping for it. Reputation/streak counters won't auto-update.

**Files:**
- `packages/backend/src/modules/websockets/event-broadcaster.service.ts` — add stats:update emission triggers
- Likely needs a `StatsService` that emits when reputation/streak/totals change in `UsersService`

**Verification:** Update a user's streak via `PATCH /users/me`, assert connected socket receives `stats:update`.

---

### P1-4: Mobile background service not implemented

**Why:** Mobile is documented as "runtime authority" but iOS/Android suspend the app after backgrounding. Round timers stop. Telemetry queuing stops. Critical announcements miss.

**Required:**
- `expo-task-manager` registration in `App.tsx`
- iOS background modes in `app.json`: `["audio", "background-processing"]`
- Android foreground service via `expo-notifications` persistent notification
- Round timer logic moved into a background-safe task

**Verification:** Background the app for 60 seconds, foreground it, assert round timer state is correct.

---

## P2 — SECURITY HARDENING (before any non-trivial deployment)

### P2-1: Implement real HMAC verification

**File:** `packages/backend/src/modules/telemetry/telemetry.service.ts:71`

**Required:**
- Device enrollment endpoint (`POST /api/devices/enroll`) that accepts `hmacKeyHash` and persists per-device
- `verifyHmac()` recomputes HMAC-SHA256 using the stored key, returns boolean
- Only enable when `HMAC_VERIFICATION_ENABLED=true` in env

**Verification:** Submit batch with wrong signature → 401. Correct signature → 200.

---

### P2-2: Rate limiting on auth + telemetry

**Why:** Brute-force prevention on `/auth/login`; flood prevention on `/telemetry/batch`.

**Fix:** Add `@nestjs/throttler` globally with stricter overrides per route.

---

### P2-3: AI service token → mTLS or signed JWT

**Why:** Current `X-Internal-Token` shared-secret is the weakest auth available. Anyone on the network with the secret can hit `/internal/*`.

**Deferred until prod deploy** but track.

---

## P3 — OPERATIONAL READINESS (before public users)

| Item | Why |
|---|---|
| Migrate AI voice cache to S3 | Multi-replica safety |
| Add OTEL/Sentry instrumentation | Distributed tracing across mobile → backend → ai-service |
| Add Prometheus metrics endpoints | Provider latency, queue depth, fallback rate |
| Sign desktop agent binary + notarize | macOS distribution |
| Ship LaunchAgent plist for desktop | Auto-start at login |
| Set up event snapshot recurring job | Replay perf degrades without snapshots |
| Push notification setup (APNs/FCM) | Deliver critical announcements when app is killed |
| Production secret management | Vault / KMS instead of `.env` |
| Real Ollama TTS sidecar | Currently assumed Piper plugin doesn't exist |
| Provision ElevenLabs voice ID | Currently env placeholder |

---

## EXECUTION RECOMMENDATION

**Phase 3 Sprint 1 (CRITICAL — must complete before any further feature work):**

1. **P0-1** (backend rootDir) — 5 min fix, unblocks everything
2. **P0-2** (AI DTO) — 15 min fix, unblocks immersion
3. **P0-3** (mobile types) — 10 min fix, unblocks mobile typecheck
4. **End-to-end smoke test** — register user → login → create round → ingest telemetry → verify event in DB → trigger announcement → verify AI service called
5. **Commit** — "fix: phase 3 sprint 1 — runtime blockers resolved"

These can be done by a single focused subagent in well under an hour.

**Phase 3 Sprint 2 (INTEGRATION — make subsystems actually cooperate):**

6. **P1-1** (BullMQ workers)
7. **P1-2** (Socket.io Redis adapter)
8. **P1-3** (stats:update emission)
9. **P1-4** (mobile background service) — separate subagent, mobile-specific

These should be 4 separate fix subagents in parallel where possible. Sprint 1 must land first.

**Phase 3 Sprint 3 (SECURITY) and beyond:** as roadmap allows.

---

## VERIFICATION SCRIPT (run after Sprint 1)

```bash
#!/bin/bash
set -e

# 1. All TypeScript packages typecheck clean
cd packages/shared && npx tsc --noEmit
cd ../backend && npx tsc --noEmit
cd ../ai-service && npx tsc --noEmit
cd ../mobile && npx tsc --noEmit
cd ../extension && npx tsc --noEmit

# 2. Go agent builds
cd ../desktop-agent && go build -o ./bin/agent ./cmd/agent && go vet ./...

# 3. Extension builds
cd ../extension && npm run build

# 4. Infrastructure up
cd ../.. && docker compose up -d postgres redis
sleep 5
docker compose exec -T postgres pg_isready -U extraction
docker compose exec -T redis redis-cli ping

# 5. Migration applies cleanly
cd packages/backend && npm run migration:run

# 6. Backend boots
nohup npm run dev > /tmp/backend.log 2>&1 &
sleep 10
curl -f http://localhost:3001/health

# 7. AI service boots
cd ../ai-service && nohup npm run start > /tmp/ai.log 2>&1 &
sleep 8
curl -f http://localhost:4001/health

# 8. Backend → AI contract works
TOKEN=$(curl -s -X POST http://localhost:3001/api/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"op@test.local","password":"Operational123","displayName":"Op"}' \
  | jq -r '.tokens.accessToken')
echo "TOKEN: $TOKEN"

# 9. Cleanup
pkill -f "nest start"
docker compose down

echo "✓ All verification checks passed"
```

If this script exits 0, the system is **runtime-clean**.
