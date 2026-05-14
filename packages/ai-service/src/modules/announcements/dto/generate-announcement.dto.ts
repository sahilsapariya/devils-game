import { Type } from 'class-transformer';
import {
  Allow,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

const ANNOUNCEMENT_TYPES = [
  'status_report',
  'pressure_escalation',
  'behavioral_analysis',
  'recovery_offer',
  'ambient_presence',
  'operational_update',
] as const;

export type AnnouncementTypeDto = (typeof ANNOUNCEMENT_TYPES)[number];

export class AnnouncementContextDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  timeRemainingSec?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  violations?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  focusMinutes?: number;

  @IsOptional()
  @IsString()
  state?: string;

  @IsOptional()
  @IsInt()
  consecutiveFailures?: number;

  // recentPattern is permitted to be either a free-form summary string or a
  // structured object emitted by the backend's behavioral analysis pipeline.
  @IsOptional()
  @Allow()
  recentPattern?: unknown;

  @IsOptional()
  @IsString()
  recommendation?: string;

  @IsOptional()
  @IsString()
  recoveryOpportunity?: string;

  // Backend-correlation fields. These are passed through for logging and
  // template rendering; we don't constrain their shape further.
  @IsOptional()
  @IsString()
  roundId?: string;

  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @IsInt()
  streak?: number;

  @IsOptional()
  @IsNumber()
  reputation?: number;
}

export class GenerateAnnouncementDto {
  @IsEnum(ANNOUNCEMENT_TYPES)
  type!: AnnouncementTypeDto;

  @IsObject()
  @ValidateNested()
  @Type(() => AnnouncementContextDto)
  context!: AnnouncementContextDto;

  @IsOptional()
  @IsString()
  toneGuidance?: string;

  @IsOptional()
  @IsBoolean()
  skipVoice?: boolean;
}
