/**
 * Consequences service — list and acknowledge backend-issued consequences.
 *
 * Local-first reads. Backend ack is best-effort; local ack is authoritative.
 */
import type { Consequence } from '@extraction/shared/types/models';

import {
  LocalConsequence,
  acknowledge as repoAcknowledge,
  listUnacknowledged,
  recordConsequence,
} from '../db/repositories/consequences.repo';
import { apiRequest } from './apiClient';
import { getAccessToken } from './auth.service';
import { createLogger } from '../utils/logger';

const logger = createLogger('consequences');

interface ConsequencesResponse {
  consequences: ReadonlyArray<Consequence>;
}

export async function listLocalConsequences(): Promise<LocalConsequence[]> {
  return listUnacknowledged();
}

/**
 * Pull consequences from backend and merge into local repo.
 */
export async function syncConsequences(): Promise<LocalConsequence[]> {
  const token = await getAccessToken();
  if (!token) return listUnacknowledged();
  try {
    const response = await apiRequest<ConsequencesResponse>(
      '/consequences',
      { token, timeoutMs: 8000 },
    );
    for (const c of response.consequences) {
      await recordConsequence({
        id: c.id,
        roundId: c.roundId,
        consequenceType: c.consequenceType,
        severity: c.severity,
        description: c.description,
        reputationDelta: c.reputationDelta,
        metadata: c.metadata,
        issuedAt: c.issuedAt,
      }).catch(() => undefined);
    }
  } catch (err) {
    logger.warn('sync_failed', {
      message: err instanceof Error ? err.message : 'unknown',
    });
  }
  return listUnacknowledged();
}

/**
 * Acknowledge a consequence locally and ship to backend (best-effort).
 */
export async function acknowledgeConsequence(id: string): Promise<void> {
  await repoAcknowledge(id);
  const token = await getAccessToken();
  if (!token) return;
  try {
    await apiRequest<void>(
      `/consequences/${encodeURIComponent(id)}/acknowledge`,
      { method: 'PATCH', token, timeoutMs: 5000 },
    );
  } catch (err) {
    logger.warn('ack_remote_failed', {
      id,
      message: err instanceof Error ? err.message : 'unknown',
    });
  }
}
