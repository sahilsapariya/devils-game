import { randomUUID } from 'crypto';
import {
  BeforeInsert,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { MissionObjective, MissionStatus } from '@extraction/shared';
import { UserEntity } from './user.entity';
import { RoundEntity } from './round.entity';

@Entity({ name: 'missions' })
@Index('idx_missions_user_status', ['userId', 'status'])
@Index('idx_missions_scheduled_start', ['scheduledStart'])
export class MissionEntity {
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

  @Column({ type: 'varchar', length: 200 })
  title!: string;

  @Column({ type: 'text', default: '' })
  description!: string;

  @Column({ type: 'simple-json', default: () => "'[]'" })
  objectives!: MissionObjective[];

  @Column({ type: 'varchar', length: 32, default: 'draft' })
  status!: MissionStatus;

  @Column({ type: 'integer', default: 0 })
  priority!: number;

  @Column({ type: 'datetime', nullable: true, name: 'scheduled_start' })
  scheduledStart!: Date | null;

  @Column({ type: 'datetime', nullable: true, name: 'scheduled_end' })
  scheduledEnd!: Date | null;

  @Column({ type: 'integer', default: 0, name: 'total_rounds' })
  totalRounds!: number;

  @Column({ type: 'integer', default: 0, name: 'completed_rounds' })
  completedRounds!: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  @ManyToOne(() => UserEntity, (user) => user.missions, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'user_id' })
  user?: UserEntity;

  @OneToMany(() => RoundEntity, (round) => round.mission)
  rounds?: RoundEntity[];
}
