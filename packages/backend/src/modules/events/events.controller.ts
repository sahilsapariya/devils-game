import {
  Controller,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedPrincipal } from '../auth/jwt.strategy';
import { EventsService } from './events.service';

class ListEventsQuery {
  @IsOptional()
  @IsUUID('4')
  roundId?: string;

  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}

@Controller('events')
@UseGuards(JwtAuthGuard)
export class EventsController {
  constructor(private readonly events: EventsService) {}

  @Get()
  async list(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Query() query: ListEventsQuery,
  ): Promise<{
    items: ReadonlyArray<unknown>;
    total: number;
    limit: number;
    offset: number;
  }> {
    const limit = query.limit ?? 100;
    const offset = query.offset ?? 0;

    const { items, total } = query.roundId
      ? await this.events.getEventsForRound(query.roundId, {
          type: query.type,
          limit,
          offset,
        })
      : await this.events.getEventsForUser(principal.userId, {
          type: query.type,
          limit,
          offset,
        });

    // Enforce ownership: when filtering by roundId, drop rows whose userId
    // doesn't match the principal (defensive — caller could pass any roundId).
    const filtered = items.filter((e) => e.userId === principal.userId);

    return {
      items: filtered.map((event) => ({
        id: event.id,
        userId: event.userId,
        roundId: event.roundId,
        eventType: event.eventType,
        eventData: event.eventData,
        occurredAt: event.occurredAt.toISOString(),
        receivedAt: event.receivedAt.toISOString(),
        isProcessed: event.isProcessed,
        processedAt: event.processedAt ? event.processedAt.toISOString() : null,
      })),
      total: query.roundId ? filtered.length : total,
      limit,
      offset,
    };
  }
}
