import { IsEmail, IsString, Length, MaxLength } from 'class-validator';

export class LoginDto {
  @IsEmail({}, { message: 'A valid email address is required' })
  @MaxLength(255)
  email!: string;

  @IsString()
  @Length(1, 128)
  password!: string;
}
