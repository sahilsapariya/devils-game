import { randomUUID } from 'crypto';
import type { Mission, MissionObjective } from '@extraction/shared';

import type { MissionEntity } from '../../database/entities/mission.entity';

const toIso = (value: Date | null): string | null =>
  value === null ? null : value.toISOString();

export type MissionView = Mission;

export const serializeMission = (entity: MissionEntity): MissionView => ({
  id: entity.id,
  userId: entity.userId,
  title: entity.title,
  description: entity.description,
  objectives: entity.objectives,
  status: entity.status,
  priority: entity.priority,
  scheduledStart: toIso(entity.scheduledStart),
  scheduledEnd: toIso(entity.scheduledEnd),
  totalRounds: entity.totalRounds,
  completedRounds: entity.completedRounds,
  createdAt: entity.createdAt.toISOString(),
  updatedAt: entity.updatedAt.toISOString(),
});

export interface ObjectiveInput {
  id?: string;
  description: string;
  successCriteria: string;
  completed?: boolean;
}

/**
 * Normalizes user-supplied objectives:
 *  - Assigns deterministic UUIDs when missing
 *  - Defaults `completed` to false
 */
export const normalizeObjectives = (
  inputs: ReadonlyArray<ObjectiveInput>,
): MissionObjective[] =>
  inputs.map((input) => ({
    id: input.id ?? randomUUID(),
    description: input.description,
    successCriteria: input.successCriteria,
    completed: input.completed ?? false,
  }));
