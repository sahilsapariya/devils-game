import {
  IsEmail,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';

export class RegisterDto {
  @IsEmail({}, { message: 'A valid email address is required' })
  @MaxLength(255)
  email!: string;

  /**
   * Password requirements:
   *  - 12-128 characters
   *  - At least one uppercase letter
   *  - At least one lowercase letter
   *  - At least one digit
   */
  @IsString()
  @Length(12, 128, { message: 'Password must be 12-128 characters' })
  @Matches(/[A-Z]/, {
    message: 'Password must contain at least one uppercase letter',
  })
  @Matches(/[a-z]/, {
    message: 'Password must contain at least one lowercase letter',
  })
  @Matches(/\d/, { message: 'Password must contain at least one digit' })
  password!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  displayName?: string;
}
