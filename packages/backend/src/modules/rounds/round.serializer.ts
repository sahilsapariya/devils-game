import type { Round, RoundDifficulty, RoundStats } from '@extraction/shared';
import { DEFAULT_DIFFICULTY } from '@extraction/shared';

import type { RoundEntity } from '../../database/entities/round.entity';

const DEFAULT_STATS: RoundStats = {
  totalFocusMinutes: 0,
  totalIdleMinutes: 0,
  appSwitches: 0,
  distractionsDetected: 0,
  violationsCount: 0,
  gitCommitsCount: 0,
  productivityScore: null,
};

export type RoundView = Round;

const toIso = (value: Date | null): string | null =>
  value === null ? null : value.toISOString();

export const normalizeDifficulty = (
  partial: Partial<RoundDifficulty> | null | undefined,
): RoundDifficulty => ({
  timePressure: partial?.timePressure ?? DEFAULT_DIFFICULTY.timePressure,
  distractionSensitivity:
    partial?.distractionSensitivity ?? DEFAULT_DIFFICULTY.distractionSensitivity,
  verificationStrictness:
    partial?.verificationStrictness ?? DEFAULT_DIFFICULTY.verificationStrictness,
  announcementFrequency:
    partial?.announcementFrequency ?? DEFAULT_DIFFICULTY.announcementFrequency,
  environmentalPressure:
    partial?.environmentalPressure ?? DEFAULT_DIFFICULTY.environmentalPressure,
  pointsMultiplier: partial?.pointsMultiplier ?? DEFAULT_DIFFICULTY.pointsMultiplier,
});

export const normalizeStats = (
  partial: Partial<RoundStats> | null | undefined,
): RoundStats => ({
  ...DEFAULT_STATS,
  ...(partial ?? {}),
});

export const serializeRound = (entity: RoundEntity): RoundView => ({
  id: entity.id,
  userId: entity.userId,
  missionId: entity.missionId,
  status: entity.status,
  operationalState: entity.operationalState,
  difficulty: normalizeDifficulty(entity.difficulty),
  scheduledStart: entity.scheduledStart.toISOString(),
  scheduledEnd: entity.scheduledEnd.toISOString(),
  actualStart: toIso(entity.actualStart),
  actualEnd: toIso(entity.actualEnd),
  durationMinutes: entity.durationMinutes,
  stats: normalizeStats(entity.stats),
  pointsEarned: entity.pointsEarned,
  failureReason: entity.failureReason,
  createdAt: entity.createdAt.toISOString(),
  updatedAt: entity.updatedAt.toISOString(),
});
