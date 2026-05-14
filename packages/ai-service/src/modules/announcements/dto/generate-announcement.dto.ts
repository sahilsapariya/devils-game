import { Type } from 'class-transformer';
import {
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

  @IsOptional()
  @IsString()
  recentPattern?: string;

  @IsOptional()
  @IsString()
  recommendation?: string;

  @IsOptional()
  @IsString()
  recoveryOpportunity?: string;
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
