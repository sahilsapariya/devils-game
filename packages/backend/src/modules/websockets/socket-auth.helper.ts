import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Socket } from 'socket.io';
import type { JwtPayload } from '@extraction/shared';

import type { JwtConfig } from '../../config/jwt.config';

const logger = new Logger('SocketAuth');

export interface SocketPrincipal {
  userId: string;
  email: string;
}

/**
 * Extracts a JWT from the socket handshake. Supports both:
 *  - handshake.auth.token (preferred — set explicitly by clients)
 *  - handshake.query.token (legacy)
 * Returns null if missing or malformed.
 */
export const extractTokenFromHandshake = (socket: Socket): string | null => {
  const auth = socket.handshake.auth as Record<string, unknown> | undefined;
  const authToken = auth?.token;
  if (typeof authToken === 'string' && authToken.length > 0) {
    return authToken;
  }
  const queryToken = socket.handshake.query?.token;
  if (typeof queryToken === 'string' && queryToken.length > 0) {
    return queryToken;
  }
  return null;
};

export const authenticateSocket = async (
  socket: Socket,
  jwtService: JwtService,
  configService: ConfigService,
): Promise<SocketPrincipal | null> => {
  const token = extractTokenFromHandshake(socket);
  if (!token) {
    return null;
  }
  try {
    const cfg = configService.getOrThrow<JwtConfig>('jwt');
    const payload = await jwtService.verifyAsync<JwtPayload>(token, {
      secret: cfg.secret,
    });
    if (!payload?.sub || !payload?.email) {
      return null;
    }
    return { userId: payload.sub, email: payload.email };
  } catch (error) {
    logger.debug(
      `Socket auth failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    return null;
  }
};
