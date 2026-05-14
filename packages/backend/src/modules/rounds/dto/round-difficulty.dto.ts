import { IsNumber, Max, Min } from 'class-validator';

export class RoundDifficultyDto {
  @IsNumber()
  @Min(1)
  @Max(10)
  timePressure!: number;

  @IsNumber()
  @Min(1)
  @Max(10)
  distractionSensitivity!: number;

  @IsNumber()
  @Min(1)
  @Max(10)
  verificationStrictness!: number;

  @IsNumber()
  @Min(1)
  @Max(10)
  announcementFrequency!: number;

  @IsNumber()
  @Min(1)
  @Max(10)
  environmentalPressure!: number;

  @IsNumber()
  @Min(0.1)
  @Max(5)
  pointsMultiplier!: number;
}
