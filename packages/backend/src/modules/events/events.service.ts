import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { REDIS_CHANNELS } from '@extraction/shared';

import { EventEntity } from '../../database/entities/event.entity';
import { RedisService } from '../redis/redis.service';

export interface EmitEventInput {
  userId: string;
  roundId: string | null;
  eventType: string;
  eventData: Record<string, unknown>;
  occurredAt: Date;
}

export interface ListEventsOptions {
  type?: string;
  fromOccurredAt?: Date;
  toOccurredAt?: Date;
  limit?: number;
  offset?: number;
}

const REDIS_STREAM = 'extraction:events:stream';
const REDIS_STREAM_MAXLEN = 100_000; // approx cap

@Injectable()
export class EventsService {
  private readonly logger = new Logger(EventsService.name);

  constructor(
    @InjectRepository(EventEntity)
    private readonly events: Repository<EventEntity>,
    private readonly redis: RedisService,
  ) {}

  /**
   * Persist an operational event, push to Redis Stream, broadcast to user.
   * Returns the persisted entity (with id).
   */
  async emit(input: EmitEventInput): Promise<EventEntity> {
    const entity = this.events.create({
      userId: input.userId,
      roundId: input.roundId,
      eventType: input.eventType,
      eventData: input.eventData,
      occurredAt: input.occurredAt,
      isProcessed: false,
      processedAt: null,
    });
    const saved = await this.events.save(entity);

    // Best-effort Redis fan-out — never block the caller on Redis failures.
    void this.pushToStream(saved).catch((error) => {
      this.logger.warn(
        `Failed to push event ${saved.id} to Redis stream: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    });
    void this.broadcast(saved).catch((error) => {
      this.logger.warn(
        `Failed to broadcast event ${saved.id}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    });

    return saved;
  }

  async markProcessed(eventId: string): Promise<void> {
    await this.events.update(
      { id: eventId },
      { isProcessed: true, processedAt: new Date() },
    );
  }

  async getEventsForRound(
    roundId: string,
    opts: ListEventsOptions = {},
  ): Promise<{ items: EventEntity[]; total: number }> {
    const limit = opts.limit ?? 100;
    const offset = opts.offset ?? 0;
    const qb = this.events
      .createQueryBuilder('event')
      .where('event.round_id = :roundId', { roundId })
      .orderBy('event.occurred_at', 'ASC')
      .take(limit)
      .skip(offset);
    if (opts.type) {
      qb.andWhere('event.event_type = :type', { type: opts.type });
    }
    if (opts.fromOccurredAt) {
      qb.andWhere('event.occurred_at >= :from', { from: opts.fromOccurredAt });
    }
    if (opts.toOccurredAt) {
      qb.andWhere('event.occurred_at <= :to', { to: opts.toOccurredAt });
    }
    const [items, total] = await qb.getManyAndCount();
    return { items, total };
  }

  async getEventsForUser(
    userId: string,
    opts: ListEventsOptions = {},
  ): Promise<{ items: EventEntity[]; total: number }> {
    const limit = opts.limit ?? 100;
    const offset = opts.offset ?? 0;
    const qb = this.events
      .createQueryBuilder('event')
      .where('event.user_id = :userId', { userId })
      .orderBy('event.occurred_at', 'ASC')
      .take(limit)
      .skip(offset);
    if (opts.type) {
      qb.andWhere('event.event_type = :type', { type: opts.type });
    }
    if (opts.fromOccurredAt) {
      qb.andWhere('event.occurred_at >= :from', { from: opts.fromOccurredAt });
    }
    if (opts.toOccurredAt) {
      qb.andWhere('event.occurred_at <= :to', { to: opts.toOccurredAt });
    }
    const [items, total] = await qb.getManyAndCount();
    return { items, total };
  }

  /**
   * Replay all events between two event ids (inclusive) ordered by occurredAt.
   * If `toEventId` is omitted, replays from `fromEventId` to current latest.
   */
  async replayEvents(
    fromEventId: string,
    toEventId?: string,
  ): Promise<EventEntity[]> {
    const fromEvent = await this.events.findOne({ where: { id: fromEventId } });
    if (!fromEvent) {
      return [];
    }
    const qb = this.events
      .createQueryBuilder('event')
      .where('event.occurred_at >= :from', { from: fromEvent.occurredAt })
      .orderBy('event.occurred_at', 'ASC');

    if (toEventId) {
      const toEvent = await this.events.findOne({ where: { id: toEventId } });
      if (toEvent) {
        qb.andWhere('event.occurred_at <= :to', { to: toEvent.occurredAt });
      }
    }
    return qb.getMany();
  }

  // ---------------------------------------------------------------------------
  // Redis fan-out
  // ---------------------------------------------------------------------------

  private async pushToStream(event: EventEntity): Promise<void> {
    const client = this.redis.getClient();
    const payload = JSON.stringify({
      id: event.id,
      userId: event.userId,
      roundId: event.roundId,
      eventType: event.eventType,
      eventData: event.eventData,
      occurredAt: event.occurredAt.toISOString(),
    });
    // XADD <stream> MAXLEN ~ <max> * eventId <payload>
    await client.xadd(
      REDIS_STREAM,
      'MAXLEN',
      '~',
      String(REDIS_STREAM_MAXLEN),
      '*',
      'eventId',
      event.id,
      'payload',
      payload,
    );
  }

  private async broadcast(event: EventEntity): Promise<void> {
    const channel = `${REDIS_CHANNELS.EVENT_BROADCAST}:${event.userId}`;
    await this.redis.publish(channel, {
      id: event.id,
      userId: event.userId,
      roundId: event.roundId,
      eventType: event.eventType,
      eventData: event.eventData,
      occurredAt: event.occurredAt.toISOString(),
    });
  }
}
