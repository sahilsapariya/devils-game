/**
 * Consequence repository — local mirror of consequences issued by the backend.
 * Consequences are permanent; nothing here ever deletes a record.
 */
import type {
  ConsequenceSeverity,
  ConsequenceType,
} from '@extraction/shared/types/models';

import { getDatabase } from '../database';
import { generateId, nowIso } from '../../utils/id';

interface ConsequenceRow {
  id: string;
  round_id: string | null;
  consequence_type: string;
  severity: string;
  description: string;
  reputation_delta: number;
  metadata: string;
  acknowledged: number;
  acknowledged_at: string | null;
  issued_at: string;
  created_at: string;
}

export interface LocalConsequence {
  id: string;
  roundId: string | null;
  consequenceType: ConsequenceType;
  severity: ConsequenceSeverity;
  description: string;
  reputationDelta: number;
  metadata: Record<string, unknown>;
  acknowledged: boolean;
  acknowledgedAt: string | null;
  issuedAt: string;
  createdAt: string;
}

function fromRow(row: ConsequenceRow): LocalConsequence {
  let metadata: Record<string, unknown> = {};
  try {
    metadata = JSON.parse(row.metadata) as Record<string, unknown>;
  } catch {
    metadata = {};
  }
  return {
    id: row.id,
    roundId: row.round_id,
    consequenceType: row.consequence_type as ConsequenceType,
    severity: row.severity as ConsequenceSeverity,
    description: row.description,
    reputationDelta: row.reputation_delta,
    metadata,
    acknowledged: row.acknowledged === 1,
    acknowledgedAt: row.acknowledged_at,
    issuedAt: row.issued_at,
    createdAt: row.created_at,
  };
}

export interface RecordConsequenceInput {
  id?: string;
  roundId?: string | null;
  consequenceType: ConsequenceType;
  severity: ConsequenceSeverity;
  description: string;
  reputationDelta?: number;
  metadata?: Record<string, unknown>;
  issuedAt?: string;
}

export async function recordConsequence(
  input: RecordConsequenceInput,
): Promise<LocalConsequence> {
  const db = await getDatabase();
  const id = input.id ?? generateId();
  const now = nowIso();
  await db.runAsync(
    `INSERT INTO consequences (
      id, round_id, consequence_type, severity, description,
      reputation_delta, metadata, acknowledged, acknowledged_at,
      issued_at, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, NULL, ?, ?);`,
    [
      id,
      input.roundId ?? null,
      input.consequenceType,
      input.severity,
      input.description,
      input.reputationDelta ?? 0,
      JSON.stringify(input.metadata ?? {}),
      input.issuedAt ?? now,
      now,
    ],
  );
  const created = await getConsequenceById(id);
  if (!created) {
    throw new Error(`Failed to record consequence ${id}`);
  }
  return created;
}

export async function getConsequenceById(
  id: string,
): Promise<LocalConsequence | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<ConsequenceRow>(
    `SELECT * FROM consequences WHERE id = ? LIMIT 1;`,
    [id],
  );
  return row ? fromRow(row) : null;
}

export async function listUnacknowledged(): Promise<LocalConsequence[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<ConsequenceRow>(
    `SELECT * FROM consequences WHERE acknowledged = 0 ORDER BY issued_at DESC;`,
  );
  return rows.map(fromRow);
}

export async function listForRound(roundId: string): Promise<LocalConsequence[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<ConsequenceRow>(
    `SELECT * FROM consequences WHERE round_id = ? ORDER BY issued_at DESC;`,
    [roundId],
  );
  return rows.map(fromRow);
}

export async function acknowledge(id: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `UPDATE consequences
     SET acknowledged = 1, acknowledged_at = ?
     WHERE id = ?;`,
    [nowIso(), id],
  );
}
