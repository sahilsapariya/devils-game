import 'reflect-metadata';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { DataSource, type DataSourceOptions } from 'typeorm';

import {
  AnnouncementEntity,
  BehavioralRecordEntity,
  ConsequenceEntity,
  EventEntity,
  EventSnapshotEntity,
  MissionEntity,
  OperationalLogEntity,
  RoundEntity,
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

const operationalPath = process.env.DATABASE_PATH ?? './data/operational.db';

// Ensure parent directory exists so SQLite can open the file.
const ensureParentDir = (filePath: string): void => {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
};
ensureParentDir(operationalPath);

/**
 * Apply SQLite pragmas required for production-grade durability + concurrency.
 * - journal_mode = WAL: many concurrent readers, one writer, writes don't block reads.
 * - synchronous = NORMAL: safe with WAL, faster than FULL.
 * - busy_timeout = 5000: wait up to 5s for writer lock before EBUSY.
 * - foreign_keys = ON: enforce FK constraints (off by default in SQLite).
 */
export const configureSqlitePragmas = (db: {
  pragma: (s: string) => unknown;
}): void => {
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('busy_timeout = 5000');
  db.pragma('foreign_keys = ON');
};

export const operationalDataSourceOptions: DataSourceOptions = {
  type: 'better-sqlite3',
  database: operationalPath,
  entities: [
    UserEntity,
    MissionEntity,
    RoundEntity,
    EventEntity,
    EventSnapshotEntity,
    BehavioralRecordEntity,
    ConsequenceEntity,
    AnnouncementEntity,
    OperationalLogEntity,
  ],
  migrations: [path.join(__dirname, 'migrations', 'operational', '*.{js,ts}')],
  migrationsTableName: 'typeorm_migrations',
  migrationsRun: false,
  synchronize: false,
  logging: parseBool(process.env.DATABASE_LOGGING, false),
  prepareDatabase: configureSqlitePragmas,
};

// Default export expected by the typeorm CLI. The CLI requires the file to
// have a single DataSource export — keep this as the only DataSource instance
// in this module.
const dataSource = new DataSource(operationalDataSourceOptions);
export default dataSource;
