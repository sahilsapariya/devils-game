import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity({ name: 'event_snapshots' })
@Index('idx_event_snapshots_user_round', ['userId', 'roundId', 'snapshotAt'])
export class EventSnapshotEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'user_id' })
  userId!: string;

  @Column({ type: 'uuid', nullable: true, name: 'round_id' })
  roundId!: string | null;

  @Column({ type: 'timestamptz', name: 'snapshot_at' })
  snapshotAt!: Date;

  @Column({ type: 'integer', name: 'event_count' })
  eventCount!: number;

  @Column({ type: 'jsonb', name: 'state_data' })
  stateData!: Record<string, unknown>;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;
}
