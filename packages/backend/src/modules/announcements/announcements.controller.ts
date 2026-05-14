import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedPrincipal } from '../auth/jwt.strategy';
import type { AnnouncementEntity } from '../../database/entities/announcement.entity';
import { AnnouncementsService } from './announcements.service';

class ListAnnouncementsQuery {
  @IsOptional()
  @IsIn(['pending', 'delivered'])
  status?: 'pending' | 'delivered';

  @IsOptional()
  @IsUUID('4')
  roundId?: string;

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

const serialize = (ann: AnnouncementEntity): Record<string, unknown> => ({
  id: ann.id,
  userId: ann.userId,
  roundId: ann.roundId,
  category: ann.category,
  tone: ann.tone,
  content: ann.content,
  voiceUrl: ann.voiceUrl,
  audioDurationSeconds: ann.audioDurationSeconds === null ? null : Number(ann.audioDurationSeconds),
  aiGenerated: ann.aiGenerated,
  qualityGatePassed: ann.qualityGatePassed,
  metadata: ann.metadata,
  scheduledFor: ann.scheduledFor.toISOString(),
  deliveredAt: ann.deliveredAt ? ann.deliveredAt.toISOString() : null,
  acknowledgedAt: ann.acknowledgedAt ? ann.acknowledgedAt.toISOString() : null,
  createdAt: ann.createdAt.toISOString(),
});

@Controller('announcements')
@UseGuards(JwtAuthGuard)
export class AnnouncementsController {
  constructor(private readonly announcements: AnnouncementsService) {}

  @Get()
  async list(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Query() query: ListAnnouncementsQuery,
  ): Promise<{
    items: ReadonlyArray<unknown>;
    total: number;
    limit: number;
    offset: number;
  }> {
    const limit = query.limit ?? 50;
    const offset = query.offset ?? 0;
    const { items, total } = await this.announcements.listForUser(
      principal.userId,
      { status: query.status, roundId: query.roundId },
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
    const ann = await this.announcements.markAcknowledged(id, principal.userId);
    return serialize(ann);
  }

  @Post(':id/played')
  @HttpCode(HttpStatus.OK)
  async played(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<unknown> {
    const ann = await this.announcements.markPlayed(id);
    return serialize(ann);
  }
}
