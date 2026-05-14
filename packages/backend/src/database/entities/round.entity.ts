import { randomUUID } from 'crypto';
import {
  BeforeInsert,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import type {
  OperationalState,
  RoundDifficulty,
  RoundStats,
  RoundStatus,
} from '@extraction/shared';
import { UserEntity } from './user.entity';
import { MissionEntity } from './mission.entity';

@Entity({ name: 'rounds' })
@Index('idx_rounds_user_status', ['userId', 'status'])
@Index('idx_rounds_mission', ['missionId'])
@Index('idx_rounds_scheduled_start', ['scheduledStart'])
@Index('idx_rounds_operational_state', ['operationalState'])
export class RoundEntity {
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

  @Column({ type: 'uuid', name: 'mission_id' })
  missionId!: string;

  @Column({ type: 'varchar', length: 32, default: 'scheduled' })
  status!: RoundStatus;

  @Column({
    type: 'varchar',
    length: 32,
    default: 'DORMANT',
    name: 'operational_state',
  })
  operationalState!: OperationalState;

  @Column({ type: 'simple-json', default: () => "'{}'" })
  difficulty!: RoundDifficulty;

  @Column({ type: 'datetime', name: 'scheduled_start' })
  scheduledStart!: Date;

  @Column({ type: 'datetime', name: 'scheduled_end' })
  scheduledEnd!: Date;

  @Column({ type: 'datetime', nullable: true, name: 'actual_start' })
  actualStart!: Date | null;

  @Column({ type: 'datetime', nullable: true, name: 'actual_end' })
  actualEnd!: Date | null;

  @Column({ type: 'integer', name: 'duration_minutes' })
  durationMinutes!: number;

  @Column({ type: 'simple-json', default: () => "'{}'" })
  stats!: RoundStats;

  @Column({ type: 'integer', default: 0, name: 'points_earned' })
  pointsEarned!: number;

  @Column({ type: 'text', nullable: true, name: 'failure_reason' })
  failureReason!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  @ManyToOne(() => UserEntity, (user) => user.rounds, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: UserEntity;

  @ManyToOne(() => MissionEntity, (mission) => mission.rounds, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'mission_id' })
  mission?: MissionEntity;
}
