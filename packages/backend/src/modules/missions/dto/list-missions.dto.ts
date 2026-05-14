import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import type { MissionStatus } from '@extraction/shared';

const MISSION_STATUSES: ReadonlyArray<MissionStatus> = [
  'draft',
  'active',
  'completed',
  'archived',
];

export class ListMissionsDto {
  @IsOptional()
  @IsIn(MISSION_STATUSES)
  status?: MissionStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}
