import { registerAs } from '@nestjs/config';

export interface RedisConfig {
  host: string;
  port: number;
  password: string | undefined;
  db: number;
  keyPrefix: string;
}

const parseInteger = (value: string | undefined, fallback: number): number => {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const redisConfig = registerAs<RedisConfig>('redis', () => ({
  host: process.env.REDIS_HOST ?? 'localhost',
  port: parseInteger(process.env.REDIS_PORT, 6379),
  password: process.env.REDIS_PASSWORD || undefined,
  db: parseInteger(process.env.REDIS_DB, 0),
  keyPrefix: process.env.REDIS_KEY_PREFIX ?? 'extraction:',
}));
