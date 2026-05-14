import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  BEHAVIORAL_EVENTS,
  OPERATIONAL_EVENTS,
  STATE_TRANSITION,
} from '@extraction/shared';

import { EventEntity } from '../../database/entities/event.entity';
import { RoundEntity } from '../../database/entities/round.entity';
import { RedisService } from '../redis/redis.service';
import { EventsService } from './events.service';
import { EventSnapshotService } from './event-snapshot.service';

/**
 * Event-processor side-effect dispatcher.
 *
 * Designed to be invoked from a BullMQ consumer (queue: `events`).
 * Until BullMQ is wired in, callers can invoke `process(eventId)` directly.
 *
 * Idempotency: events with `is_processed = true` are short-circuited.
 *
 * Side effects per event type:
 *  - round.completed      → enqueue scoring + difficulty update + announcement
 *  - behavior.distraction → increment violation counter; check threshold
 *  - state.transition     → update Redis cache `user:${userId}:current_state`
 */
@Injectable()
export class EventProcessor {
  private readonly logger = new Logger(EventProcessor.name);

  constructor(
    @InjectRepository(EventEntity)
    private readonly events: Repository<EventEntity>,
    @InjectRepository(RoundEntity)
    private readonly rounds: Repository<RoundEntity>,
    private readonly eventsService: EventsService,
    private readonly snapshots: EventSnapshotService,
    private readonly redis: RedisService,
  ) {}

  /** Process a single event by id. Safe to invoke concurrently for different ids. */
  async process(eventId: string): Promise<void> {
    const event = await this.events.findOne({ where: { id: eventId } });
    if (!event) {
      return;
    }
    if (event.isProcessed) {
      return;
    }

    try {
      await this.dispatch(event);
    } catch (error) {
      this.logger.error(
        `Failed to process event ${event.id} (${event.eventType}): ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      // Re-throw so BullMQ can retry per its policy.
      throw error;
    }

    await this.eventsService.markProcessed(event.id);
    void this.snapshots.maybeSnapshot(event.userId).catch((err) => {
      this.logger.warn(
        `Snapshot computation failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    });
  }

  private async dispatch(event: EventEntity): Promise<void> {
    switch (event.eventType) {
      case OPERATIONAL_EVENTS.ROUND_COMPLETED:
        await this.handleRoundCompleted(event);
        return;
      case BEHAVIORAL_EVENTS.DISTRACTION_DETECTED:
        await this.handleDistraction(event);
        return;
      case OPERATIONAL_EVENTS.STATE_TRANSITION:
        await this.handleStateTransition(event);
        return;
      default:
        // No side-effect for other event types — they're purely audit.
        return;
    }
  }

  private async handleRoundCompleted(event: EventEntity): Promise<void> {
    // The scoring/difficulty/announcement modules each subscribe to round.completed
    // via this dispatcher; we publish lightweight Redis hints so workers can pick
    // up the work without tight coupling.
    if (!event.roundId) {
      return;
    }
    await this.redis.publish('extraction:work:scoring', {
      eventId: event.id,
      roundId: event.roundId,
      userId: event.userId,
    });
    await this.redis.publish('extraction:work:difficulty', {
      eventId: event.id,
      userId: event.userId,
    });
    await this.redis.publish('extraction:work:announcements', {
      eventId: event.id,
      roundId: event.roundId,
      userId: event.userId,
      type: 'status_report',
    });
  }

  private async handleDistraction(event: EventEntity): Promise<void> {
    if (!event.roundId) {
      return;
    }
    const round = await this.rounds.findOne({ where: { id: event.roundId } });
    if (!round) {
      return;
    }

    const stats = round.stats ?? ({} as Partial<typeof round.stats>);
    const violations = (stats.violationsCount ?? 0) + 1;
    const distractions = (stats.distractionsDetected ?? 0) + 1;

    round.stats = {
      totalFocusMinutes: stats.totalFocusMinutes ?? 0,
      totalIdleMinutes: stats.totalIdleMinutes ?? 0,
      appSwitches: stats.appSwitches ?? 0,
      distractionsDetected: distractions,
      violationsCount: violations,
      gitCommitsCount: stats.gitCommitsCount ?? 0,
      productivityScore: stats.productivityScore ?? null,
    };
    await this.rounds.save(round);

    if (
      violations >= STATE_TRANSITION.CRITICAL_VIOLATIONS_THRESHOLD &&
      round.operationalState === 'OPERATIONAL'
    ) {
      // Escalate — emit a downstream state.transition trigger so RoundsService
      // can react. We avoid direct dependency by signaling via Redis.
      await this.redis.publish('extraction:work:state-escalation', {
        roundId: round.id,
        userId: round.userId,
        trigger: 'round.violations_threshold',
      });
    }
  }

  private async handleStateTransition(event: EventEntity): Promise<void> {
    const data = event.eventData as { to?: string } | null;
    if (!data?.to) {
      return;
    }
    await this.redis.set(
      `user:${event.userId}:current_state`,
      data.to,
      60 * 60 * 24, // 24h TTL
    );
  }
}
