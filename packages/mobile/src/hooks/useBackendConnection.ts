/**
 * useBackendConnection — health-check hook.
 *
 * Pings GET /health every 30s. Surfaces a tri-state status to the UI:
 *   - connected: last ping succeeded within the last interval
 *   - degraded:  one ping failed (transient)
 *   - offline:   failures persist for >30s
 *
 * Operation never halts based on this state — the mobile app is the
 * operational runtime authority. This hook only powers cosmetic
 * status indicators (StatusDot, banners, tint shifts).
 */
import { useEffect, useRef, useState } from 'react';

import { apiRequest } from '../services/apiClient';
import { createLogger } from '../utils/logger';

const logger = createLogger('backend-conn');

export type BackendConnectionStatus = 'connected' | 'degraded' | 'offline';

export interface BackendConnectionState {
  status: BackendConnectionStatus;
  lastConnected: number | null;
  offlineDurationSec: number;
  failureCount: number;
}

const PING_INTERVAL_MS = 30_000;
const OFFLINE_THRESHOLD_MS = 30_000;
const PING_TIMEOUT_MS = 6_000;

async function ping(): Promise<boolean> {
  try {
    await apiRequest<unknown>('/health', { timeoutMs: PING_TIMEOUT_MS });
    return true;
  } catch (err) {
    logger.debug('ping_failed', {
      message: err instanceof Error ? err.message : 'unknown',
    });
    return false;
  }
}

export function useBackendConnection(): BackendConnectionState {
  const [state, setState] = useState<BackendConnectionState>({
    status: 'connected',
    lastConnected: null,
    offlineDurationSec: 0,
    failureCount: 0,
  });
  const lastConnectedRef = useRef<number | null>(null);
  const failureCountRef = useRef<number>(0);

  useEffect(() => {
    let cancelled = false;

    const compute = (ok: boolean): void => {
      const now = Date.now();
      if (ok) {
        lastConnectedRef.current = now;
        failureCountRef.current = 0;
        if (cancelled) return;
        setState({
          status: 'connected',
          lastConnected: now,
          offlineDurationSec: 0,
          failureCount: 0,
        });
        return;
      }

      failureCountRef.current += 1;
      const last = lastConnectedRef.current;
      const elapsedMs = last ? now - last : Infinity;
      const offlineSec = last ? Math.floor(elapsedMs / 1000) : 0;
      const status: BackendConnectionStatus =
        elapsedMs >= OFFLINE_THRESHOLD_MS ? 'offline' : 'degraded';
      if (cancelled) return;
      setState({
        status,
        lastConnected: last,
        offlineDurationSec: offlineSec,
        failureCount: failureCountRef.current,
      });
    };

    // Kick off an immediate ping then poll.
    void (async () => {
      const ok = await ping();
      compute(ok);
    })();

    const handle = setInterval(() => {
      void (async () => {
        const ok = await ping();
        compute(ok);
      })();
    }, PING_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(handle);
    };
  }, []);

  return state;
}
