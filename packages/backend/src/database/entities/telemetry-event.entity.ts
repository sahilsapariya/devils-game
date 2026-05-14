import { randomUUID } from 'crypto';
import {
  BeforeInsert,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
} from 'typeorm';
import type {
  TelemetryEventPayload,
  TelemetryEventType,
  TelemetrySource,
} from '@extraction/shared';

@Entity({ name: 'telemetry_events' })
@Index('idx_telemetry_user_round', ['userId', 'roundId'])
@Index('idx_telemetry_occurred_at', ['occurredAt'])
@Index('idx_telemetry_user_type_occurred', [
  'userId',
  'eventType',
  'occurredAt',
])
@Index('idx_telemetry_device', ['deviceId'])
export class TelemetryEventEntity {
  @PrimaryColumn('uuid')
  id!: string;

  @BeforeInsert()
  generateId(): void {
    if (!this.id) {
      this.id = randomUUID();
    }
  }

  @Column({ type: 'uuid', name: 'user_id' })
  userId!: string;

  @Column({ type: 'uuid', nullable: true, name: 'round_id' })
  roundId!: string | null;

  @Column({ type: 'varchar', length: 32 })
  source!: TelemetrySource;

  @Column({ type: 'varchar', length: 128, name: 'device_id' })
  deviceId!: string;

  @Column({ type: 'varchar', length: 64, name: 'event_type' })
  eventType!: TelemetryEventType;

  @Column({ type: 'simple-json' })
  payload!: TelemetryEventPayload;

  @Column({ type: 'boolean', nullable: true, name: 'is_productive' })
  isProductive!: boolean | null;

  @Column({
    type: 'numeric',
    precision: 4,
    scale: 3,
    nullable: true,
    name: 'confidence_score',
  })
  confidenceScore!: number | null;

  @Column({ type: 'datetime', name: 'occurred_at' })
  occurredAt!: Date;

  @CreateDateColumn({ name: 'received_at' })
  receivedAt!: Date;
}
