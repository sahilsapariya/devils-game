/**
 * Round service — fetch and mutate round state.
 *
 * Local-first: every mutation writes SQLite first, then attempts a
 * backend sync. Reads always come from SQLite (works offline). The
 * mobile timer is the operational authority while a round is active.
 */
import type { Round } from '@extraction/shared/types/models';

import {
  LocalRound,
  fromBackendRound,
  getActiveRound as repoGetActiveRound,
  getRoundById,
  upsertRound,
} from '../db/repositories/rounds.repo';
import { appendLog } from '../db/repositories/logs.repo';
import { apiRequest } from './apiClient';
import { getAccessToken } from './auth.service';
import { nowIso } from '../utils/id';
import { createLogger } from '../utils/logger';

const logger = createLogger('round.service');

interface CurrentRoundResponse {
  round: Round | null;
}

interface RoundResponse {
  round: Round;
}

/**
 * Read the active round directly from local SQLite. Offline-safe.
 */
export async function getActiveRound(): Promise<LocalRound | null> {
  return repoGetActiveRound();
}

/**
 * Fetch the current active round from backend and persist to local.
 * If the backend is unreachable the local copy is returned unchanged.
 */
export async function fetchCurrentRound(): Promise<LocalRound | null> {
  const token = await getAccessToken();
  if (!token) {
    return repoGetActiveRound();
  }
  try {
    const response = await apiRequest<CurrentRoundResponse>(
      '/rounds/current',
      { token, timeoutMs: 8000 },
    );
    if (!response.round) {
      return repoGetActiveRound();
    }
    const input = fromBackendRound(response.round);
    const localTimerStart =
      response.round.actualStart ?? response.round.scheduledStart;
    const local = await upsertRound({
      ...input,
      localTimerStart,
      synced: true,
    });
    return local;
  } catch (err) {
    logger.warn('fetch_current_failed', {
      message: err instanceof Error ? err.message : 'unknown',
    });
    return repoGetActiveRound();
  }
}

async function postRoundAction(
  roundId: string,
  action: 'start' | 'complete' | 'abandon',
): Promise<Round | null> {
  const token = await getAccessToken();
  if (!token) return null;
  try {
    const response = await apiRequest<RoundResponse>(
      `/rounds/${encodeURIComponent(roundId)}/${action}`,
      { method: 'POST', token, timeoutMs: 8000 },
    );
    return response.round;
  } catch (err) {
    logger.warn('round_action_failed', {
      action,
      roundId,
      message: err instanceof Error ? err.message : 'unknown',
    });
    return null;
  }
}

/**
 * Start a round. Updates local state immediately, then attempts backend sync.
 */
export async function startRound(roundId: string): Promise<LocalRound> {
  const existing = await getRoundById(roundId);
  const now = nowIso();
  const startsAt = existing?.startsAt ?? now;
  const endsAt = existing?.endsAt ?? now;
  const local = await upsertRound({
    id: roundId,
    missionId: existing?.missionId ?? null,
    status: 'active',
    operationalState: 'OPERATIONAL',
    startsAt,
    endsAt,
    localTimerStart: now,
    actualStart: now,
    durationMinutes: existing?.durationMinutes ?? 0,
    operationalMetadata: existing?.operationalMetadata,
    stats: existing?.stats,
    difficulty: existing?.difficulty,
    synced: false,
  });
  await appendLog({
    category: 'round',
    level: 'info',
    description: `Round ${roundId} started locally`,
    roundId,
  });
  const remote = await postRoundAction(roundId, 'start');
  if (remote) {
    const synced = await upsertRound({
      ...fromBackendRound(remote),
      localTimerStart: now,
      synced: true,
    });
    return synced;
  }
  return local;
}

/**
 * Complete a round. Always writes local first.
 */
export async function completeRound(roundId: string): Promise<LocalRound> {
  const existing = await getRoundById(roundId);
  const now = nowIso();
  const local = await upsertRound({
    id: roundId,
    missionId: existing?.missionId ?? null,
    status: 'completed',
    operationalState: 'EXTRACTION',
    startsAt: existing?.startsAt ?? now,
    endsAt: existing?.endsAt ?? now,
    localTimerStart: existing?.localTimerStart ?? null,
    actualStart: existing?.actualStart ?? null,
    actualEnd: now,
    durationMinutes: existing?.durationMinutes ?? 0,
    operationalMetadata: existing?.operationalMetadata,
    stats: existing?.stats,
    difficulty: existing?.difficulty,
    synced: false,
  });
  await appendLog({
    category: 'round',
    level: 'info',
    description: `Round ${roundId} completed locally`,
    roundId,
  });
  const remote = await postRoundAction(roundId, 'complete');
  if (remote) {
    return upsertRound({
      ...fromBackendRound(remote),
      synced: true,
    });
  }
  return local;
}

/**
 * Abandon a round. Always writes local first.
 */
export async function abandonRound(roundId: string): Promise<LocalRound> {
  const existing = await getRoundById(roundId);
  const now = nowIso();
  const local = await upsertRound({
    id: roundId,
    missionId: existing?.missionId ?? null,
    status: 'abandoned',
    operationalState: 'DORMANT',
    startsAt: existing?.startsAt ?? now,
    endsAt: existing?.endsAt ?? now,
    localTimerStart: existing?.localTimerStart ?? null,
    actualStart: existing?.actualStart ?? null,
    actualEnd: now,
    durationMinutes: existing?.durationMinutes ?? 0,
    operationalMetadata: existing?.operationalMetadata,
    stats: existing?.stats,
    difficulty: existing?.difficulty,
    synced: false,
  });
  await appendLog({
    category: 'round',
    level: 'warning',
    description: `Round ${roundId} abandoned locally`,
    roundId,
  });
  const remote = await postRoundAction(roundId, 'abandon');
  if (remote) {
    return upsertRound({
      ...fromBackendRound(remote),
      synced: true,
    });
  }
  return local;
}
