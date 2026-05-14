import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import type { Redis } from 'ioredis';
import {
  BEHAVIORAL_EVENTS,
  OPERATIONAL_EVENTS,
  REDIS_CHANNELS,
  SOCKET_NAMESPACES,
  SOCKET_SERVER_EVENTS,
} from '@extraction/shared';

import { RedisService } from '../redis/redis.service';
import { OperationalGateway } from './operational.gateway';

/**
 * Subscribes to per-user Redis pub/sub broadcasts and fans them out
 * to the matching Socket.io rooms.
 *
 * The Redis subscription uses pattern subscribe (`PSUBSCRIBE`) because
 * channels are namespaced per user.
 */
@Injectable()
export class EventBroadcasterService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(EventBroadcasterService.name);
  private readonly broadcastPattern = `${REDIS_CHANNELS.EVENT_BROADCAST}:*`;

  constructor(
    private readonly redis: RedisService,
    private readonly gateway: OperationalGateway,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const client = this.redis.getClient();
    // We piggy-back on ioredis's psubscribe via the underlying client.
    // We can't easily reuse the existing subscriber (it's not exposed for
    // patterns) so we attach a pmessage listener on the dedicated subscriber.
    // To stay within the abstractions we already have, we instead duplicate
    // the client connection for pattern subscription.
    const psub = client.duplicate();
    psub.on('error', (err) => {
      this.logger.error(`Pattern subscriber error: ${err.message}`);
    });
    psub.on('pmessage', (_pattern, channel, message) => {
      this.handleBroadcast(channel, message);
    });
    try {
      await psub.psubscribe(this.broadcastPattern);
      this.psubscriber = psub;
      this.logger.log(`Subscribed to pattern ${this.broadcastPattern}`);
    } catch (error) {
      this.logger.error(
        `Failed to psubscribe: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.psubscriber) {
      try {
        await this.psubscriber.punsubscribe(this.broadcastPattern);
        await this.psubscriber.quit();
      } catch (error) {
        this.logger.warn(
          `psubscriber teardown failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }

  private psubscriber: Redis | null = null;

  private handleBroadcast(channel: string, message: string): void {
    const userId = channel.split(':').pop();
    if (!userId) {
      return;
    }
    let parsed: {
      eventType: string;
      eventData: Record<string, unknown>;
      roundId: string | null;
      id: string;
    };
    try {
      parsed = JSON.parse(message);
    } catch {
      return;
    }

    const server = this.gateway.server;
    if (!server) {
      return;
    }
    const namespace = server.of(SOCKET_NAMESPACES.OPERATIONAL);
    const room = `user:${userId}`;
    const socketEvent = this.mapEventToSocketEvent(parsed.eventType);
    if (!socketEvent) {
      return;
    }
    namespace.to(room).emit(socketEvent, {
      id: parsed.id,
      type: parsed.eventType,
      roundId: parsed.roundId,
      data: parsed.eventData,
    });
  }

  private mapEventToSocketEvent(eventType: string): string | null {
    switch (eventType) {
      case OPERATIONAL_EVENTS.ROUND_STARTED:
        return SOCKET_SERVER_EVENTS.ROUND_STARTED;
      case OPERATIONAL_EVENTS.ROUND_PAUSED:
      case OPERATIONAL_EVENTS.ROUND_RESUMED:
        return SOCKET_SERVER_EVENTS.ROUND_UPDATED;
      case OPERATIONAL_EVENTS.ROUND_COMPLETED:
      case OPERATIONAL_EVENTS.ROUND_FAILED:
      case OPERATIONAL_EVENTS.ROUND_ABANDONED:
        return SOCKET_SERVER_EVENTS.ROUND_ENDED;
      case BEHAVIORAL_EVENTS.DISTRACTION_DETECTED:
        return SOCKET_SERVER_EVENTS.BEHAVIORAL_VIOLATION;
      case OPERATIONAL_EVENTS.ANNOUNCEMENT_GENERATED:
        return SOCKET_SERVER_EVENTS.ANNOUNCEMENT_INCOMING;
      case OPERATIONAL_EVENTS.CONSEQUENCE_ISSUED:
        return SOCKET_SERVER_EVENTS.CONSEQUENCE_ISSUED;
      case OPERATIONAL_EVENTS.STATE_TRANSITION:
        return SOCKET_SERVER_EVENTS.STATE_TRANSITIONED;
      default:
        return null;
    }
  }
}
