/**
 * Telemetry uploader — drains the local telemetry_queue and ships batches
 * to the backend. Designed to keep operating when the network is intermittent.
 *
 * Drain triggers:
 *   - Periodic interval (every 30s)
 *   - Manual trigger after enqueue if queue exceeds DRAIN_QUEUE_HIGH_WATER
 *
 * Retry policy:
 *   - Per-event "attempts" counter
 *   - On failure: event returns to 'pending' with attempts incremented
 *   - A failing event becomes eligible again only after
 *     2^attempts * 30s (capped at 30 minutes)
 */
import type { TelemetryEventType } from '@extraction/shared/types/models';

import {
  EnqueueTelemetryInput,
  LocalTelemetryEvent,
  countPending,
  enqueueTelemetry,
  getPendingBatch,
  markFailed,
  markInFlight,
  markUploaded,
} from '../db/repositories/telemetry.repo';
import { apiRequest } from './apiClient';
import { getAccessToken } from './auth.service';
import { createLogger } from '../utils/logger';

const logger = createLogger('telemetry');

const POLL_INTERVAL_MS = 30_000;
const DRAIN_QUEUE_HIGH_WATER = 50;
const BATCH_LIMIT = 50;
const BACKOFF_BASE_MS = 30_000;
const BACKOFF_CAP_MS = 30 * 60_000; // 30 min

interface BatchEnvelope {
  events: ReadonlyArray<{
    id: string;
    roundId: string | null;
    eventType: TelemetryEventType;
    payload: Record<string, unknown>;
    occurredAt: string;
  }>;
  batchedAt: string;
}

let pollHandle: ReturnType<typeof setInterval> | null = null;
let draining = false;

function isEligibleForRetry(event: LocalTelemetryEvent): boolean {
  if (event.attempts <= 0) return true;
  const lastTryMs = new Date(event.createdAt).getTime();
  const backoff = Math.min(
    BACKOFF_BASE_MS * Math.pow(2, event.attempts - 1),
    BACKOFF_CAP_MS,
  );
  return Date.now() - lastTryMs >= backoff;
}

async function drain(): Promise<void> {
  if (draining) return;
  draining = true;
  try {
    const token = await getAccessToken();
    if (!token) return;

    const candidates = await getPendingBatch(BATCH_LIMIT);
    if (candidates.length === 0) return;

    const eligible = candidates.filter(isEligibleForRetry);
    if (eligible.length === 0) {
      logger.debug('drain skipped, no eligible events');
      return;
    }

    const ids = eligible.map((e) => e.id);
    await markInFlight(ids);

    const envelope: BatchEnvelope = {
      batchedAt: new Date().toISOString(),
      events: eligible.map((e) => ({
        id: e.id,
        roundId: e.roundId,
        eventType: e.eventType,
        payload: e.eventData,
        occurredAt: e.occurredAt,
      })),
    };

    try {
      await apiRequest<{ accepted: number }>(`/telemetry/batch`, {
        method: 'POST',
        token,
        body: envelope,
        timeoutMs: 15_000,
      });
      await markUploaded(ids);
      logger.info('drain_success', { count: ids.length });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unknown';
      logger.warn('drain_failed', { count: ids.length, message });
      await markFailed(ids, message);
    }
  } catch (err) {
    logger.error('drain_exception', {
      message: err instanceof Error ? err.message : 'unknown',
    });
  } finally {
    draining = false;
  }
}

/**
 * Append a telemetry event to the local queue. Triggers an immediate
 * drain if the queue exceeds the high-water mark.
 */
export async function queueEvent(
  input: EnqueueTelemetryInput,
): Promise<LocalTelemetryEvent> {
  const event = await enqueueTelemetry(input);
  try {
    const total = await countPending();
    if (total >= DRAIN_QUEUE_HIGH_WATER) {
      void drain();
    }
  } catch (err) {
    logger.warn('queue_count_failed', {
      message: err instanceof Error ? err.message : 'unknown',
    });
  }
  return event;
}

/**
 * Start the periodic telemetry uploader. Idempotent.
 */
export function startTelemetryUploader(): void {
  if (pollHandle) return;
  logger.info('uploader_started');
  pollHandle = setInterval(() => {
    void drain();
  }, POLL_INTERVAL_MS);
  // Fire an immediate drain so any stranded queue gets shipped fast.
  void drain();
}

export function stopTelemetryUploader(): void {
  if (pollHandle) {
    clearInterval(pollHandle);
    pollHandle = null;
    logger.info('uploader_stopped');
  }
}

/**
 * Force a drain (useful for explicit "send now" actions like check-ins).
 */
export async function flushNow(): Promise<void> {
  await drain();
}
