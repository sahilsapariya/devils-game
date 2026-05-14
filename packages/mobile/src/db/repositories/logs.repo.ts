/**
 * Operational log repository — append-only operational timeline.
 * Drives the dashboard "operational log" panel.
 */
import { getDatabase } from '../database';
import { generateId, nowIso } from '../../utils/id';

export type LogLevel = 'info' | 'warning' | 'critical';

export type LogCategory =
  | 'system'
  | 'round'
  | 'announcement'
  | 'telemetry'
  | 'consequence'
  | 'auth'
  | 'sync'
  | 'behavior';

interface LogRow {
  id: string;
  round_id: string | null;
  level: string;
  category: string;
  event_description: string;
  context: string;
  created_at: string;
}

export interface LocalLog {
  id: string;
  roundId: string | null;
  level: LogLevel;
  category: LogCategory;
  description: string;
  context: Record<string, unknown>;
  createdAt: string;
}

function fromRow(row: LogRow): LocalLog {
  let context: Record<string, unknown> = {};
  try {
    context = JSON.parse(row.context) as Record<string, unknown>;
  } catch {
    context = {};
  }
  return {
    id: row.id,
    roundId: row.round_id,
    level: row.level as LogLevel,
    category: row.category as LogCategory,
    description: row.event_description,
    context,
    createdAt: row.created_at,
  };
}

export interface AppendLogInput {
  roundId?: string | null;
  level?: LogLevel;
  category?: LogCategory;
  description: string;
  context?: Record<string, unknown>;
}

export async function appendLog(input: AppendLogInput): Promise<LocalLog> {
  const db = await getDatabase();
  const id = generateId();
  const now = nowIso();
  await db.runAsync(
    `INSERT INTO operational_logs (
      id, round_id, level, category, event_description, context, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?);`,
    [
      id,
      input.roundId ?? null,
      input.level ?? 'info',
      input.category ?? 'system',
      input.description,
      JSON.stringify(input.context ?? {}),
      now,
    ],
  );
  return {
    id,
    roundId: input.roundId ?? null,
    level: input.level ?? 'info',
    category: input.category ?? 'system',
    description: input.description,
    context: input.context ?? {},
    createdAt: now,
  };
}

export async function listRecentLogs(limit: number = 50): Promise<LocalLog[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<LogRow>(
    `SELECT * FROM operational_logs ORDER BY created_at DESC LIMIT ?;`,
    [limit],
  );
  return rows.map(fromRow);
}

export async function listLogsForRound(roundId: string): Promise<LocalLog[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<LogRow>(
    `SELECT * FROM operational_logs
     WHERE round_id = ? ORDER BY created_at DESC;`,
    [roundId],
  );
  return rows.map(fromRow);
}
