import { CacheService } from './cache.service';

/**
 * Memoizes the result of an async instance method in the in-memory CacheService.
 *
 * The decorated class MUST expose a `cacheService: CacheService` property
 * (typically through constructor injection). For backward compatibility, the
 * decorator also looks at a `cache` property as a fallback.
 *
 * Cache key: `<className>:<method>:<JSON.stringify(args)>` unless `keyPrefix`
 * is supplied. Avoid using on methods with non-serializable args.
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
      options.keyPrefix ?? `${target.constructor.name}:${String(propertyKey)}`;

    descriptor.value = async function cached(
      this: { cacheService?: CacheService; cache?: CacheService },
      ...args: unknown[]
    ): Promise<unknown> {
      const cache = this.cacheService ?? this.cache;
      if (!cache) {
        // Graceful degradation — if cache isn't available on `this`, just call through.
        return original.apply(this, args);
      }

      const key = `${namespace}:${JSON.stringify(args)}`;
      const cached = cache.get<unknown>(key);
      if (cached !== undefined) {
        return cached;
      }

      const result = await original.apply(this, args);
      cache.set(key, result, options.ttlSeconds);
      return result;
    } as AsyncMethod;

    return descriptor;
  };
}
