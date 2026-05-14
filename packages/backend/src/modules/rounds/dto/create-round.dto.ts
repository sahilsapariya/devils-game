import { Type } from 'class-transformer';
import {
  IsInt,
  IsISO8601,
  IsObject,
  IsOptional,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

import { RoundDifficultyDto } from './round-difficulty.dto';

export class CreateRoundDto {
  @IsUUID('4')
  missionId!: string;

  @IsISO8601()
  scheduledStart!: string;

  @IsISO8601()
  scheduledEnd!: string;

  @IsInt()
  @Min(5)
  @Max(24 * 60)
  durationMinutes!: number;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => RoundDifficultyDto)
  difficulty?: RoundDifficultyDto;
}
