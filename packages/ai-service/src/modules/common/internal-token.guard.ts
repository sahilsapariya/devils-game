import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';

/**
 * Simple shared-secret guard for internal endpoints.
 * Backend must send X-Internal-Token matching INTERNAL_API_TOKEN env var.
 *
 * If INTERNAL_API_TOKEN is unset, the guard logs a warning and allows traffic
 * (dev-mode fallback). In production it MUST be set.
 */
@Injectable()
export class InternalTokenGuard implements CanActivate {
  private readonly logger = new Logger(InternalTokenGuard.name);
  private warned = false;

  constructor(private readonly config: ConfigService) {}

  canActivate(ctx: ExecutionContext): boolean {
    const expected = this.config.get<string>('INTERNAL_API_TOKEN');
    if (!expected) {
      if (!this.warned) {
        this.logger.warn(
          'INTERNAL_API_TOKEN is not set — internal endpoints are unauthenticated (dev mode).',
        );
        this.warned = true;
      }
      return true;
    }
    const req = ctx.switchToHttp().getRequest<Request>();
    const provided = (req.headers['x-internal-token'] ?? req.headers['X-Internal-Token']) as
      | string
      | undefined;
    if (provided !== expected) {
      throw new UnauthorizedException('Invalid or missing X-Internal-Token');
    }
    return true;
  }
}
