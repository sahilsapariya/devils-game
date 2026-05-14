import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type {
  AnnouncementCategory,
  AnnouncementTone,
} from '@extraction/shared';

@Entity({ name: 'announcements' })
@Index('idx_announcements_user_scheduled', ['userId', 'scheduledFor'])
@Index('idx_announcements_round', ['roundId'])
@Index('idx_announcements_undelivered', ['userId', 'deliveredAt'])
export class AnnouncementEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'user_id' })
  userId!: string;

  @Column({ type: 'uuid', nullable: true, name: 'round_id' })
  roundId!: string | null;

  @Column({ type: 'varchar', length: 64 })
  category!: AnnouncementCategory;

  @Column({ type: 'varchar', length: 32 })
  tone!: AnnouncementTone;

  @Column({ type: 'text' })
  content!: string;

  @Column({ type: 'text', nullable: true, name: 'voice_url' })
  voiceUrl!: string | null;

  @Column({
    type: 'numeric',
    precision: 6,
    scale: 2,
    nullable: true,
    name: 'audio_duration_seconds',
  })
  audioDurationSeconds!: number | null;

  @Column({ type: 'boolean', default: false, name: 'ai_generated' })
  aiGenerated!: boolean;

  @Column({ type: 'boolean', default: false, name: 'quality_gate_passed' })
  qualityGatePassed!: boolean;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  metadata!: Record<string, unknown>;

  @Column({ type: 'timestamptz', name: 'scheduled_for' })
  scheduledFor!: Date;

  @Column({ type: 'timestamptz', nullable: true, name: 'delivered_at' })
  deliveredAt!: Date | null;

  @Column({ type: 'timestamptz', nullable: true, name: 'acknowledged_at' })
  acknowledgedAt!: Date | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;
}
