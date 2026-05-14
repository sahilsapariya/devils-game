/**
 * Realtime service — Socket.io client for the /operational namespace.
 *
 * Responsibilities:
 *   - Maintain a single authenticated socket connection
 *   - Auto-reconnect with capped exponential backoff
 *   - Translate inbound socket events into local SQLite writes so that
 *     the rest of the app reads only from local state (offline-first)
 *   - Expose a typed subscribe() for UI surfaces that want push updates
 *
 * The mobile app is the operational runtime authority — this service
 * only AUGMENTS local state, it never gates it. Even if the socket
 * never connects, the app continues to operate from SQLite.
 */
import { io, Socket } from 'socket.io-client';

import type {
  Announcement,
  Consequence,
  Round,
  User,
} from '@extraction/shared/types/models';

import { env } from '../config/env';
import {
  fromBackendRound,
  upsertRound,
} from '../db/repositories/rounds.repo';
import { recordConsequence } from '../db/repositories/consequences.repo';
import { appendLog } from '../db/repositories/logs.repo';
import { queueAnnouncement } from './announcement.service';
import { createLogger } from '../utils/logger';

const logger = createLogger('realtime');

// ----------------------------------------------------------------------------
// Event payloads (server -> client)
// ----------------------------------------------------------------------------

export interface RoundStartedPayload {
  round: Round;
}

export interface RoundEndedPayload {
  round: Round;
  reason?: 'completed' | 'failed' | 'abandoned';
}

export interface AnnouncementIncomingPayload {
  announcement: Announcement;
}

export interface BehavioralViolationPayload {
  roundId: string | null;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  detectedAt: string;
  metadata?: Record<string, unknown>;
}

export interface ConsequenceIssuedPayload {
  consequence: Consequence;
}

export interface StatsUpdatePayload {
  user?: Partial<User>;
  reputationScore?: number;
  currentStreak?: number;
  longestStreak?: number;
  difficultyCeiling?: number;
}

type RealtimeServerEvents = {
  'round:started': RoundStartedPayload;
  'round:ended': RoundEndedPayload;
  'announcement:incoming': AnnouncementIncomingPayload;
  'behavioral:violation-detected': BehavioralViolationPayload;
  'consequence:issued': ConsequenceIssuedPayload;
  'stats:update': StatsUpdatePayload;
};

export type RealtimeEventName = keyof RealtimeServerEvents;

export type RealtimeEventPayload<E extends RealtimeEventName> =
  RealtimeServerEvents[E];

// ----------------------------------------------------------------------------
// Connection status
// ----------------------------------------------------------------------------

export type ConnectionStatus =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'offline';

type StatusListener = (status: ConnectionStatus) => void;
type EventListener<E extends RealtimeEventName> = (
  payload: RealtimeEventPayload<E>,
) => void;
type AnyListener = (payload: unknown) => void;

// ----------------------------------------------------------------------------
// Service
// ----------------------------------------------------------------------------

const RECONNECT_DELAY_MIN_MS = 1000;
const RECONNECT_DELAY_MAX_MS = 30_000;

class RealtimeService {
  private socket: Socket | null = null;
  private status: ConnectionStatus = 'idle';
  private statusListeners = new Set<StatusListener>();
  private eventListeners = new Map<RealtimeEventName, Set<AnyListener>>();
  private currentToken: string | null = null;

  // ----- Public API -------------------------------------------------------

  connect(token: string): void {
    if (this.socket && this.currentToken === token) {
      logger.debug('connect skipped, already connected with same token');
      return;
    }
    if (this.socket) {
      this.disconnect();
    }
    this.currentToken = token;
    this.setStatus('connecting');

    const url = env.wsBaseUrl;
    logger.info('connecting', { url });

    const socket = io(`${url}/operational`, {
      transports: ['websocket'],
      auth: { token },
      reconnection: true,
      reconnectionDelay: RECONNECT_DELAY_MIN_MS,
      reconnectionDelayMax: RECONNECT_DELAY_MAX_MS,
      timeout: 10_000,
    });

    socket.on('connect', () => {
      logger.info('connected', { id: socket.id });
      this.setStatus('connected');
    });

    socket.on('disconnect', (reason: string) => {
      logger.warn('disconnected', { reason });
      // socket.io will attempt reconnect automatically unless server-disconnect.
      if (reason === 'io server disconnect') {
        this.setStatus('offline');
      } else {
        this.setStatus('reconnecting');
      }
    });

    socket.on('connect_error', (err: Error) => {
      logger.warn('connect_error', { message: err.message });
      this.setStatus('reconnecting');
    });

    socket.io.on('reconnect_attempt', (attempt: number) => {
      logger.info('reconnect_attempt', { attempt });
      this.setStatus('reconnecting');
    });

    socket.io.on('reconnect_failed', () => {
      logger.error('reconnect_failed');
      this.setStatus('offline');
    });

    // Wire domain events to local writes + listener fan-out.
    this.bindEvent(socket, 'round:started', (payload) =>
      this.handleRoundStarted(payload),
    );
    this.bindEvent(socket, 'round:ended', (payload) =>
      this.handleRoundEnded(payload),
    );
    this.bindEvent(socket, 'announcement:incoming', (payload) =>
      this.handleAnnouncementIncoming(payload),
    );
    this.bindEvent(socket, 'behavioral:violation-detected', (payload) =>
      this.handleViolation(payload),
    );
    this.bindEvent(socket, 'consequence:issued', (payload) =>
      this.handleConsequence(payload),
    );
    this.bindEvent(socket, 'stats:update', (payload) =>
      this.handleStats(payload),
    );

    this.socket = socket;
  }

  disconnect(): void {
    if (!this.socket) return;
    logger.info('disconnecting');
    try {
      this.socket.removeAllListeners();
      this.socket.disconnect();
    } catch (err) {
      logger.warn('disconnect_error', {
        message: err instanceof Error ? err.message : 'unknown',
      });
    }
    this.socket = null;
    this.currentToken = null;
    this.setStatus('idle');
  }

  emit(event: string, payload: unknown): boolean {
    if (!this.socket || !this.socket.connected) {
      logger.debug('emit skipped, socket not connected', { event });
      return false;
    }
    try {
      this.socket.emit(event, payload);
      return true;
    } catch (err) {
      logger.warn('emit_failed', {
        event,
        message: err instanceof Error ? err.message : 'unknown',
      });
      return false;
    }
  }

  subscribe<E extends RealtimeEventName>(
    event: E,
    handler: EventListener<E>,
  ): () => void {
    let bucket = this.eventListeners.get(event);
    if (!bucket) {
      bucket = new Set();
      this.eventListeners.set(event, bucket);
    }
    bucket.add(handler as AnyListener);
    return () => {
      const set = this.eventListeners.get(event);
      if (!set) return;
      set.delete(handler as AnyListener);
      if (set.size === 0) this.eventListeners.delete(event);
    };
  }

  subscribeStatus(listener: StatusListener): () => void {
    this.statusListeners.add(listener);
    // Replay current status to new subscriber synchronously.
    try {
      listener(this.status);
    } catch {
      /* listener errors are not allowed to break dispatch */
    }
    return () => {
      this.statusListeners.delete(listener);
    };
  }

  getStatus(): ConnectionStatus {
    return this.status;
  }

  // ----- Internal --------------------------------------------------------

  private setStatus(next: ConnectionStatus): void {
    if (this.status === next) return;
    this.status = next;
    for (const listener of this.statusListeners) {
      try {
        listener(next);
      } catch {
        /* swallow */
      }
    }
  }

  private bindEvent<E extends RealtimeEventName>(
    socket: Socket,
    event: E,
    handler: (payload: RealtimeEventPayload<E>) => void,
  ): void {
    socket.on(event as string, (...args: unknown[]) => {
      const payload = args[0] as RealtimeEventPayload<E>;
      try {
        handler(payload);
      } catch (err) {
        logger.warn('event_handler_failed', {
          event,
          message: err instanceof Error ? err.message : 'unknown',
        });
      }
      this.fanout(event, payload);
    });
  }

  private fanout<E extends RealtimeEventName>(
    event: E,
    payload: RealtimeEventPayload<E>,
  ): void {
    const set = this.eventListeners.get(event);
    if (!set) return;
    for (const listener of set) {
      try {
        (listener as EventListener<E>)(payload as RealtimeEventPayload<E>);
      } catch (err) {
        logger.warn('listener_failed', {
          event,
          message: err instanceof Error ? err.message : 'unknown',
        });
      }
    }
  }

  // ----- Domain handlers ------------------------------------------------

  private async handleRoundStarted(payload: RoundStartedPayload): Promise<void> {
    try {
      const upsertInput = fromBackendRound(payload.round);
      // Record localTimerStart at receive-time so countdown is authoritative locally.
      const localTimerStart =
        payload.round.actualStart ?? new Date().toISOString();
      await upsertRound({
        ...upsertInput,
        status: payload.round.status,
        operationalState: payload.round.operationalState,
        localTimerStart,
        synced: true,
      });
      await appendLog({
        category: 'round',
        level: 'info',
        description: `Round ${payload.round.id} started`,
        roundId: payload.round.id,
      });
    } catch (err) {
      logger.error('handle_round_started_failed', {
        message: err instanceof Error ? err.message : 'unknown',
      });
    }
  }

  private async handleRoundEnded(payload: RoundEndedPayload): Promise<void> {
    try {
      const upsertInput = fromBackendRound(payload.round);
      await upsertRound({
        ...upsertInput,
        status: payload.round.status,
        operationalState: payload.round.operationalState,
        actualEnd: payload.round.actualEnd,
        synced: true,
      });
      await appendLog({
        category: 'round',
        level: payload.reason === 'failed' ? 'warning' : 'info',
        description: `Round ${payload.round.id} ended (${payload.reason ?? payload.round.status})`,
        roundId: payload.round.id,
      });
    } catch (err) {
      logger.error('handle_round_ended_failed', {
        message: err instanceof Error ? err.message : 'unknown',
      });
    }
  }

  private async handleAnnouncementIncoming(
    payload: AnnouncementIncomingPayload,
  ): Promise<void> {
    try {
      await queueAnnouncement({
        id: payload.announcement.id,
        roundId: payload.announcement.roundId,
        category: payload.announcement.category,
        tone: payload.announcement.tone,
        message: payload.announcement.content,
        voiceUrl: payload.announcement.voiceUrl,
        scheduledFor: payload.announcement.scheduledFor,
        metadata: payload.announcement.metadata,
      });
    } catch (err) {
      logger.error('handle_announcement_failed', {
        message: err instanceof Error ? err.message : 'unknown',
      });
    }
  }

  private async handleViolation(payload: BehavioralViolationPayload): Promise<void> {
    try {
      await appendLog({
        category: 'behavior',
        level: payload.severity === 'critical' ? 'critical' : 'warning',
        description: payload.description,
        roundId: payload.roundId,
        context: {
          severity: payload.severity,
          detectedAt: payload.detectedAt,
          ...(payload.metadata ?? {}),
        },
      });
    } catch (err) {
      logger.error('handle_violation_failed', {
        message: err instanceof Error ? err.message : 'unknown',
      });
    }
  }

  private async handleConsequence(payload: ConsequenceIssuedPayload): Promise<void> {
    try {
      await recordConsequence({
        id: payload.consequence.id,
        roundId: payload.consequence.roundId,
        consequenceType: payload.consequence.consequenceType,
        severity: payload.consequence.severity,
        description: payload.consequence.description,
        reputationDelta: payload.consequence.reputationDelta,
        metadata: payload.consequence.metadata,
        issuedAt: payload.consequence.issuedAt,
      });
      await appendLog({
        category: 'consequence',
        level:
          payload.consequence.severity === 'critical' ||
          payload.consequence.severity === 'high'
            ? 'critical'
            : 'warning',
        description: payload.consequence.description,
        roundId: payload.consequence.roundId,
      });
    } catch (err) {
      logger.error('handle_consequence_failed', {
        message: err instanceof Error ? err.message : 'unknown',
      });
    }
  }

  private handleStats(payload: StatsUpdatePayload): void {
    // Just fan out to subscribers; the auth context owns the user object.
    logger.debug('stats_update_received');
    void payload;
  }
}

// Singleton instance.
const realtimeService = new RealtimeService();

export function getRealtimeService(): RealtimeService {
  return realtimeService;
}

export type { RealtimeService };
