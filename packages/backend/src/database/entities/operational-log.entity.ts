import { randomUUID } from 'crypto';
import {
  BeforeInsert,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
} from 'typeorm';

export type OperationalLogLevel = 'info' | 'warning' | 'critical';

@Entity({ name: 'operational_logs' })
@Index('idx_oplogs_user_created', ['userId', 'createdAt'])
@Index('idx_oplogs_round', ['roundId'])
@Index('idx_oplogs_level', ['level'])
export class OperationalLogEntity {
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

  @Column({ type: 'varchar', length: 16 })
  level!: OperationalLogLevel;

  @Column({ type: 'text' })
  message!: string;

  @Column({ type: 'simple-json', default: () => "'{}'" })
  context!: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
