import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  BEHAVIORAL_EVENTS,
  REDIS_CHANNELS,
  type TelemetryEventType,
} from '@extraction/shared';

import { TelemetryEventEntity } from '../../database/entities/telemetry-event.entity';
import { EventsService } from '../events/events.service';
import { RedisService } from '../redis/redis.service';
import type { TelemetryBatchDto } from './dto/telemetry-batch.dto';

const PRODUCTIVE_TYPES: ReadonlyArray<TelemetryEventType> = [
  'git_commit',
  'terminal_activity',
  'focus_session_ended',
  'ide_activity',
];

const DISTRACTION_TYPES: ReadonlyArray<TelemetryEventType> = [
  'distraction_detected',
  'idle_detected',
];

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

const EVENT_TYPE_TO_OPERATIONAL_EVENT: Record<TelemetryEventType, string | null> = {
  app_switched: BEHAVIORAL_EVENTS.APP_SWITCHED,
  idle_detected: BEHAVIORAL_EVENTS.IDLE_DETECTED,
  idle_ended: BEHAVIORAL_EVENTS.IDLE_ENDED,
  terminal_activity: BEHAVIORAL_EVENTS.TERMINAL_ACTIVITY,
  git_commit: BEHAVIORAL_EVENTS.GIT_COMMIT,
  ide_activity: null,
  browser_tab_changed: null,
  distraction_detected: BEHAVIORAL_EVENTS.DISTRACTION_DETECTED,
  focus_session_started: BEHAVIORAL_EVENTS.FOCUS_SESSION_STARTED,
  focus_session_ended: BEHAVIORAL_EVENTS.FOCUS_SESSION_ENDED,
  manual_checkin: BEHAVIORAL_EVENTS.RECOVERY_ACTION,
};

export interface IngestResult {
  accepted: number;
  rejected: number;
  errors: ReadonlyArray<{ index: number; reason: string }>;
}

@Injectable()
export class TelemetryService {
  private readonly logger = new Logger(TelemetryService.name);
  private readonly hmacEnabled: boolean;

  constructor(
    @InjectRepository(TelemetryEventEntity)
    private readonly telemetry: Repository<TelemetryEventEntity>,
    private readonly events: EventsService,
    private readonly redis: RedisService,
    private readonly config: ConfigService,
  ) {
    this.hmacEnabled =
      this.config.get<string>('HMAC_VERIFICATION_ENABLED') === 'true';
  }

  /**
   * Skeleton HMAC verifier. Returns true unconditionally until device keys
   * are provisioned (Phase 3 work). When enabled in env, this is where
   * real signature verification will live.
   */
  verifyHmac(
    _signature: string | undefined,
    _body: string,
    _deviceKey?: string,
  ): boolean {
    if (!this.hmacEnabled) {
      return true;
    }
    // TODO(phase3): implement real HMAC-SHA256 verification when device keys
    // are issued by a device-registration flow.
    return true;
  }

  async ingestBatch(
    userId: string,
    dto: TelemetryBatchDto,
  ): Promise<IngestResult> {
    if (!this.verifyHmac(dto.signature, JSON.stringify(dto.batches))) {
      throw new BadRequestException('Invalid telemetry signature');
    }

    const now = Date.now();
    const errors: Array<{ index: number; reason: string }> = [];
    const candidateRows: TelemetryEventEntity[] = [];
    const dedupKeys: Array<{
      deviceId: string;
      occurredAt: Date;
      eventType: TelemetryEventType;
    }> = [];
    let globalIndex = 0;

    for (const batch of dto.batches) {
      const periodStartMs = Date.parse(batch.periodStart);
      const periodEndMs = Date.parse(batch.periodEnd);
      if (!Number.isFinite(periodStartMs) || !Number.isFinite(periodEndMs)) {
        errors.push({ index: globalIndex, reason: 'invalid period bounds' });
        globalIndex += batch.events.length;
        continue;
      }

      for (const event of batch.events) {
        const occurredMs = Date.parse(event.occurredAt);
        if (!Number.isFinite(occurredMs)) {
          errors.push({ index: globalIndex, reason: 'invalid occurredAt' });
          globalIndex += 1;
          continue;
        }
        if (now - occurredMs > SEVEN_DAYS_MS) {
          errors.push({ index: globalIndex, reason: 'event older than 7 days' });
          globalIndex += 1;
          continue;
        }
        if (occurredMs > now + 60_000) {
          errors.push({ index: globalIndex, reason: 'occurredAt in future' });
          globalIndex += 1;
          continue;
        }

        const occurredAt = new Date(occurredMs);
        const isProductive = PRODUCTIVE_TYPES.includes(event.eventType)
          ? true
          : DISTRACTION_TYPES.includes(event.eventType)
            ? false
            : null;

        const row = this.telemetry.create({
          userId,
          roundId: event.roundId ?? null,
          source: dto.source,
          deviceId: dto.deviceId,
          eventType: event.eventType,
          payload: event.payload,
          isProductive,
          confidenceScore: null,
          occurredAt,
        });
        candidateRows.push(row);
        dedupKeys.push({
          deviceId: dto.deviceId,
          occurredAt,
          eventType: event.eventType,
        });
        globalIndex += 1;
      }
    }

    if (candidateRows.length === 0) {
      return { accepted: 0, rejected: errors.length, errors };
    }

    // Deduplicate by (deviceId + occurredAt + eventType). We can only enforce
    // this with an existing-rows lookup; if rows are added later we still risk
    // a race, but the lookup window matches the batch.
    const uniqueEventTypes = Array.from(new Set(dedupKeys.map((k) => k.eventType)));
    const occurredAts = dedupKeys.map((k) => k.occurredAt);
    const existing = await this.telemetry
      .createQueryBuilder('te')
      .where('te.device_id = :deviceId', { deviceId: dto.deviceId })
      .andWhere('te.event_type IN (:...types)', { types: uniqueEventTypes })
      .andWhere('te.occurred_at IN (:...occurredAts)', { occurredAts })
      .getMany();
    const existingKeys = new Set(
      existing.map(
        (e) =>
          `${e.deviceId}|${e.occurredAt.toISOString()}|${e.eventType}`,
      ),
    );
    const toInsert = candidateRows.filter(
      (row) =>
        !existingKeys.has(
          `${row.deviceId}|${row.occurredAt.toISOString()}|${row.eventType}`,
        ),
    );
    const duplicates = candidateRows.length - toInsert.length;

    if (toInsert.length === 0) {
      return {
        accepted: 0,
        rejected: errors.length + duplicates,
        errors,
      };
    }

    // Bulk insert. TypeORM's save with array uses a single transaction.
    const saved = await this.telemetry.save(toInsert);

    // Emit operational events asynchronously — best-effort fanout.
    for (const row of saved) {
      const opType = EVENT_TYPE_TO_OPERATIONAL_EVENT[row.eventType];
      if (opType) {
        await this.events.emit({
          userId: row.userId,
          roundId: row.roundId,
          eventType: opType,
          eventData: {
            source: row.source,
            deviceId: row.deviceId,
            telemetryEventId: row.id,
            payload: row.payload,
          },
          occurredAt: row.occurredAt,
        });
      }
    }

    // Notify scoring/etc that telemetry has landed.
    void this.redis
      .publish(REDIS_CHANNELS.TELEMETRY_INGESTED, {
        userId,
        deviceId: dto.deviceId,
        count: saved.length,
      })
      .catch((err) => {
        this.logger.warn(
          `Failed to publish telemetry-ingested: ${err instanceof Error ? err.message : String(err)}`,
        );
      });

    return {
      accepted: saved.length,
      rejected: errors.length + duplicates,
      errors,
    };
  }
}
