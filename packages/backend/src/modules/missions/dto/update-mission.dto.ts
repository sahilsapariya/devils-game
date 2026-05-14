import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import type { MissionStatus } from '@extraction/shared';

import { MissionObjectiveDto } from './mission-objective.dto';

const MISSION_STATUSES: ReadonlyArray<MissionStatus> = [
  'draft',
  'active',
  'completed',
  'archived',
];

export class UpdateMissionDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => MissionObjectiveDto)
  objectives?: MissionObjectiveDto[];

  @IsOptional()
  @IsIn(MISSION_STATUSES)
  status?: MissionStatus;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  priority?: number;

  @IsOptional()
  @IsDateString()
  scheduledStart?: string;

  @IsOptional()
  @IsDateString()
  scheduledEnd?: string;
}
