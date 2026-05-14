import { randomUUID } from 'crypto';
import {
  BeforeInsert,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
} from 'typeorm';
import type {
  ConsequenceSeverity,
  ConsequenceType,
} from '@extraction/shared';

@Entity({ name: 'consequences' })
@Index('idx_consequences_user', ['userId', 'issuedAt'])
@Index('idx_consequences_round', ['roundId'])
@Index('idx_consequences_unack', ['userId', 'acknowledgedAt'])
export class ConsequenceEntity {
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

  @Column({ type: 'varchar', length: 64, name: 'consequence_type' })
  consequenceType!: ConsequenceType;

  @Column({ type: 'varchar', length: 32 })
  severity!: ConsequenceSeverity;

  @Column({ type: 'text' })
  description!: string;

  @Column({ type: 'integer', default: 0, name: 'reputation_delta' })
  reputationDelta!: number;

  @Column({ type: 'simple-json', default: () => "'{}'" })
  metadata!: Record<string, unknown>;

  @Column({ type: 'datetime', nullable: true, name: 'acknowledged_at' })
  acknowledgedAt!: Date | null;

  @Column({ type: 'datetime', name: 'issued_at' })
  issuedAt!: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
