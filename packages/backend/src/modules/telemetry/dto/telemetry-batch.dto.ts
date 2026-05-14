import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsISO8601,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  ValidateNested,
} from 'class-validator';
import type { TelemetryEventType, TelemetrySource } from '@extraction/shared';

const ALLOWED_SOURCES: ReadonlyArray<TelemetrySource> = [
  'mobile',
  'desktop_agent',
  'extension',
  'backend',
];

const ALLOWED_EVENT_TYPES: ReadonlyArray<TelemetryEventType> = [
  'app_switched',
  'idle_detected',
  'idle_ended',
  'terminal_activity',
  'git_commit',
  'ide_activity',
  'browser_tab_changed',
  'distraction_detected',
  'focus_session_started',
  'focus_session_ended',
  'manual_checkin',
];

export class TelemetryEventInput {
  @IsIn(ALLOWED_EVENT_TYPES as readonly string[])
  eventType!: TelemetryEventType;

  @IsObject()
  payload!: Record<string, unknown>;

  @IsISO8601()
  occurredAt!: string;

  @IsOptional()
  @IsUUID('4')
  roundId?: string | null;
}

export class TelemetryBatchEntry {
  @IsISO8601()
  periodStart!: string;

  @IsISO8601()
  periodEnd!: string;

  @IsOptional()
  @IsObject()
  metrics?: Record<string, number>;

  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => TelemetryEventInput)
  events!: TelemetryEventInput[];
}

export class TelemetryBatchDto {
  @IsIn(ALLOWED_SOURCES as readonly string[])
  source!: TelemetrySource;

  @IsString()
  @Length(1, 128)
  deviceId!: string;

  @IsOptional()
  @IsString()
  @Length(1, 512)
  signature?: string;

  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => TelemetryBatchEntry)
  batches!: TelemetryBatchEntry[];

  @IsOptional()
  @IsISO8601()
  offlineStart?: string;
}
