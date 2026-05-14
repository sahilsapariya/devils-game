import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * Append-only event store. The source of truth for all operational history.
 *
 * Rules:
 *  - Events are NEVER updated or deleted (audit immutability).
 *  - `is_processed` may flip from false to true exactly once when the
 *    downstream side-effect pipeline finishes handling the event.
 *  - `occurred_at` is supplied by the emitter (real time the event happened).
 *  - `received_at` is server-side ingest time.
 */
@Entity({ name: 'events' })
@Index('idx_events_user_round_type', ['userId', 'roundId', 'eventType'])
@Index('idx_events_occurred_at', ['occurredAt'])
@Index('idx_events_unprocessed', ['isProcessed', 'eventType'])
export class EventEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'user_id' })
  userId!: string;

  @Column({ type: 'uuid', nullable: true, name: 'round_id' })
  roundId!: string | null;

  @Column({ type: 'varchar', length: 100, name: 'event_type' })
  eventType!: string;

  @Column({ type: 'jsonb', name: 'event_data' })
  eventData!: Record<string, unknown>;

  @Column({ type: 'timestamptz', name: 'occurred_at' })
  occurredAt!: Date;

  @CreateDateColumn({ type: 'timestamptz', name: 'received_at' })
  receivedAt!: Date;

  @Column({ type: 'boolean', default: false, name: 'is_processed' })
  isProcessed!: boolean;

  @Column({ type: 'timestamptz', nullable: true, name: 'processed_at' })
  processedAt!: Date | null;
}
