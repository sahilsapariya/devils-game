import { registerAs } from '@nestjs/config';

export interface AppConfig {
  nodeEnv: 'development' | 'staging' | 'production' | 'test';
  port: number;
  apiPrefix: string;
  logLevel: string;
  corsOrigins: ReadonlyArray<string>;
}

const parseInteger = (value: string | undefined, fallback: number): number => {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const parseOrigins = (value: string | undefined): ReadonlyArray<string> => {
  if (!value) {
    return Object.freeze<string[]>([]);
  }
  return Object.freeze(
    value
      .split(',')
      .map((origin) => origin.trim())
      .filter((origin) => origin.length > 0),
  );
};

const VALID_ENVS = new Set(['development', 'staging', 'production', 'test']);

export const appConfig = registerAs<AppConfig>('app', () => {
  const nodeEnv = (process.env.NODE_ENV ?? 'development').toLowerCase();
  if (!VALID_ENVS.has(nodeEnv)) {
    throw new Error(
      `Invalid NODE_ENV "${nodeEnv}". Expected one of: ${Array.from(
        VALID_ENVS,
      ).join(', ')}`,
    );
  }
  return {
    nodeEnv: nodeEnv as AppConfig['nodeEnv'],
    port: parseInteger(process.env.PORT, 3001),
    apiPrefix: process.env.API_PREFIX ?? 'api',
    logLevel: process.env.LOG_LEVEL ?? 'info',
    corsOrigins: parseOrigins(process.env.CORS_ORIGINS),
  };
});
