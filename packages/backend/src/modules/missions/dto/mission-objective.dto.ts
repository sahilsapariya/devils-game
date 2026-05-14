import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class MissionObjectiveDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  id?: string;

  @IsString()
  @MaxLength(500)
  description!: string;

  @IsString()
  @MaxLength(500)
  successCriteria!: string;

  @IsOptional()
  @IsBoolean()
  completed?: boolean;
}
