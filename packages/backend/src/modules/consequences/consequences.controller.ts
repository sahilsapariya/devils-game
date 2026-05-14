import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedPrincipal } from '../auth/jwt.strategy';
import { ConsequencesService } from './consequences.service';
import type { ConsequenceEntity } from '../../database/entities/consequence.entity';

class ListConsequencesQuery {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}

const serialize = (c: ConsequenceEntity): Record<string, unknown> => ({
  id: c.id,
  userId: c.userId,
  roundId: c.roundId,
  consequenceType: c.consequenceType,
  severity: c.severity,
  description: c.description,
  reputationDelta: c.reputationDelta,
  metadata: c.metadata,
  acknowledgedAt: c.acknowledgedAt ? c.acknowledgedAt.toISOString() : null,
  issuedAt: c.issuedAt.toISOString(),
  createdAt: c.createdAt.toISOString(),
});

@Controller('consequences')
@UseGuards(JwtAuthGuard)
export class ConsequencesController {
  constructor(private readonly consequences: ConsequencesService) {}

  @Get()
  async list(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Query() query: ListConsequencesQuery,
  ): Promise<{
    items: ReadonlyArray<unknown>;
    total: number;
    limit: number;
    offset: number;
  }> {
    const limit = query.limit ?? 50;
    const offset = query.offset ?? 0;
    const { items, total } = await this.consequences.getConsequencesForUser(
      principal.userId,
      limit,
      offset,
    );
    return {
      items: items.map(serialize),
      total,
      limit,
      offset,
    };
  }

  @Patch(':id/acknowledge')
  @HttpCode(HttpStatus.OK)
  async acknowledge(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<unknown> {
    const consequence = await this.consequences.acknowledgeConsequence(
      id,
      principal.userId,
    );
    return serialize(consequence);
  }
}
