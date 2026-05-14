import { registerAs } from '@nestjs/config';

export interface DatabaseConfig {
  operationalPath: string;
  telemetryPath: string;
  logging: boolean;
}

const parseBool = (value: string | undefined, fallback: boolean): boolean => {
  if (value === undefined) {
    return fallback;
  }
  return value.toLowerCase() === 'true' || value === '1';
};

export const databaseConfig = registerAs<DatabaseConfig>('database', () => ({
  operationalPath: process.env.DATABASE_PATH ?? './data/operational.db',
  telemetryPath: process.env.TELEMETRY_DATABASE_PATH ?? './data/telemetry.db',
  logging: parseBool(process.env.DATABASE_LOGGING, false),
}));
