import { RedisService } from './redis.service';

/**
 * Memoizes the result of an async instance method in Redis.
 *
 * The decorated class MUST expose a `redis: RedisService` property
 * (typically through constructor injection).
 *
 * Cache key: `cache:<className>:<method>:<JSON.stringify(args)>` (after the
 * RedisService key prefix). Avoid using on methods with non-serializable args.
 *
 * Usage:
 *   @Cacheable({ ttlSeconds: 60 })
 *   async expensive(arg: string): Promise<Foo> { ... }
 */
export interface CacheableOptions {
  ttlSeconds: number;
  keyPrefix?: string;
}

type AsyncMethod = (...args: unknown[]) => Promise<unknown>;

export function Cacheable(options: CacheableOptions): MethodDecorator {
  if (!Number.isFinite(options.ttlSeconds) || options.ttlSeconds <= 0) {
    throw new Error('@Cacheable requires a positive ttlSeconds');
  }

  return function decorate(
    target: object,
    propertyKey: string | symbol,
    descriptor: PropertyDescriptor,
  ): PropertyDescriptor {
    const original = descriptor.value as AsyncMethod;
    if (typeof original !== 'function') {
      throw new Error('@Cacheable can only be applied to methods');
    }

    const namespace =
      options.keyPrefix ??
      `cache:${target.constructor.name}:${String(propertyKey)}`;

    descriptor.value = async function cached(
      this: { redis?: RedisService },
      ...args: unknown[]
    ): Promise<unknown> {
      const redis = this.redis;
      if (!redis) {
        // Graceful degradation — if Redis isn't available on `this`, just call through.
        return original.apply(this, args);
      }

      const key = `${namespace}:${JSON.stringify(args)}`;
      const cached = await redis.get<unknown>(key);
      if (cached !== null) {
        return cached;
      }

      const result = await original.apply(this, args);
      await redis.set(key, result, options.ttlSeconds);
      return result;
    } as AsyncMethod;

    return descriptor;
  };
}
