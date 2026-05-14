import type { User } from '@extraction/shared';
import type { UserEntity } from '../../database/entities/user.entity';

/** Public-facing user shape — strips password hash and internal flags. */
export type PublicUser = User;

const toIso = (value: Date | null): string | null =>
  value === null ? null : value.toISOString();

export const serializeUser = (entity: UserEntity): PublicUser => ({
  id: entity.id,
  email: entity.email,
  displayName: entity.displayName,
  reputationScore: entity.reputationScore,
  currentStreak: entity.currentStreak,
  longestStreak: entity.longestStreak,
  difficultyCeiling: entity.difficultyCeiling,
  preferences: entity.preferences,
  isActive: entity.isActive,
  emailVerifiedAt: toIso(entity.emailVerifiedAt),
  lastLoginAt: toIso(entity.lastLoginAt),
  createdAt: entity.createdAt.toISOString(),
  updatedAt: entity.updatedAt.toISOString(),
});
