import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class BehaviorEventDto {
  @IsString()
  type!: string;

  /** ISO timestamp (preferred) or epoch ms string */
  @IsString()
  timestamp!: string;

  @IsOptional()
  @IsString()
  domain?: string;

  @IsOptional()
  @IsInt()
  durationSec?: number;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class AnalyzeBehaviorDto {
  @IsString()
  userId!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  windowDays?: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BehaviorEventDto)
  events!: BehaviorEventDto[];

  @IsOptional()
  @IsBoolean()
  includeAiInsights?: boolean;
}
