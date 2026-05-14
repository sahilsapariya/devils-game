import {
  Body,
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

import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedPrincipal } from '../auth/jwt.strategy';
import { CreateMissionDto } from './dto/create-mission.dto';
import { ListMissionsDto } from './dto/list-missions.dto';
import { UpdateMissionDto } from './dto/update-mission.dto';
import { MissionsService } from './missions.service';
import { serializeMission, type MissionView } from './mission.serializer';

interface ListResponse {
  items: MissionView[];
  total: number;
  limit: number;
  offset: number;
}

@Controller('missions')
@UseGuards(JwtAuthGuard)
export class MissionsController {
  constructor(private readonly missionsService: MissionsService) {}

  @Get()
  async list(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Query() query: ListMissionsDto,
  ): Promise<ListResponse> {
    const { items, total } = await this.missionsService.list(
      principal.userId,
      query,
    );
    return {
      items: items.map(serializeMission),
      total,
      limit: query.limit ?? 50,
      offset: query.offset ?? 0,
    };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Body() dto: CreateMissionDto,
  ): Promise<MissionView> {
    const mission = await this.missionsService.create(principal.userId, dto);
    return serializeMission(mission);
  }

  @Get(':id')
  async getOne(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<MissionView> {
    const mission = await this.missionsService.findByIdForUser(
      id,
      principal.userId,
    );
    return serializeMission(mission);
  }

  @Patch(':id')
  async update(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateMissionDto,
  ): Promise<MissionView> {
    const mission = await this.missionsService.update(
      id,
      principal.userId,
      dto,
    );
    return serializeMission(mission);
  }
}
