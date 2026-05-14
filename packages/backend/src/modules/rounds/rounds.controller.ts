import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedPrincipal } from '../auth/jwt.strategy';
import { CreateRoundDto } from './dto/create-round.dto';
import { ListRoundsDto } from './dto/list-rounds.dto';
import { UpdateRoundDto } from './dto/update-round.dto';
import { RoundsService } from './rounds.service';
import { serializeRound, type RoundView } from './round.serializer';

interface ListResponse {
  items: RoundView[];
  total: number;
  limit: number;
  offset: number;
}

interface AbandonRoundDto {
  reason?: string;
}

@Controller('rounds')
@UseGuards(JwtAuthGuard)
export class RoundsController {
  constructor(private readonly rounds: RoundsService) {}

  @Get('current')
  async current(
    @CurrentUser() principal: AuthenticatedPrincipal,
  ): Promise<RoundView | null> {
    const round = await this.rounds.getCurrentRound(principal.userId);
    return round ? serializeRound(round) : null;
  }

  @Get()
  async list(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Query() query: ListRoundsDto,
  ): Promise<ListResponse> {
    const { items, total } = await this.rounds.listRounds(
      principal.userId,
      query,
    );
    return {
      items: items.map(serializeRound),
      total,
      limit: query.limit ?? 50,
      offset: query.offset ?? 0,
    };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Body() dto: CreateRoundDto,
  ): Promise<RoundView> {
    const round = await this.rounds.createRound(principal.userId, dto);
    return serializeRound(round);
  }

  @Get(':id')
  async getOne(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<RoundView> {
    const round = await this.rounds.findByIdForUser(id, principal.userId);
    return serializeRound(round);
  }

  @Patch(':id')
  async update(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateRoundDto,
  ): Promise<RoundView> {
    const round = await this.rounds.update(id, principal.userId, dto);
    return serializeRound(round);
  }

  @Post(':id/start')
  @HttpCode(HttpStatus.OK)
  async start(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<RoundView> {
    const round = await this.rounds.startRound(id, principal.userId);
    return serializeRound(round);
  }

  @Post(':id/complete')
  @HttpCode(HttpStatus.OK)
  async complete(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<RoundView> {
    const round = await this.rounds.completeRound(id, principal.userId);
    return serializeRound(round);
  }

  @Post(':id/abandon')
  @HttpCode(HttpStatus.OK)
  async abandon(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() body: AbandonRoundDto,
  ): Promise<RoundView> {
    const round = await this.rounds.abandonRound(id, principal.userId, body.reason);
    return serializeRound(round);
  }

  @Get(':id/behavioral-record')
  async behavioralRecord(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<unknown> {
    const record = await this.rounds.getBehavioralRecord(id, principal.userId);
    if (!record) {
      throw new NotFoundException('No behavioral record for this round');
    }
    return {
      id: record.id,
      userId: record.userId,
      roundId: record.roundId,
      periodStart: record.periodStart.toISOString(),
      periodEnd: record.periodEnd.toISOString(),
      totalFocusMinutes: record.totalFocusMinutes,
      totalIdleMinutes: record.totalIdleMinutes,
      appSwitches: record.appSwitches,
      productiveAppsActive: record.productiveAppsActive,
      distractionsDetected: record.distractionsDetected,
      gitCommits: record.gitCommits,
      ideActivityMinutes: record.ideActivityMinutes,
      terminalCommands: record.terminalCommands,
      productivityScore: Number(record.productivityScore),
      anomalyFlags: record.anomalyFlags,
      eventCount: record.eventCount,
      createdAt: record.createdAt.toISOString(),
    };
  }
}
