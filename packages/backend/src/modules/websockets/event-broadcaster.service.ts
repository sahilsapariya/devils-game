import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import {
  BEHAVIORAL_EVENTS,
  OPERATIONAL_EVENTS,
  SOCKET_NAMESPACES,
  SOCKET_SERVER_EVENTS,
} from '@extraction/shared';

import {
  OperationalEventBus,
  type OperationalBroadcast,
} from '../events/operational-event-bus.service';
import { OperationalGateway } from './operational.gateway';

/**
 * Subscribes to the in-memory OperationalEventBus and fans events out to
 * matching Socket.io rooms (`user:<userId>`). Previously this used Redis
 * pattern subscribe — now it consumes the single-process EventEmitter.
 */
@Injectable()
export class EventBroadcasterService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(EventBroadcasterService.name);
  private unsubscribe: (() => void) | null = null;

  constructor(
    private readonly bus: OperationalEventBus,
    private readonly gateway: OperationalGateway,
  ) {}

  onApplicationBootstrap(): void {
    this.unsubscribe = this.bus.subscribeBroadcasts((broadcast) => {
      this.handleBroadcast(broadcast);
    });
    this.logger.log('Subscribed to operational event broadcasts');
  }

  onApplicationShutdown(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  private handleBroadcast(broadcast: OperationalBroadcast): void {
    const server = this.gateway.server;
    if (!server) {
      return;
    }
    const namespace = server.of(SOCKET_NAMESPACES.OPERATIONAL);
    const room = `user:${broadcast.userId}`;
    const socketEvent = this.mapEventToSocketEvent(broadcast.eventType);
    if (!socketEvent) {
      return;
    }
    namespace.to(room).emit(socketEvent, {
      id: broadcast.id,
      type: broadcast.eventType,
      roundId: broadcast.roundId,
      data: broadcast.eventData,
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
