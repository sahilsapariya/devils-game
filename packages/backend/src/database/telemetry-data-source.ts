import 'reflect-metadata';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { DataSource, type DataSourceOptions } from 'typeorm';

import { TelemetryEventEntity } from './entities/telemetry-event.entity';
import { configureSqlitePragmas } from './data-source';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const parseBool = (value: string | undefined, fallback: boolean): boolean => {
  if (value === undefined) {
    return fallback;
  }
  return value.toLowerCase() === 'true' || value === '1';
};

const telemetryPath =
  process.env.TELEMETRY_DATABASE_PATH ?? './data/telemetry.db';

const ensureParentDir = (filePath: string): void => {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
};
ensureParentDir(telemetryPath);

export const telemetryDataSourceOptions: DataSourceOptions = {
  type: 'better-sqlite3',
  database: telemetryPath,
  entities: [TelemetryEventEntity],
  migrations: [path.join(__dirname, 'migrations', 'telemetry', '*.{js,ts}')],
  migrationsTableName: 'typeorm_migrations',
  migrationsRun: false,
  synchronize: false,
  logging: parseBool(process.env.DATABASE_LOGGING, false),
  prepareDatabase: configureSqlitePragmas,
};

const dataSource = new DataSource(telemetryDataSourceOptions);
export default dataSource;
