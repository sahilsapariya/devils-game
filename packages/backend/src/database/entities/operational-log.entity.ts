import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export type OperationalLogLevel = 'info' | 'warning' | 'critical';

@Entity({ name: 'operational_logs' })
@Index('idx_oplogs_user_created', ['userId', 'createdAt'])
@Index('idx_oplogs_round', ['roundId'])
@Index('idx_oplogs_level', ['level'])
export class OperationalLogEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'user_id' })
  userId!: string;

  @Column({ type: 'uuid', nullable: true, name: 'round_id' })
  roundId!: string | null;

  @Column({ type: 'varchar', length: 16 })
  level!: OperationalLogLevel;

  @Column({ type: 'text' })
  message!: string;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  context!: Record<string, unknown>;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;
}
