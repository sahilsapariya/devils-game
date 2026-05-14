import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy, type StrategyOptions } from 'passport-jwt';
import type { JwtPayload } from '@extraction/shared';

import type { JwtConfig } from '../../config/jwt.config';
import { UsersService } from '../users/users.service';

export interface AuthenticatedPrincipal {
  userId: string;
  email: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    configService: ConfigService,
    private readonly usersService: UsersService,
  ) {
    const cfg = configService.getOrThrow<JwtConfig>('jwt');
    const options: StrategyOptions = {
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: cfg.secret,
    };
    super(options);
  }

  async validate(payload: JwtPayload): Promise<AuthenticatedPrincipal> {
    const user = await this.usersService.findById(payload.sub);
    if (!user || !user.isActive) {
      throw new UnauthorizedException('User no longer active');
    }
    return { userId: user.id, email: user.email };
  }
}
