import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  Max,
  ValidateNested,
} from 'class-validator';

class UserPreferencesDto {
  @IsOptional()
  @IsString()
  @MaxLength(128)
  voiceId?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  announcementVolume?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  preferredAnnouncementTimes?: string[];

  @IsOptional()
  @IsArray()
  @IsIn(['push', 'email'], { each: true })
  notificationChannels?: Array<'push' | 'email'>;
}

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  displayName?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => UserPreferencesDto)
  preferences?: UserPreferencesDto;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
