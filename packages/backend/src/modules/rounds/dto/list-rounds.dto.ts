import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

import type { RoundStatus } from '@extraction/shared';

const ALLOWED_STATUS: ReadonlyArray<RoundStatus> = [
  'scheduled',
  'active',
  'paused',
  'completed',
  'failed',
  'abandoned',
];

export class ListRoundsDto {
  @IsOptional()
  @IsIn(ALLOWED_STATUS as readonly string[])
  status?: RoundStatus;

  @IsOptional()
  @IsUUID('4')
  missionId?: string;

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
