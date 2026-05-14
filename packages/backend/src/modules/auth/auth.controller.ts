import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import type { AuthTokens } from '@extraction/shared';

import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { UserEntity } from '../../database/entities/user.entity';
import { serializeUser, type PublicUser } from '../users/user.serializer';

interface AuthResponse {
  user: PublicUser;
  tokens: AuthTokens;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async register(@Body() dto: RegisterDto): Promise<AuthResponse> {
    const { user, tokens } = await this.authService.register(dto);
    return { user: serializeUser(user as UserEntity), tokens };
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto): Promise<AuthResponse> {
    const { user, tokens } = await this.authService.login(dto);
    return { user: serializeUser(user as UserEntity), tokens };
  }
}
