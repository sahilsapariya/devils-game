import 'reflect-metadata';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { DataSource, DataSourceOptions } from 'typeorm';

import {
  AnnouncementEntity,
  BehavioralRecordEntity,
  ConsequenceEntity,
  EventEntity,
  EventSnapshotEntity,
  MissionEntity,
  OperationalLogEntity,
  RoundEntity,
  TelemetryEventEntity,
  UserEntity,
} from './entities';

// Load .env when running the TypeORM CLI directly.
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

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

export const dataSourceOptions: DataSourceOptions = {
  type: 'postgres',
  host: process.env.DATABASE_HOST ?? 'localhost',
  port: parseInteger(process.env.DATABASE_PORT, 5432),
  username: process.env.DATABASE_USERNAME ?? 'extraction',
  password: process.env.DATABASE_PASSWORD ?? '',
  database: process.env.DATABASE_NAME ?? 'extraction_dev',
  ssl: parseBool(process.env.DATABASE_SSL, false)
    ? { rejectUnauthorized: false }
    : false,
  synchronize: false,
  logging: parseBool(process.env.DATABASE_LOGGING, false),
  entities: [
    UserEntity,
    MissionEntity,
    RoundEntity,
    EventEntity,
    EventSnapshotEntity,
    TelemetryEventEntity,
    BehavioralRecordEntity,
    ConsequenceEntity,
    AnnouncementEntity,
    OperationalLogEntity,
  ],
  migrations: [path.join(__dirname, 'migrations', '*.{js,ts}')],
  migrationsTableName: 'typeorm_migrations',
  migrationsRun: false,
};

// Default export expected by the typeorm CLI.
const AppDataSource = new DataSource(dataSourceOptions);
export default AppDataSource;
