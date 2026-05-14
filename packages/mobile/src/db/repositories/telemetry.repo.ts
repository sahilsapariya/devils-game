/**
 * Telemetry queue repository — local buffer for behavioral events.
 * Events accumulate offline and batch-upload on connectivity.
 */
import type { TelemetryEventType } from '@extraction/shared/types/models';

import { getDatabase } from '../database';
import { generateId, nowIso } from '../../utils/id';

export type TelemetryQueueStatus =
  | 'pending'
  | 'in_flight'
  | 'uploaded'
  | 'failed';

interface TelemetryRow {
  id: string;
  round_id: string | null;
  event_type: string;
  event_data: string;
  status: string;
  attempts: number;
  last_error: string | null;
  occurred_at: string;
  created_at: string;
}

export interface LocalTelemetryEvent {
  id: string;
  roundId: string | null;
  eventType: TelemetryEventType;
  eventData: Record<string, unknown>;
  status: TelemetryQueueStatus;
  attempts: number;
  lastError: string | null;
  occurredAt: string;
  createdAt: string;
}

function fromRow(row: TelemetryRow): LocalTelemetryEvent {
  let eventData: Record<string, unknown> = {};
  try {
    eventData = JSON.parse(row.event_data) as Record<string, unknown>;
  } catch {
    eventData = {};
  }
  return {
    id: row.id,
    roundId: row.round_id,
    eventType: row.event_type as TelemetryEventType,
    eventData,
    status: row.status as TelemetryQueueStatus,
    attempts: row.attempts,
    lastError: row.last_error,
    occurredAt: row.occurred_at,
    createdAt: row.created_at,
  };
}

export interface EnqueueTelemetryInput {
  id?: string;
  roundId?: string | null;
  eventType: TelemetryEventType;
  eventData?: Record<string, unknown>;
  occurredAt?: string;
}

export async function enqueueTelemetry(
  input: EnqueueTelemetryInput,
): Promise<LocalTelemetryEvent> {
  const db = await getDatabase();
  const id = input.id ?? generateId();
  const now = nowIso();
  await db.runAsync(
    `INSERT INTO telemetry_queue (
      id, round_id, event_type, event_data, status, attempts,
      last_error, occurred_at, created_at
    ) VALUES (?, ?, ?, ?, 'pending', 0, NULL, ?, ?);`,
    [
      id,
      input.roundId ?? null,
      input.eventType,
      JSON.stringify(input.eventData ?? {}),
      input.occurredAt ?? now,
      now,
    ],
  );
  const created = await getTelemetryById(id);
  if (!created) {
    throw new Error(`Failed to enqueue telemetry event ${id}`);
  }
  return created;
}

export async function getTelemetryById(
  id: string,
): Promise<LocalTelemetryEvent | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<TelemetryRow>(
    `SELECT * FROM telemetry_queue WHERE id = ? LIMIT 1;`,
    [id],
  );
  return row ? fromRow(row) : null;
}

export async function getPendingBatch(
  limit: number = 50,
): Promise<LocalTelemetryEvent[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<TelemetryRow>(
    `SELECT * FROM telemetry_queue
     WHERE status = 'pending'
     ORDER BY occurred_at ASC
     LIMIT ?;`,
    [limit],
  );
  return rows.map(fromRow);
}

export async function markInFlight(ids: ReadonlyArray<string>): Promise<void> {
  if (ids.length === 0) return;
  const db = await getDatabase();
  const placeholders = ids.map(() => '?').join(',');
  await db.runAsync(
    `UPDATE telemetry_queue
     SET status = 'in_flight', attempts = attempts + 1
     WHERE id IN (${placeholders});`,
    [...ids],
  );
}

export async function markUploaded(ids: ReadonlyArray<string>): Promise<void> {
  if (ids.length === 0) return;
  const db = await getDatabase();
  const placeholders = ids.map(() => '?').join(',');
  await db.runAsync(
    `UPDATE telemetry_queue SET status = 'uploaded' WHERE id IN (${placeholders});`,
    [...ids],
  );
}

export async function markFailed(
  ids: ReadonlyArray<string>,
  error: string,
): Promise<void> {
  if (ids.length === 0) return;
  const db = await getDatabase();
  const placeholders = ids.map(() => '?').join(',');
  await db.runAsync(
    `UPDATE telemetry_queue
     SET status = 'pending', last_error = ?
     WHERE id IN (${placeholders});`,
    [error, ...ids],
  );
}

export async function countPending(): Promise<number> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) as count FROM telemetry_queue WHERE status = 'pending';`,
  );
  return row?.count ?? 0;
}

export async function purgeUploaded(olderThanIso: string): Promise<number> {
  const db = await getDatabase();
  const result = await db.runAsync(
    `DELETE FROM telemetry_queue
     WHERE status = 'uploaded' AND created_at < ?;`,
    [olderThanIso],
  );
  return result.changes;
}
