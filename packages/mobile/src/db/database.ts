/**
 * SQLite connection management. Single shared connection per process.
 * Uses the modern expo-sqlite async API (openDatabaseAsync).
 */
import * as SQLite from 'expo-sqlite';

import { SCHEMA_STATEMENTS, SCHEMA_VERSION } from './schema';

const DB_NAME = 'project_extraction.db';

let dbInstance: SQLite.SQLiteDatabase | null = null;
let initPromise: Promise<SQLite.SQLiteDatabase> | null = null;

async function applySchema(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.execAsync('PRAGMA journal_mode = WAL;');
  await db.execAsync('PRAGMA foreign_keys = ON;');
  for (const statement of SCHEMA_STATEMENTS) {
    await db.execAsync(statement);
  }
  await db.runAsync(
    `INSERT OR REPLACE INTO schema_meta(key, value) VALUES ('schema_version', ?);`,
    [String(SCHEMA_VERSION)],
  );
}

export async function initDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (dbInstance) {
    return dbInstance;
  }
  if (initPromise) {
    return initPromise;
  }
  initPromise = (async () => {
    const db = await SQLite.openDatabaseAsync(DB_NAME);
    try {
      await applySchema(db);
    } catch (err) {
      // Surface meaningful schema errors. The runtime cannot continue
      // without a coherent local store.
      throw new Error(
        `Failed to initialize local operational database: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
    dbInstance = db;
    return db;
  })();
  return initPromise;
}

export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (dbInstance) {
    return dbInstance;
  }
  return initDatabase();
}

export async function closeDatabase(): Promise<void> {
  if (dbInstance) {
    await dbInstance.closeAsync();
    dbInstance = null;
    initPromise = null;
  }
}

/**
 * DESTRUCTIVE: wipes all local operational data. Use only on logout
 * or explicit user-initiated reset.
 */
export async function resetDatabase(): Promise<void> {
  const db = await getDatabase();
  const tables = [
    'operational_logs',
    'consequences',
    'telemetry_queue',
    'announcements',
    'rounds',
  ];
  for (const t of tables) {
    await db.execAsync(`DELETE FROM ${t};`);
  }
}
