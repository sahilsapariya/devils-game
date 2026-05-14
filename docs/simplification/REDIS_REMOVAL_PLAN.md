# REDIS REMOVAL PLAN

Detailed step-by-step plan for removing Redis from `packages/backend/`.

**Target:** Single-process backend with in-memory caching and in-memory event broadcasting. No Redis dependency.

---

## WHAT REDIS WAS DOING

Three roles in the current backend:

1. **Cache layer** — `@Cacheable({ ttlSeconds })` decorator on read-heavy service methods
2. **Pub/Sub for event broadcasting** — backend modules publish to `extraction:events:broadcast:${userId}`; `EventBroadcasterService` subscribes via `PSUBSCRIBE` and fans out to Socket.io rooms
3. **Future: BullMQ queues** — installed but not yet wired

All three roles assumed multi-pod deployment. For a single-node, single-user backend, **none** of them justifies a separate process.

---

## REPLACEMENT STRATEGY

| Role | Replacement | Why it works |
|---|---|---|
| Cache | In-memory `Map` with TTL via simple LRU | Single process; no cross-process sharing needed |
| Pub/Sub | Node.js `EventEmitter` | Same single-process scope; identical fire-and-forget semantics |
| BullMQ (future) | Synchronous side-effects on event commit OR in-process scheduling via `setInterval` / `node-cron` | Single user means no queue throughput concerns |

---

## DEPENDENCY CHANGES

### Remove

```json
{
  "dependencies": {
    "ioredis": "(remove)",
    "@socket.io/redis-adapter": "(remove)",
    "bullmq": "(remove — was unused anyway)"
  }
}
```

### Add

```json
{
  "dependencies": {
    "lru-cache": "^11.0.0"
  }
}
```

Already in use in `ai-service`; same package family.

---

## CONFIGURATION CHANGES

### `.env.example` (backend)

Remove:
```
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_DB=0
REDIS_PASSWORD=
REDIS_KEY_PREFIX=extraction
```

No replacement env vars needed — in-memory replacements have no config surface.

### `packages/backend/src/config/redis.config.ts`

**Delete the file.**

### `packages/backend/src/app.module.ts`

Remove the `RedisModule` import.

---

## CODE CHANGES

### 1. Delete the Redis module

```
packages/backend/src/modules/redis/
├── redis.module.ts          DELETE
├── redis.service.ts         DELETE
└── cacheable.decorator.ts   REWRITE (in-memory version, moved to new location)
```

### 2. New cache module (lightweight, in-memory)

Create `packages/backend/src/modules/cache/`:

**`cache.module.ts`:**
```typescript
import { Global, Module } from '@nestjs/common';
import { CacheService } from './cache.service';

@Global()
@Module({
  providers: [CacheService],
  exports: [CacheService],
})
export class CacheModule {}
```

**`cache.service.ts`:**
```typescript
import { Injectable, Logger, OnApplicationShutdown } from '@nestjs/common';
import { LRUCache } from 'lru-cache';

@Injectable()
export class CacheService implements OnApplicationShutdown {
  private readonly logger = new Logger(CacheService.name);
  private readonly cache = new LRUCache<string, unknown>({
    max: 10_000,
    ttl: 1000 * 60 * 60,   // 1 hour default; overridable per set()
    updateAgeOnGet: false,
  });

  get<T = unknown>(key: string): T | undefined {
    return this.cache.get(key) as T | undefined;
  }

  set<T = unknown>(key: string, value: T, ttlSeconds?: number): void {
    if (ttlSeconds !== undefined) {
      this.cache.set(key, value, { ttl: ttlSeconds * 1000 });
    } else {
      this.cache.set(key, value);
    }
  }

  del(key: string): void {
    this.cache.delete(key);
  }

  has(key: string): boolean {
    return this.cache.has(key);
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }

  onApplicationShutdown(): void {
    this.cache.clear();
    this.logger.log('Cache cleared on shutdown');
  }
}
```

**`cacheable.decorator.ts`** (rewritten for in-memory; same API surface):
```typescript
import { CacheService } from './cache.service';

export interface CacheableOptions {
  ttlSeconds: number;
  keyPrefix?: string;
}

/**
 * Method decorator that memoizes the result in the in-memory CacheService.
 *
 * The decorated method's class must have a `cacheService: CacheService` property
 * (injected via constructor) — same constraint as the previous Redis-backed version.
 */
export function Cacheable(options: CacheableOptions): MethodDecorator {
  return (target, propertyKey, descriptor: PropertyDescriptor) => {
    const originalMethod = descriptor.value;
    const className = target.constructor.name;
    const prefix = options.keyPrefix ?? `${className}.${String(propertyKey)}`;

    descriptor.value = async function (...args: unknown[]) {
      const cache: CacheService = (this as any).cacheService;
      if (!cache) {
        // Defensive: fall through if no cache available
        return originalMethod.apply(this, args);
      }
      const key = `${prefix}:${JSON.stringify(args)}`;
      const cached = cache.get(key);
      if (cached !== undefined) return cached;
      const result = await originalMethod.apply(this, args);
      cache.set(key, result, options.ttlSeconds);
      return result;
    };

    return descriptor;
  };
}
```

### 3. Event broadcasting — replace Redis pub/sub with EventEmitter

**Before (`EventBroadcasterService` excerpt):**
```typescript
const psub = this.redisService.getSubscriber();
await psub.psubscribe('extraction:events:broadcast:*');
psub.on('pmessage', (pattern, channel, message) => {
  // ... emit to Socket.io room
});
```

**After:**

Create a new injectable `OperationalEventBus`:

**`packages/backend/src/modules/events/operational-event-bus.service.ts`:**
```typescript
import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter } from 'events';

export interface OperationalBroadcast {
  userId: string;
  eventType: string;
  payload: Record<string, unknown>;
  occurredAt: string;
}

@Injectable()
export class OperationalEventBus {
  private readonly logger = new Logger(OperationalEventBus.name);
  private readonly emitter = new EventEmitter();

  constructor() {
    // Allow many subscribers (Socket.io clients, internal services) per user
    this.emitter.setMaxListeners(1000);
  }

  publish(broadcast: OperationalBroadcast): void {
    this.emitter.emit(`user:${broadcast.userId}`, broadcast);
    this.emitter.emit('user:*', broadcast);
  }

  subscribeToUser(userId: string, handler: (b: OperationalBroadcast) => void): () => void {
    const channel = `user:${userId}`;
    this.emitter.on(channel, handler);
    return () => this.emitter.off(channel, handler);
  }

  subscribeToAll(handler: (b: OperationalBroadcast) => void): () => void {
    this.emitter.on('user:*', handler);
    return () => this.emitter.off('user:*', handler);
  }
}
```

Register it in `EventsModule`:
```typescript
@Module({
  providers: [EventsService, OperationalEventBus, ...],
  exports: [EventsService, OperationalEventBus],
})
export class EventsModule {}
```

**`EventsService.emit()`** — instead of publishing to Redis, calls `operationalEventBus.publish(...)`.

**`EventBroadcasterService`** — replace the Redis psubscribe block with:
```typescript
@Injectable()
export class EventBroadcasterService implements OnApplicationBootstrap, OnApplicationShutdown {
  private unsubscribe?: () => void;

  constructor(
    private readonly bus: OperationalEventBus,
    private readonly gateway: OperationalGateway,
  ) {}

  onApplicationBootstrap() {
    this.unsubscribe = this.bus.subscribeToAll(broadcast => {
      const namespace = this.gateway.getNamespace();
      const room = `user:${broadcast.userId}`;
      const socketEvent = this.mapEventToSocketEvent(broadcast.eventType);
      if (!socketEvent) return;
      namespace.to(room).emit(socketEvent, broadcast);
    });
  }

  onApplicationShutdown() {
    this.unsubscribe?.();
  }

  // mapEventToSocketEvent stays as-is
}
```

### 4. Socket.io adapter — back to default

`packages/backend/src/main.ts`:

**Before** (planned but never wired): Redis adapter for multi-pod scaling

**After**: Use Nest's default `IoAdapter`:
```typescript
import { IoAdapter } from '@nestjs/platform-socket.io';
// ...
app.useWebSocketAdapter(new IoAdapter(app));
```

Already what the code does — just confirm no `@socket.io/redis-adapter` imports remain.

### 5. Health check

`packages/backend/src/modules/health/health.controller.ts`:

Replace Redis ping with in-memory check:

```typescript
@Get()
async getHealth() {
  const dbOk = await this.dataSource.query('SELECT 1').then(() => true).catch(() => false);
  return {
    status: dbOk ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    components: {
      database: { status: dbOk ? 'ok' : 'error' },
      cache: { status: 'ok', size: this.cacheService.size() },
      eventBus: { status: 'ok' },
    },
  };
}
```

### 6. Module dependency updates

Every module that previously imported `RedisModule` now imports `CacheModule` (which is `@Global` so usually no explicit import needed).

Files to grep + edit:
- `packages/backend/src/modules/**/*.module.ts` — remove `RedisModule` imports
- `packages/backend/src/modules/**/*.service.ts` — replace `private readonly redisService: RedisService` with `private readonly cacheService: CacheService` where caching was used; replace `redisService.publish(...)` with `operationalEventBus.publish(...)` where pub/sub was used

---

## SHARED PACKAGE CHANGE

`packages/shared/src/constants/events.ts` has Redis channel constants:

```typescript
export const REDIS_CHANNELS = {
  EVENT_BROADCAST: 'extraction:events:broadcast',
  ANNOUNCEMENT_QUEUE: 'extraction:announcements:queue',
  TELEMETRY_INGESTED: 'extraction:telemetry:ingested',
} as const;
```

**Keep this** — it documents the in-memory event topology even if Redis itself is gone. The constants serve as logical channel names for the EventEmitter. Optionally rename to `INTERNAL_CHANNELS` for clarity. **Recommended: rename**.

---

## DOCKER COMPOSE CHANGES

Remove the `redis` service block from `docker-compose.yml`.

---

## VERIFICATION CHECKLIST

- [ ] `npm install` succeeds (no `ioredis`, no `@socket.io/redis-adapter`)
- [ ] `npx tsc --noEmit` passes in `packages/backend/`
- [ ] `node dist/main.js` boots successfully without `REDIS_HOST` env var being set
- [ ] `curl http://localhost:3001/health` returns 200 with `components.cache.status: ok`
- [ ] Boot a Socket.io client locally; verify it receives broadcast events (e.g., after a round state change)
- [ ] No `ioredis` strings appear in `git grep` of `packages/backend/src/`
- [ ] No `RedisService` strings appear in `git grep`

---

## KNOWN CAVEATS

1. **No cross-process sharing** — the in-memory cache and event bus live in the single Node process. If we ever scale to multi-process (Cluster), this needs revisiting. Not a current concern.
2. **Cache is lost on restart** — fine. Operational state is in SQLite anyway.
3. **No event replay** — the Redis-based design had an option for Redis Streams as event replay; we never wired it. SQLite `events` table provides full replay capability already.
4. **Backpressure** — Node's EventEmitter has no backpressure semantics. For a single-user system with < 10 events/second, this is irrelevant.

---

## ROLLBACK

If in-memory broadcasting causes problems, the rollback path is straightforward:
- `git revert` the Redis-removal commit
- `npm install` restores `ioredis`
- Docker Compose: re-add `redis` service
- Backend re-boots with Redis-backed pub/sub

But there is no reason to expect this to be needed for a single-user workload.
