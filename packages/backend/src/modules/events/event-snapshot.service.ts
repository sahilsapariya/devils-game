import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { EventEntity } from '../../database/entities/event.entity';
import { EventSnapshotEntity } from '../../database/entities/event-snapshot.entity';

const SNAPSHOT_EVERY = 1000;

/**
 * Periodically computes snapshots for fast event-store reconstruction.
 *
 * Strategy: every Nth event for a user, persist a snapshot containing
 * aggregated state (event count, latest known operational state, etc).
 *
 * This service exposes a deterministic computation entry point — the
 * BullMQ event processor (or a cron) can invoke `maybeSnapshot(userId)`
 * after each event commit.
 */
@Injectable()
export class EventSnapshotService {
  private readonly logger = new Logger(EventSnapshotService.name);

  constructor(
    @InjectRepository(EventEntity)
    private readonly events: Repository<EventEntity>,
    @InjectRepository(EventSnapshotEntity)
    private readonly snapshots: Repository<EventSnapshotEntity>,
  ) {}

  async maybeSnapshot(userId: string): Promise<EventSnapshotEntity | null> {
    const totalEvents = await this.events.count({ where: { userId } });
    if (totalEvents === 0 || totalEvents % SNAPSHOT_EVERY !== 0) {
      return null;
    }

    const lastSnapshot = await this.snapshots.findOne({
      where: { userId },
      order: { snapshotAt: 'DESC' },
    });
    if (lastSnapshot && lastSnapshot.eventCount === totalEvents) {
      return lastSnapshot;
    }

    return this.captureSnapshot(userId, totalEvents);
  }

  async captureSnapshot(
    userId: string,
    eventCount: number,
  ): Promise<EventSnapshotEntity> {
    const latestEvent = await this.events.findOne({
      where: { userId },
      order: { occurredAt: 'DESC' },
    });

    const snapshot = this.snapshots.create({
      userId,
      roundId: latestEvent?.roundId ?? null,
      snapshotAt: new Date(),
      eventCount,
      stateData: {
        lastEventId: latestEvent?.id ?? null,
        lastEventType: latestEvent?.eventType ?? null,
        lastEventOccurredAt: latestEvent?.occurredAt.toISOString() ?? null,
      },
    });
    return this.snapshots.save(snapshot);
  }

  async getLatestForUser(
    userId: string,
  ): Promise<EventSnapshotEntity | null> {
    return this.snapshots.findOne({
      where: { userId },
      order: { snapshotAt: 'DESC' },
    });
  }
}
