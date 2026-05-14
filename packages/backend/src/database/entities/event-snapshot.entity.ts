import { randomUUID } from 'crypto';
import {
  BeforeInsert,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
} from 'typeorm';

@Entity({ name: 'event_snapshots' })
@Index('idx_event_snapshots_user_round', ['userId', 'roundId', 'snapshotAt'])
export class EventSnapshotEntity {
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

  @Column({ type: 'datetime', name: 'snapshot_at' })
  snapshotAt!: Date;

  @Column({ type: 'integer', name: 'event_count' })
  eventCount!: number;

  @Column({ type: 'simple-json', name: 'state_data' })
  stateData!: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
