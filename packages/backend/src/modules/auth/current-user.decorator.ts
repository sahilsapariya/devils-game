import {
  createParamDecorator,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import type { AuthenticatedPrincipal } from './jwt.strategy';

/**
 * Extracts the authenticated principal injected by JwtStrategy.validate().
 * Throws if used on an unguarded route (defensive — never trust @Req()).
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedPrincipal => {
    const request = ctx.switchToHttp().getRequest<
      Request & { user?: AuthenticatedPrincipal }
    >();
    const user = request.user;
    if (!user || typeof user.userId !== 'string') {
      throw new UnauthorizedException('Missing authenticated principal');
    }
    return user;
  },
);
