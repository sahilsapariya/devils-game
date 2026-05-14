import {
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { AuthTokens } from '@extraction/shared';

import { UserEntity } from '../../database/entities/user.entity';
import type { JwtConfig } from '../../config/jwt.config';
import type { RegisterDto } from './dto/register.dto';
import type { LoginDto } from './dto/login.dto';

interface JwtSignPayload {
  sub: string;
  email: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly jwtConfig: JwtConfig;

  constructor(
    @InjectRepository(UserEntity)
    private readonly users: Repository<UserEntity>,
    private readonly jwtService: JwtService,
    configService: ConfigService,
  ) {
    this.jwtConfig = configService.getOrThrow<JwtConfig>('jwt');
  }

  async register(dto: RegisterDto): Promise<{ user: UserEntity; tokens: AuthTokens }> {
    const normalizedEmail = dto.email.toLowerCase().trim();
    const existing = await this.users.findOne({
      where: { email: normalizedEmail },
      select: ['id'],
    });
    if (existing) {
      throw new ConflictException('An account with that email already exists');
    }

    const passwordHash = await bcrypt.hash(dto.password, this.jwtConfig.bcryptRounds);

    const user = this.users.create({
      email: normalizedEmail,
      passwordHash,
      displayName: dto.displayName ?? null,
      reputationScore: 0,
      currentStreak: 0,
      longestStreak: 0,
      difficultyCeiling: 3,
      preferences: {},
      isActive: true,
    });

    const saved = await this.users.save(user);
    const tokens = await this.issueTokens({ sub: saved.id, email: saved.email });
    return { user: saved, tokens };
  }

  async login(dto: LoginDto): Promise<{ user: UserEntity; tokens: AuthTokens }> {
    const normalizedEmail = dto.email.toLowerCase().trim();
    const user = await this.users.findOne({
      where: { email: normalizedEmail },
    });

    // Always perform a bcrypt compare to keep timing constant for missing users.
    // Pre-computed valid bcrypt(12) hash of an unreachable random value.
    const dummyHash =
      '$2b$12$CnAtjLkb6Ux6X3W4kFkXwOhYpdR2xNk0fLp1eYwm4iZcNkR1c9XKa';
    const isValid = await bcrypt.compare(
      dto.password,
      user?.passwordHash ?? dummyHash,
    );

    if (!user || !isValid) {
      throw new UnauthorizedException('Invalid email or password');
    }
    if (!user.isActive) {
      throw new UnauthorizedException('Account is inactive');
    }

    user.lastLoginAt = new Date();
    await this.users.save(user);

    const tokens = await this.issueTokens({ sub: user.id, email: user.email });
    return { user, tokens };
  }

  async validateUser(userId: string): Promise<UserEntity | null> {
    return this.users.findOne({ where: { id: userId } });
  }

  private async issueTokens(payload: JwtSignPayload): Promise<AuthTokens> {
    const accessToken = await this.jwtService.signAsync(payload, {
      secret: this.jwtConfig.secret,
      expiresIn: this.jwtConfig.accessExpiresIn,
    });
    const refreshToken = await this.jwtService.signAsync(payload, {
      secret: this.jwtConfig.refreshSecret,
      expiresIn: this.jwtConfig.refreshExpiresIn,
    });
    const decoded = this.jwtService.decode(accessToken) as { exp?: number; iat?: number };
    const expiresIn =
      decoded && typeof decoded.exp === 'number' && typeof decoded.iat === 'number'
        ? decoded.exp - decoded.iat
        : 0;
    return { accessToken, refreshToken, expiresIn };
  }
}
