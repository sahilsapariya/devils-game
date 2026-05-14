import { registerAs } from '@nestjs/config';

export interface DatabaseConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
  ssl: boolean;
  logging: boolean;
  poolSize: number;
}

const parseBool = (value: string | undefined, fallback: boolean): boolean => {
  if (value === undefined) {
    return fallback;
  }
  return value.toLowerCase() === 'true' || value === '1';
};

const parseInteger = (value: string | undefined, fallback: number): number => {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const databaseConfig = registerAs<DatabaseConfig>('database', () => {
  const password = process.env.DATABASE_PASSWORD;
  if (!password) {
    throw new Error('DATABASE_PASSWORD is required');
  }
  return {
    host: process.env.DATABASE_HOST ?? 'localhost',
    port: parseInteger(process.env.DATABASE_PORT, 5432),
    username: process.env.DATABASE_USERNAME ?? 'extraction',
    password,
    database: process.env.DATABASE_NAME ?? 'extraction_dev',
    ssl: parseBool(process.env.DATABASE_SSL, false),
    logging: parseBool(process.env.DATABASE_LOGGING, false),
    poolSize: parseInteger(process.env.DATABASE_POOL_SIZE, 10),
  };
});
