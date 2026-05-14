import { Global, Logger, Module, type Provider } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

import type { RedisConfig } from '../../config/redis.config';
import { REDIS_CLIENT, REDIS_SUBSCRIBER } from './redis.constants';
import { RedisService } from './redis.service';

const buildRedis = (cfg: RedisConfig, role: 'client' | 'subscriber'): Redis => {
  const logger = new Logger(`Redis:${role}`);
  const client = new Redis({
    host: cfg.host,
    port: cfg.port,
    password: cfg.password,
    db: cfg.db,
    keyPrefix: role === 'client' ? cfg.keyPrefix : undefined,
    lazyConnect: false,
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    reconnectOnError: () => true,
  });
  client.on('error', (error: Error) => {
    logger.error(`Redis ${role} error: ${error.message}`);
  });
  client.on('connect', () => {
    logger.log(`Redis ${role} connected to ${cfg.host}:${cfg.port}`);
  });
  return client;
};

const redisClientProvider: Provider = {
  provide: REDIS_CLIENT,
  inject: [ConfigService],
  useFactory: (configService: ConfigService) => {
    const cfg = configService.getOrThrow<RedisConfig>('redis');
    return buildRedis(cfg, 'client');
  },
};

const redisSubscriberProvider: Provider = {
  provide: REDIS_SUBSCRIBER,
  inject: [ConfigService],
  useFactory: (configService: ConfigService) => {
    const cfg = configService.getOrThrow<RedisConfig>('redis');
    return buildRedis(cfg, 'subscriber');
  },
};

@Global()
@Module({
  imports: [ConfigModule],
  providers: [redisClientProvider, redisSubscriberProvider, RedisService],
  exports: [RedisService, REDIS_CLIENT, REDIS_SUBSCRIBER],
})
export class RedisModule {}
