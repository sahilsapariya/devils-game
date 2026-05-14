import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

import type { RoundStatus } from '@extraction/shared';

const ALLOWED_STATUS: ReadonlyArray<RoundStatus> = [
  'scheduled',
  'active',
  'paused',
  'completed',
  'failed',
  'abandoned',
];

export class UpdateRoundDto {
  @IsOptional()
  @IsIn(ALLOWED_STATUS as readonly string[])
  status?: RoundStatus;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  failureReason?: string;
}
