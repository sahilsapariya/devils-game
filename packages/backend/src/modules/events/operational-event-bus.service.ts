import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter } from 'events';

export interface OperationalBroadcast {
  id: string;
  userId: string;
  roundId: string | null;
  eventType: string;
  eventData: Record<string, unknown>;
  occurredAt: string;
}

export type BroadcastHandler = (broadcast: OperationalBroadcast) => void;
export type WorkSignalHandler = (payload: Record<string, unknown>) => void;

/**
 * Single-process EventEmitter-based pub/sub. Replaces Redis pub/sub for
 * broadcasting operational events to WebSocket fan-out and downstream
 * work signals (scoring/difficulty/announcements/state-escalation).
 *
 * Fire-and-forget semantics — same as the previous Redis publish path.
 * Listeners run synchronously inside `emit`; failures inside one listener
 * do not affect others (EventEmitter swallows handler errors when they are
 * routed through internal try/catch — we wrap subscribers defensively).
 */
@Injectable()
export class OperationalEventBus {
  private readonly logger = new Logger(OperationalEventBus.name);
  private readonly emitter = new EventEmitter();

  constructor() {
    // Allow many subscribers (Socket.io clients, internal services) per user
    this.emitter.setMaxListeners(1000);
  }

  // ---------------------------------------------------------------------------
  // Operational broadcasts (event source → Socket.io fan-out)
  // ---------------------------------------------------------------------------

  publishBroadcast(broadcast: OperationalBroadcast): void {
    this.emit(`broadcast:user:${broadcast.userId}`, broadcast);
    this.emit('broadcast:user:*', broadcast);
  }

  subscribeBroadcasts(handler: BroadcastHandler): () => void {
    return this.on('broadcast:user:*', handler as (arg: unknown) => void);
  }

  subscribeBroadcastsForUser(
    userId: string,
    handler: BroadcastHandler,
  ): () => void {
    return this.on(
      `broadcast:user:${userId}`,
      handler as (arg: unknown) => void,
    );
  }

  // ---------------------------------------------------------------------------
  // Work signals (event-processor → background work hints)
  // ---------------------------------------------------------------------------

  publishWork(topic: string, payload: Record<string, unknown>): void {
    this.emit(`work:${topic}`, payload);
  }

  subscribeWork(topic: string, handler: WorkSignalHandler): () => void {
    return this.on(`work:${topic}`, handler as (arg: unknown) => void);
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  private emit(channel: string, payload: unknown): void {
    try {
      this.emitter.emit(channel, payload);
    } catch (error) {
      // EventEmitter handler errors are surfaced as 'error' events; if there
      // is no 'error' listener the process crashes. We defensively log.
      this.logger.error(
        `EventEmitter.emit threw for "${channel}": ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private on(channel: string, handler: (arg: unknown) => void): () => void {
    const safe = (arg: unknown): void => {
      try {
        handler(arg);
      } catch (error) {
        this.logger.error(
          `Subscriber for "${channel}" threw: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    };
    this.emitter.on(channel, safe);
    return () => {
      this.emitter.off(channel, safe);
    };
  }
}
