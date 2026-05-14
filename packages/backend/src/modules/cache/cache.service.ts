import { Injectable, Logger, OnApplicationShutdown } from '@nestjs/common';
import { LRUCache } from 'lru-cache';

/**
 * Process-local cache backed by `lru-cache`. Replacement for the previous
 * Redis-backed implementation; same logical surface (get/set/del with TTL).
 *
 * Constraints:
 *  - Cache is not shared across processes — fine for the single-node backend.
 *  - Values are stored by reference; callers should not mutate cached objects.
 *  - On shutdown the cache is fully cleared so no stale data leaks across restarts.
 *
 * Internal note: `lru-cache@^11` requires the value generic to be a non-nullish
 * type. We wrap every value in `{ v: T }` so callers can store primitives,
 * objects, or even `null` without fighting the type constraint.
 */
interface Wrapped<T> {
  v: T;
}

@Injectable()
export class CacheService implements OnApplicationShutdown {
  private readonly logger = new Logger(CacheService.name);
  private readonly cache = new LRUCache<string, Wrapped<unknown>>({
    max: 10_000,
    ttl: 1000 * 60 * 60, // 1 hour default; overridable per set()
    updateAgeOnGet: false,
  });

  get<T = unknown>(key: string): T | undefined {
    const wrapped = this.cache.get(key);
    return wrapped === undefined ? undefined : (wrapped.v as T);
  }

  set<T = unknown>(key: string, value: T, ttlSeconds?: number): void {
    const wrapped: Wrapped<T> = { v: value };
    if (ttlSeconds !== undefined && ttlSeconds > 0) {
      this.cache.set(key, wrapped, { ttl: ttlSeconds * 1000 });
    } else {
      this.cache.set(key, wrapped);
    }
  }

  del(key: string | string[]): number {
    if (Array.isArray(key)) {
      let count = 0;
      for (const k of key) {
        if (this.cache.delete(k)) count += 1;
      }
      return count;
    }
    return this.cache.delete(key) ? 1 : 0;
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
