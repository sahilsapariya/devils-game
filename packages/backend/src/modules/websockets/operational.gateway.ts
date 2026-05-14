import { Logger, UsePipes, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import {
  BEHAVIORAL_EVENTS,
  SOCKET_CLIENT_EVENTS,
  SOCKET_NAMESPACES,
} from '@extraction/shared';

import { EventsService } from '../events/events.service';
import { RoundsService } from '../rounds/rounds.service';
import { TelemetryService } from '../telemetry/telemetry.service';
import { TelemetryBatchDto } from '../telemetry/dto/telemetry-batch.dto';
import { authenticateSocket, type SocketPrincipal } from './socket-auth.helper';

type AuthenticatedSocket = Socket & {
  data: {
    principal?: SocketPrincipal;
  };
};

@WebSocketGateway({
  namespace: SOCKET_NAMESPACES.OPERATIONAL,
  cors: { origin: true, credentials: true },
})
@UsePipes(
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }),
)
export class OperationalGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(OperationalGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly telemetry: TelemetryService,
    private readonly rounds: RoundsService,
    private readonly events: EventsService,
  ) {}

  afterInit(): void {
    this.logger.log(
      `Operational gateway initialized on namespace ${SOCKET_NAMESPACES.OPERATIONAL}`,
    );
  }

  async handleConnection(socket: AuthenticatedSocket): Promise<void> {
    const principal = await authenticateSocket(socket, this.jwt, this.config);
    if (!principal) {
      this.logger.debug(`Rejecting unauthenticated socket ${socket.id}`);
      socket.disconnect(true);
      return;
    }
    socket.data.principal = principal;
    void socket.join(`user:${principal.userId}`);

    // If user has an active round, join its room too.
    const current = await this.rounds.getCurrentRound(principal.userId);
    if (current) {
      void socket.join(`round:${current.id}`);
    }

    this.logger.debug(
      `Socket ${socket.id} connected for user ${principal.userId}`,
    );
  }

  handleDisconnect(socket: AuthenticatedSocket): void {
    const principal = socket.data.principal;
    if (principal) {
      this.logger.debug(
        `Socket ${socket.id} disconnected (user ${principal.userId})`,
      );
    }
  }

  @SubscribeMessage(SOCKET_CLIENT_EVENTS.TELEMETRY_BATCH)
  async onTelemetryBatch(
    @ConnectedSocket() socket: AuthenticatedSocket,
    @MessageBody() body: TelemetryBatchDto,
  ): Promise<{ ok: boolean; result?: unknown; error?: string }> {
    const principal = socket.data.principal;
    if (!principal) {
      return { ok: false, error: 'unauthenticated' };
    }
    try {
      const result = await this.telemetry.ingestBatch(principal.userId, body);
      return { ok: true, result };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'ingest failed',
      };
    }
  }

  @SubscribeMessage(SOCKET_CLIENT_EVENTS.ROUND_STATUS)
  async onRoundStatus(
    @ConnectedSocket() socket: AuthenticatedSocket,
  ): Promise<{ ok: boolean; round: unknown | null; error?: string }> {
    const principal = socket.data.principal;
    if (!principal) {
      return { ok: false, round: null, error: 'unauthenticated' };
    }
    const round = await this.rounds.getCurrentRound(principal.userId);
    return {
      ok: true,
      round: round
        ? {
            id: round.id,
            status: round.status,
            operationalState: round.operationalState,
            stats: round.stats,
          }
        : null,
    };
  }

  @SubscribeMessage(SOCKET_CLIENT_EVENTS.USER_CHECK_IN)
  async onUserCheckIn(
    @ConnectedSocket() socket: AuthenticatedSocket,
    @MessageBody() body: { roundId?: string; note?: string } | undefined,
  ): Promise<{ ok: boolean }> {
    const principal = socket.data.principal;
    if (!principal) {
      return { ok: false };
    }
    await this.events.emit({
      userId: principal.userId,
      roundId: body?.roundId ?? null,
      eventType: BEHAVIORAL_EVENTS.RECOVERY_ACTION,
      eventData: { source: 'socket', note: body?.note ?? null },
      occurredAt: new Date(),
    });
    return { ok: true };
  }
}
