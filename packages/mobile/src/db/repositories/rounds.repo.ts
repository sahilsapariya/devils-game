/**
 * Round repository — persists in-flight and historical rounds locally.
 * The mobile app is the runtime authority while a round is active.
 */
import type {
  OperationalState,
  Round,
  RoundDifficulty,
  RoundStats,
  RoundStatus,
} from '@extraction/shared/types/models';

import { getDatabase } from '../database';
import { nowIso } from '../../utils/id';

interface RoundRow {
  id: string;
  mission_id: string | null;
  status: string;
  operational_state: string;
  starts_at: string;
  ends_at: string;
  local_timer_start: string | null;
  actual_start: string | null;
  actual_end: string | null;
  duration_minutes: number;
  operational_metadata: string;
  stats_json: string;
  difficulty_json: string;
  synced: number;
  created_at: string;
  updated_at: string;
}

export interface LocalRound {
  id: string;
  missionId: string | null;
  status: RoundStatus;
  operationalState: OperationalState;
  startsAt: string;
  endsAt: string;
  localTimerStart: string | null;
  actualStart: string | null;
  actualEnd: string | null;
  durationMinutes: number;
  operationalMetadata: Record<string, unknown>;
  stats: RoundStats;
  difficulty: RoundDifficulty;
  synced: boolean;
  createdAt: string;
  updatedAt: string;
}

const DEFAULT_STATS: RoundStats = {
  totalFocusMinutes: 0,
  totalIdleMinutes: 0,
  appSwitches: 0,
  distractionsDetected: 0,
  violationsCount: 0,
  gitCommitsCount: 0,
  productivityScore: null,
};

const DEFAULT_DIFFICULTY: RoundDifficulty = {
  timePressure: 5,
  distractionSensitivity: 5,
  verificationStrictness: 5,
  announcementFrequency: 5,
  environmentalPressure: 5,
  pointsMultiplier: 1,
};

function safeParse<T>(json: string, fallback: T): T {
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

function fromRow(row: RoundRow): LocalRound {
  return {
    id: row.id,
    missionId: row.mission_id,
    status: row.status as RoundStatus,
    operationalState: row.operational_state as OperationalState,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    localTimerStart: row.local_timer_start,
    actualStart: row.actual_start,
    actualEnd: row.actual_end,
    durationMinutes: row.duration_minutes,
    operationalMetadata: safeParse(row.operational_metadata, {}),
    stats: safeParse(row.stats_json, DEFAULT_STATS),
    difficulty: safeParse(row.difficulty_json, DEFAULT_DIFFICULTY),
    synced: row.synced === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface UpsertRoundInput {
  id: string;
  missionId?: string | null;
  status: RoundStatus;
  operationalState: OperationalState;
  startsAt: string;
  endsAt: string;
  localTimerStart?: string | null;
  actualStart?: string | null;
  actualEnd?: string | null;
  durationMinutes?: number;
  stats?: Partial<RoundStats>;
  difficulty?: Partial<RoundDifficulty>;
  operationalMetadata?: Record<string, unknown>;
  synced?: boolean;
}

export async function upsertRound(input: UpsertRoundInput): Promise<LocalRound> {
  const db = await getDatabase();
  const now = nowIso();
  const stats: RoundStats = { ...DEFAULT_STATS, ...(input.stats ?? {}) };
  const difficulty: RoundDifficulty = {
    ...DEFAULT_DIFFICULTY,
    ...(input.difficulty ?? {}),
  };
  const opMeta = input.operationalMetadata ?? {};

  await db.runAsync(
    `INSERT INTO rounds (
      id, mission_id, status, operational_state, starts_at, ends_at,
      local_timer_start, actual_start, actual_end, duration_minutes,
      operational_metadata, stats_json, difficulty_json, synced,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      mission_id = excluded.mission_id,
      status = excluded.status,
      operational_state = excluded.operational_state,
      starts_at = excluded.starts_at,
      ends_at = excluded.ends_at,
      local_timer_start = excluded.local_timer_start,
      actual_start = excluded.actual_start,
      actual_end = excluded.actual_end,
      duration_minutes = excluded.duration_minutes,
      operational_metadata = excluded.operational_metadata,
      stats_json = excluded.stats_json,
      difficulty_json = excluded.difficulty_json,
      synced = excluded.synced,
      updated_at = excluded.updated_at;`,
    [
      input.id,
      input.missionId ?? null,
      input.status,
      input.operationalState,
      input.startsAt,
      input.endsAt,
      input.localTimerStart ?? null,
      input.actualStart ?? null,
      input.actualEnd ?? null,
      input.durationMinutes ?? 0,
      JSON.stringify(opMeta),
      JSON.stringify(stats),
      JSON.stringify(difficulty),
      input.synced ? 1 : 0,
      now,
      now,
    ],
  );

  const result = await getRoundById(input.id);
  if (!result) {
    throw new Error(`Failed to read back round ${input.id} after upsert`);
  }
  return result;
}

export async function getRoundById(id: string): Promise<LocalRound | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<RoundRow>(
    `SELECT * FROM rounds WHERE id = ? LIMIT 1;`,
    [id],
  );
  return row ? fromRow(row) : null;
}

export async function getActiveRound(): Promise<LocalRound | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<RoundRow>(
    `SELECT * FROM rounds
     WHERE status IN ('active', 'paused')
     ORDER BY starts_at DESC LIMIT 1;`,
  );
  return row ? fromRow(row) : null;
}

export async function listRecentRounds(limit: number = 25): Promise<LocalRound[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<RoundRow>(
    `SELECT * FROM rounds ORDER BY starts_at DESC LIMIT ?;`,
    [limit],
  );
  return rows.map(fromRow);
}

export async function deleteRound(id: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(`DELETE FROM rounds WHERE id = ?;`, [id]);
}

// Conversion helper for backend-shaped Round payloads received via sync.
export function fromBackendRound(round: Round): UpsertRoundInput {
  return {
    id: round.id,
    missionId: round.missionId,
    status: round.status,
    operationalState: round.operationalState,
    startsAt: round.scheduledStart,
    endsAt: round.scheduledEnd,
    actualStart: round.actualStart,
    actualEnd: round.actualEnd,
    durationMinutes: round.durationMinutes,
    stats: round.stats,
    difficulty: round.difficulty,
    synced: true,
  };
}
