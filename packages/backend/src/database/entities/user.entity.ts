import { randomUUID } from 'crypto';
import {
  BeforeInsert,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { UserPreferences } from '@extraction/shared';
import { MissionEntity } from './mission.entity';
import { RoundEntity } from './round.entity';

@Entity({ name: 'users' })
@Index('idx_users_email', ['email'], { unique: true })
export class UserEntity {
  @PrimaryColumn('uuid')
  id!: string;

  @BeforeInsert()
  generateId(): void {
    if (!this.id) {
      this.id = randomUUID();
    }
  }

  @Column({ type: 'varchar', length: 255, unique: true })
  email!: string;

  @Column({ type: 'varchar', length: 255, name: 'password_hash' })
  passwordHash!: string;

  @Column({ type: 'varchar', length: 100, nullable: true, name: 'display_name' })
  displayName!: string | null;

  @Column({ type: 'integer', default: 0, name: 'reputation_score' })
  reputationScore!: number;

  @Column({ type: 'integer', default: 0, name: 'current_streak' })
  currentStreak!: number;

  @Column({ type: 'integer', default: 0, name: 'longest_streak' })
  longestStreak!: number;

  @Column({ type: 'integer', default: 3, name: 'difficulty_ceiling' })
  difficultyCeiling!: number;

  @Column({ type: 'simple-json', default: () => "'{}'" })
  preferences!: UserPreferences;

  @Column({ type: 'boolean', default: true, name: 'is_active' })
  isActive!: boolean;

  @Column({ type: 'datetime', nullable: true, name: 'email_verified_at' })
  emailVerifiedAt!: Date | null;

  @Column({ type: 'datetime', nullable: true, name: 'last_login_at' })
  lastLoginAt!: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  @OneToMany(() => MissionEntity, (mission) => mission.user)
  missions?: MissionEntity[];

  @OneToMany(() => RoundEntity, (round) => round.user)
  rounds?: RoundEntity[];
}
