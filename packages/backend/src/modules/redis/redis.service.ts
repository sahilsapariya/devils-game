import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
} from '@nestjs/common';
import type { Redis } from 'ioredis';

import { REDIS_CLIENT, REDIS_SUBSCRIBER } from './redis.constants';

export type RedisMessageHandler = (channel: string, message: string) => void;

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private readonly handlers = new Map<string, Set<RedisMessageHandler>>();

  constructor(
    @Inject(REDIS_CLIENT) private readonly client: Redis,
    @Inject(REDIS_SUBSCRIBER) private readonly subscriber: Redis,
  ) {
    this.subscriber.on('message', (channel, message) => {
      const handlers = this.handlers.get(channel);
      if (!handlers || handlers.size === 0) {
        return;
      }
      for (const handler of handlers) {
        try {
          handler(channel, message);
        } catch (error) {
          this.logger.error(
            `Redis subscriber handler threw for channel "${channel}"`,
            error instanceof Error ? error.stack : String(error),
          );
        }
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Key/value cache helpers
  // ---------------------------------------------------------------------------

  async get<T>(key: string): Promise<T | null> {
    const raw = await this.client.get(key);
    if (raw === null) {
      return null;
    }
    try {
      return JSON.parse(raw) as T;
    } catch {
      // Allow non-JSON string values to pass through (caller assumes string).
      return raw as unknown as T;
    }
  }

  async set(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
    const serialized = typeof value === 'string' ? value : JSON.stringify(value);
    if (ttlSeconds && ttlSeconds > 0) {
      await this.client.set(key, serialized, 'EX', ttlSeconds);
    } else {
      await this.client.set(key, serialized);
    }
  }

  async del(key: string | string[]): Promise<number> {
    if (Array.isArray(key)) {
      if (key.length === 0) {
        return 0;
      }
      return this.client.del(...key);
    }
    return this.client.del(key);
  }

  async exists(key: string): Promise<boolean> {
    const result = await this.client.exists(key);
    return result === 1;
  }

  async incrBy(key: string, by: number): Promise<number> {
    return this.client.incrby(key, by);
  }

  async expire(key: string, ttlSeconds: number): Promise<void> {
    await this.client.expire(key, ttlSeconds);
  }

  // ---------------------------------------------------------------------------
  // Pub/Sub
  // ---------------------------------------------------------------------------

  async publish(channel: string, message: unknown): Promise<number> {
    const payload =
      typeof message === 'string' ? message : JSON.stringify(message);
    return this.client.publish(channel, payload);
  }

  async subscribe(channel: string, handler: RedisMessageHandler): Promise<void> {
    let set = this.handlers.get(channel);
    if (!set) {
      set = new Set<RedisMessageHandler>();
      this.handlers.set(channel, set);
      await this.subscriber.subscribe(channel);
    }
    set.add(handler);
  }

  async unsubscribe(
    channel: string,
    handler?: RedisMessageHandler,
  ): Promise<void> {
    const set = this.handlers.get(channel);
    if (!set) {
      return;
    }
    if (handler) {
      set.delete(handler);
    }
    if (!handler || set.size === 0) {
      this.handlers.delete(channel);
      await this.subscriber.unsubscribe(channel);
    }
  }

  // ---------------------------------------------------------------------------
  // Health
  // ---------------------------------------------------------------------------

  async ping(): Promise<boolean> {
    const reply = await this.client.ping();
    return reply === 'PONG';
  }

  /** Direct access for advanced operations (transactions, pipelines). */
  getClient(): Redis {
    return this.client;
  }

  async onModuleDestroy(): Promise<void> {
    try {
      await this.subscriber.quit();
    } catch (error) {
      this.logger.warn(
        `Failed to quit Redis subscriber: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    try {
      await this.client.quit();
    } catch (error) {
      this.logger.warn(
        `Failed to quit Redis client: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
