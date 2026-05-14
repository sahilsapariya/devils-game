import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { MissionEntity } from '../../database/entities/mission.entity';
import type { CreateMissionDto } from './dto/create-mission.dto';
import type { ListMissionsDto } from './dto/list-missions.dto';
import type { UpdateMissionDto } from './dto/update-mission.dto';
import { normalizeObjectives } from './mission.serializer';

const DEFAULT_LIMIT = 50;

@Injectable()
export class MissionsService {
  constructor(
    @InjectRepository(MissionEntity)
    private readonly missions: Repository<MissionEntity>,
  ) {}

  async create(userId: string, dto: CreateMissionDto): Promise<MissionEntity> {
    this.assertScheduleOrder(dto.scheduledStart, dto.scheduledEnd);

    const mission = this.missions.create({
      userId,
      title: dto.title,
      description: dto.description ?? '',
      objectives: dto.objectives ? normalizeObjectives(dto.objectives) : [],
      status: 'draft',
      priority: dto.priority ?? 0,
      scheduledStart: dto.scheduledStart ? new Date(dto.scheduledStart) : null,
      scheduledEnd: dto.scheduledEnd ? new Date(dto.scheduledEnd) : null,
      totalRounds: 0,
      completedRounds: 0,
    });
    return this.missions.save(mission);
  }

  async list(
    userId: string,
    dto: ListMissionsDto,
  ): Promise<{ items: MissionEntity[]; total: number }> {
    const limit = dto.limit ?? DEFAULT_LIMIT;
    const offset = dto.offset ?? 0;

    const qb = this.missions
      .createQueryBuilder('mission')
      .where('mission.user_id = :userId', { userId })
      .orderBy('mission.priority', 'DESC')
      .addOrderBy('mission.created_at', 'DESC')
      .take(limit)
      .skip(offset);

    if (dto.status) {
      qb.andWhere('mission.status = :status', { status: dto.status });
    }

    const [items, total] = await qb.getManyAndCount();
    return { items, total };
  }

  async findByIdForUser(id: string, userId: string): Promise<MissionEntity> {
    const mission = await this.missions.findOne({ where: { id } });
    if (!mission) {
      throw new NotFoundException('Mission not found');
    }
    if (mission.userId !== userId) {
      // Treat ownership violations as 404 to avoid leaking existence.
      throw new NotFoundException('Mission not found');
    }
    return mission;
  }

  async update(
    id: string,
    userId: string,
    dto: UpdateMissionDto,
  ): Promise<MissionEntity> {
    const mission = await this.findByIdForUser(id, userId);

    if (mission.status === 'archived') {
      throw new ForbiddenException('Archived missions cannot be modified');
    }

    const nextStart = dto.scheduledStart
      ? new Date(dto.scheduledStart)
      : mission.scheduledStart;
    const nextEnd = dto.scheduledEnd
      ? new Date(dto.scheduledEnd)
      : mission.scheduledEnd;
    this.assertScheduleOrder(
      nextStart ? nextStart.toISOString() : undefined,
      nextEnd ? nextEnd.toISOString() : undefined,
    );

    if (dto.title !== undefined) mission.title = dto.title;
    if (dto.description !== undefined) mission.description = dto.description;
    if (dto.objectives !== undefined) {
      mission.objectives = normalizeObjectives(dto.objectives);
    }
    if (dto.status !== undefined) mission.status = dto.status;
    if (dto.priority !== undefined) mission.priority = dto.priority;
    if (dto.scheduledStart !== undefined) {
      mission.scheduledStart = new Date(dto.scheduledStart);
    }
    if (dto.scheduledEnd !== undefined) {
      mission.scheduledEnd = new Date(dto.scheduledEnd);
    }

    return this.missions.save(mission);
  }

  private assertScheduleOrder(start?: string, end?: string): void {
    if (start && end) {
      const startMs = Date.parse(start);
      const endMs = Date.parse(end);
      if (
        Number.isFinite(startMs) &&
        Number.isFinite(endMs) &&
        endMs <= startMs
      ) {
        throw new BadRequestException(
          'scheduledEnd must be after scheduledStart',
        );
      }
    }
  }
}
