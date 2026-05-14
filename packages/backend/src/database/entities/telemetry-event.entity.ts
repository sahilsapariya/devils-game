import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
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
  @PrimaryGeneratedColumn('uuid')
  id!: string;

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

  @Column({ type: 'jsonb' })
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

  @Column({ type: 'timestamptz', name: 'occurred_at' })
  occurredAt!: Date;

  @CreateDateColumn({ type: 'timestamptz', name: 'received_at' })
  receivedAt!: Date;
}
