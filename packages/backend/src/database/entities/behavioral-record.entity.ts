import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity({ name: 'behavioral_records' })
@Index('idx_behavioral_user_round', ['userId', 'roundId'])
@Index('idx_behavioral_period', ['periodStart', 'periodEnd'])
export class BehavioralRecordEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'user_id' })
  userId!: string;

  @Column({ type: 'uuid', nullable: true, name: 'round_id' })
  roundId!: string | null;

  @Column({ type: 'timestamptz', name: 'period_start' })
  periodStart!: Date;

  @Column({ type: 'timestamptz', name: 'period_end' })
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

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb", name: 'anomaly_flags' })
  anomalyFlags!: string[];

  @Column({ type: 'integer', default: 0, name: 'event_count' })
  eventCount!: number;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;
}
