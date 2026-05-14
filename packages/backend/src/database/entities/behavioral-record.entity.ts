import { randomUUID } from 'crypto';
import {
  BeforeInsert,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
} from 'typeorm';

@Entity({ name: 'behavioral_records' })
@Index('idx_behavioral_user_round', ['userId', 'roundId'])
@Index('idx_behavioral_period', ['periodStart', 'periodEnd'])
export class BehavioralRecordEntity {
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

  @Column({ type: 'datetime', name: 'period_start' })
  periodStart!: Date;

  @Column({ type: 'datetime', name: 'period_end' })
  periodEnd!: Date;

  @Column({ type: 'integer', default: 0, name: 'total_focus_minutes' })
  totalFocusMinutes!: number;

  @Column({ type: 'integer', default: 0, name: 'total_idle_minutes' })
  totalIdleMinutes!: number;

  @Column({ type: 'integer', default: 0, name: 'app_switches' })
  appSwitches!: number;

  @Column({ type: 'integer', default: 0, name: 'productive_apps_active' })
  productiveAppsActive!: number;

  @Column({ type: 'integer', default: 0, name: 'distractions_detected' })
  distractionsDetected!: number;

  @Column({ type: 'integer', default: 0, name: 'git_commits' })
  gitCommits!: number;

  @Column({ type: 'integer', default: 0, name: 'ide_activity_minutes' })
  ideActivityMinutes!: number;

  @Column({ type: 'integer', default: 0, name: 'terminal_commands' })
  terminalCommands!: number;

  @Column({
    type: 'numeric',
    precision: 5,
    scale: 4,
    default: 0,
    name: 'productivity_score',
  })
  productivityScore!: number;

  @Column({ type: 'simple-json', default: () => "'[]'", name: 'anomaly_flags' })
  anomalyFlags!: string[];

  @Column({ type: 'integer', default: 0, name: 'event_count' })
  eventCount!: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
