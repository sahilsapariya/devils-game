import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { LRUCache } from 'lru-cache';
import type { AnnouncementType } from '../text-generation/prompt-templates';

const TEN_MIN = 10 * 60 * 1000;
const ONE_DAY = 24 * 60 * 60 * 1000;
const SEVEN_DAYS = 7 * ONE_DAY;

/**
 * Per-announcement-type TTLs (ms). Status / pressure feel fresh; behavioral
 * patterns change slowly; ambient barely changes.
 */
export const TTL_BY_TYPE: Record<AnnouncementType, number> = {
  status_report: TEN_MIN,
  pressure_escalation: TEN_MIN,
  behavioral_analysis: ONE_DAY,
  recovery_offer: ONE_DAY,
  ambient_presence: SEVEN_DAYS,
  operational_update: TEN_MIN,
};

export interface CacheStats {
  size: number;
  hits: number;
  misses: number;
  hitRate: number;
}

// LRUCache requires the value generic to extend non-nullable object.
type CacheValue = Record<string, unknown>;

@Injectable()
export class AnnouncementCacheService {
  // Single LRU with maximum TTL; per-entry TTLs are set on .set()
  private readonly cache: LRUCache<string, CacheValue>;
  private hits = 0;
  private misses = 0;

  constructor() {
    this.cache = new LRUCache<string, CacheValue>({
      max: 500,
      ttl: SEVEN_DAYS,
      ttlAutopurge: true,
    });
  }

  /**
   * Build a stable cache key from (type, compact context). Identical structured
   * contexts always produce identical keys, so they reuse the same cached
   * announcement.
   */
  buildKey(type: AnnouncementType, compactContext: unknown): string {
    const canonical = stableStringify({ t: type, c: compactContext ?? null });
    const hash = createHash('sha1').update(canonical).digest('hex');
    return `${type}:${hash}`;
  }

  get<T extends CacheValue>(key: string): T | undefined {
    const value = this.cache.get(key) as T | undefined;
    if (value === undefined) {
      this.misses++;
      return undefined;
    }
    this.hits++;
    return value;
  }

  set<T extends CacheValue>(key: string, value: T, type: AnnouncementType): void {
    const ttl = TTL_BY_TYPE[type] ?? TEN_MIN;
    this.cache.set(key, value, { ttl });
  }

  stats(): CacheStats {
    const total = this.hits + this.misses;
    return {
      size: this.cache.size,
      hits: this.hits,
      misses: this.misses,
      hitRate: total === 0 ? 0 : Number((this.hits / total).toFixed(4)),
    };
  }
}

/** Deterministic JSON stringify (sorted keys) so equivalent objects key the same. */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
}
