/**
 * Announcement repository — local queue for operational announcements.
 * Announcements are pre-fetched before a round; the local queue allows
 * delivery even during backend outages.
 */
import type {
  AnnouncementCategory,
  AnnouncementTone,
} from '@extraction/shared/types/models';

import { getDatabase } from '../database';
import { generateId, nowIso } from '../../utils/id';

export type AnnouncementStatus =
  | 'queued'
  | 'playing'
  | 'played'
  | 'acknowledged'
  | 'failed';

interface AnnouncementRow {
  id: string;
  round_id: string | null;
  category: string;
  tone: string;
  message: string;
  voice_url: string | null;
  status: string;
  scheduled_for: string;
  played_at: string | null;
  acknowledged_at: string | null;
  metadata: string;
  created_at: string;
}

export interface LocalAnnouncement {
  id: string;
  roundId: string | null;
  category: AnnouncementCategory;
  tone: AnnouncementTone;
  message: string;
  voiceUrl: string | null;
  status: AnnouncementStatus;
  scheduledFor: string;
  playedAt: string | null;
  acknowledgedAt: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

function fromRow(row: AnnouncementRow): LocalAnnouncement {
  let metadata: Record<string, unknown> = {};
  try {
    metadata = JSON.parse(row.metadata) as Record<string, unknown>;
  } catch {
    metadata = {};
  }
  return {
    id: row.id,
    roundId: row.round_id,
    category: row.category as AnnouncementCategory,
    tone: row.tone as AnnouncementTone,
    message: row.message,
    voiceUrl: row.voice_url,
    status: row.status as AnnouncementStatus,
    scheduledFor: row.scheduled_for,
    playedAt: row.played_at,
    acknowledgedAt: row.acknowledged_at,
    metadata,
    createdAt: row.created_at,
  };
}

export interface EnqueueAnnouncementInput {
  id?: string;
  roundId?: string | null;
  category: AnnouncementCategory;
  tone: AnnouncementTone;
  message: string;
  voiceUrl?: string | null;
  scheduledFor?: string;
  metadata?: Record<string, unknown>;
}

export async function enqueueAnnouncement(
  input: EnqueueAnnouncementInput,
): Promise<LocalAnnouncement> {
  const db = await getDatabase();
  const id = input.id ?? generateId();
  const now = nowIso();
  const scheduledFor = input.scheduledFor ?? now;
  await db.runAsync(
    `INSERT INTO announcements (
      id, round_id, category, tone, message, voice_url,
      status, scheduled_for, played_at, acknowledged_at, metadata, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, 'queued', ?, NULL, NULL, ?, ?);`,
    [
      id,
      input.roundId ?? null,
      input.category,
      input.tone,
      input.message,
      input.voiceUrl ?? null,
      scheduledFor,
      JSON.stringify(input.metadata ?? {}),
      now,
    ],
  );
  const created = await getAnnouncementById(id);
  if (!created) {
    throw new Error(`Failed to enqueue announcement ${id}`);
  }
  return created;
}

export async function getAnnouncementById(
  id: string,
): Promise<LocalAnnouncement | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<AnnouncementRow>(
    `SELECT * FROM announcements WHERE id = ? LIMIT 1;`,
    [id],
  );
  return row ? fromRow(row) : null;
}

export async function getNextQueued(): Promise<LocalAnnouncement | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<AnnouncementRow>(
    `SELECT * FROM announcements
     WHERE status = 'queued' AND scheduled_for <= ?
     ORDER BY scheduled_for ASC LIMIT 1;`,
    [nowIso()],
  );
  return row ? fromRow(row) : null;
}

export async function listRecent(limit: number = 20): Promise<LocalAnnouncement[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<AnnouncementRow>(
    `SELECT * FROM announcements ORDER BY created_at DESC LIMIT ?;`,
    [limit],
  );
  return rows.map(fromRow);
}

export async function markPlayed(id: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `UPDATE announcements SET status = 'played', played_at = ? WHERE id = ?;`,
    [nowIso(), id],
  );
}

export async function markAcknowledged(id: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `UPDATE announcements
     SET status = 'acknowledged', acknowledged_at = ?
     WHERE id = ?;`,
    [nowIso(), id],
  );
}

export async function markFailed(id: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(`UPDATE announcements SET status = 'failed' WHERE id = ?;`, [
    id,
  ]);
}
