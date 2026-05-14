import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  DEFAULT_DIFFICULTY,
  OPERATIONAL_EVENTS,
  type OperationalState,
  type RoundStats,
} from '@extraction/shared';

import { BehavioralRecordEntity } from '../../database/entities/behavioral-record.entity';
import { MissionEntity } from '../../database/entities/mission.entity';
import { RoundEntity } from '../../database/entities/round.entity';
import { EventsService } from '../events/events.service';
import type { CreateRoundDto } from './dto/create-round.dto';
import type { ListRoundsDto } from './dto/list-rounds.dto';
import type { UpdateRoundDto } from './dto/update-round.dto';
import { normalizeDifficulty, normalizeStats } from './round.serializer';
import { RoundStateMachineService, type StateTrigger } from './round-state-machine.service';

const DEFAULT_LIMIT = 50;

@Injectable()
export class RoundsService {
  private readonly logger = new Logger(RoundsService.name);

  constructor(
    @InjectRepository(RoundEntity)
    private readonly rounds: Repository<RoundEntity>,
    @InjectRepository(MissionEntity)
    private readonly missions: Repository<MissionEntity>,
    @InjectRepository(BehavioralRecordEntity)
    private readonly behavioralRecords: Repository<BehavioralRecordEntity>,
    private readonly events: EventsService,
    private readonly stateMachine: RoundStateMachineService,
  ) {}

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  async findByIdForUser(id: string, userId: string): Promise<RoundEntity> {
    const round = await this.rounds.findOne({ where: { id } });
    if (!round || round.userId !== userId) {
      throw new NotFoundException('Round not found');
    }
    return round;
  }

  async getCurrentRound(userId: string): Promise<RoundEntity | null> {
    return this.rounds
      .createQueryBuilder('round')
      .where('round.user_id = :userId', { userId })
      .andWhere('round.status IN (:...statuses)', {
        statuses: ['active', 'paused', 'scheduled'],
      })
      .orderBy(
        `CASE round.status WHEN 'active' THEN 0 WHEN 'paused' THEN 1 ELSE 2 END`,
        'ASC',
      )
      .addOrderBy('round.scheduled_start', 'ASC')
      .getOne();
  }

  async listRounds(
    userId: string,
    dto: ListRoundsDto,
  ): Promise<{ items: RoundEntity[]; total: number }> {
    const limit = dto.limit ?? DEFAULT_LIMIT;
    const offset = dto.offset ?? 0;

    const qb = this.rounds
      .createQueryBuilder('round')
      .where('round.user_id = :userId', { userId })
      .orderBy('round.scheduled_start', 'DESC')
      .take(limit)
      .skip(offset);

    if (dto.status) {
      qb.andWhere('round.status = :status', { status: dto.status });
    }
    if (dto.missionId) {
      qb.andWhere('round.mission_id = :missionId', { missionId: dto.missionId });
    }

    const [items, total] = await qb.getManyAndCount();
    return { items, total };
  }

  async getBehavioralRecord(
    roundId: string,
    userId: string,
  ): Promise<BehavioralRecordEntity | null> {
    await this.findByIdForUser(roundId, userId);
    return this.behavioralRecords.findOne({
      where: { roundId, userId },
      order: { createdAt: 'DESC' },
    });
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  async createRound(userId: string, dto: CreateRoundDto): Promise<RoundEntity> {
    const start = new Date(dto.scheduledStart);
    const end = new Date(dto.scheduledEnd);
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) {
      throw new BadRequestException('Invalid scheduledStart or scheduledEnd');
    }
    if (end.getTime() <= start.getTime()) {
      throw new BadRequestException('scheduledEnd must be after scheduledStart');
    }

    const mission = await this.missions.findOne({ where: { id: dto.missionId } });
    if (!mission || mission.userId !== userId) {
      throw new NotFoundException('Mission not found');
    }
    if (mission.status === 'archived' || mission.status === 'completed') {
      throw new BadRequestException(
        'Cannot schedule rounds against an archived or completed mission',
      );
    }

    const difficulty = normalizeDifficulty(dto.difficulty ?? DEFAULT_DIFFICULTY);

    const round = this.rounds.create({
      userId,
      missionId: dto.missionId,
      status: 'scheduled',
      operationalState: 'MONITORING',
      difficulty,
      scheduledStart: start,
      scheduledEnd: end,
      actualStart: null,
      actualEnd: null,
      durationMinutes: dto.durationMinutes,
      stats: this.emptyStats(),
      pointsEarned: 0,
      failureReason: null,
    });

    const saved = await this.rounds.save(round);

    // Initial state is MONITORING — emit a state.transition (DORMANT → MONITORING)
    // and round.scheduled.
    await this.events.emit({
      userId,
      roundId: saved.id,
      eventType: OPERATIONAL_EVENTS.STATE_TRANSITION,
      eventData: {
        from: 'DORMANT',
        to: 'MONITORING',
        trigger: 'round.scheduled',
      },
      occurredAt: new Date(),
    });
    await this.events.emit({
      userId,
      roundId: saved.id,
      eventType: OPERATIONAL_EVENTS.ROUND_SCHEDULED,
      eventData: {
        scheduledStart: saved.scheduledStart.toISOString(),
        scheduledEnd: saved.scheduledEnd.toISOString(),
        durationMinutes: saved.durationMinutes,
      },
      occurredAt: new Date(),
    });

    // Increment mission counter.
    mission.totalRounds += 1;
    await this.missions.save(mission);

    return saved;
  }

  async startRound(roundId: string, userId: string): Promise<RoundEntity> {
    const round = await this.findByIdForUser(roundId, userId);

    if (round.status === 'active') {
      return round;
    }
    if (
      round.status !== 'scheduled' &&
      round.status !== 'paused'
    ) {
      throw new BadRequestException(
        `Round cannot be started from status "${round.status}"`,
      );
    }

    const transition = await this.stateMachine.transitionState(
      roundId,
      'round.started',
    );

    round.status = 'active';
    round.operationalState = transition.to;
    if (!round.actualStart) {
      round.actualStart = new Date();
    }
    const saved = await this.rounds.save(round);

    await this.emitStateTransition(transition.userId, roundId, transition.from, transition.to, 'round.started');
    await this.events.emit({
      userId,
      roundId,
      eventType: OPERATIONAL_EVENTS.ROUND_STARTED,
      eventData: { actualStart: saved.actualStart?.toISOString() },
      occurredAt: new Date(),
    });

    return saved;
  }

  async pauseRound(roundId: string, userId: string): Promise<RoundEntity> {
    const round = await this.findByIdForUser(roundId, userId);
    if (round.status !== 'active') {
      throw new BadRequestException('Only active rounds can be paused');
    }
    round.status = 'paused';
    const saved = await this.rounds.save(round);

    await this.events.emit({
      userId,
      roundId,
      eventType: OPERATIONAL_EVENTS.ROUND_PAUSED,
      eventData: {},
      occurredAt: new Date(),
    });
    return saved;
  }

  async resumeRound(roundId: string, userId: string): Promise<RoundEntity> {
    const round = await this.findByIdForUser(roundId, userId);
    if (round.status !== 'paused') {
      throw new BadRequestException('Only paused rounds can be resumed');
    }

    // If currently CRITICAL, trigger resume; else accept current state.
    let transitionedTo: OperationalState = round.operationalState;
    if (round.operationalState === 'CRITICAL') {
      const t = await this.stateMachine.transitionState(roundId, 'round.resumed');
      transitionedTo = t.to;
      await this.emitStateTransition(userId, roundId, t.from, t.to, 'round.resumed');
    }

    round.status = 'active';
    round.operationalState = transitionedTo;
    const saved = await this.rounds.save(round);

    await this.events.emit({
      userId,
      roundId,
      eventType: OPERATIONAL_EVENTS.ROUND_RESUMED,
      eventData: {},
      occurredAt: new Date(),
    });
    return saved;
  }

  async completeRound(roundId: string, userId: string): Promise<RoundEntity> {
    const round = await this.findByIdForUser(roundId, userId);
    if (round.status === 'completed' || round.status === 'failed' || round.status === 'abandoned') {
      throw new BadRequestException(`Round already finalized as "${round.status}"`);
    }

    const transition = await this.stateMachine.transitionState(
      roundId,
      'round.completed',
    );

    round.status = 'completed';
    round.operationalState = transition.to;
    round.actualEnd = new Date();
    const saved = await this.rounds.save(round);

    // Bump mission completed counter.
    const mission = await this.missions.findOne({ where: { id: round.missionId } });
    if (mission) {
      mission.completedRounds += 1;
      await this.missions.save(mission);
    }

    await this.emitStateTransition(userId, roundId, transition.from, transition.to, 'round.completed');
    await this.events.emit({
      userId,
      roundId,
      eventType: OPERATIONAL_EVENTS.ROUND_COMPLETED,
      eventData: {
        actualEnd: saved.actualEnd?.toISOString(),
        pointsEarned: saved.pointsEarned,
      },
      occurredAt: new Date(),
    });
    return saved;
  }

  async abandonRound(
    roundId: string,
    userId: string,
    reason?: string,
  ): Promise<RoundEntity> {
    const round = await this.findByIdForUser(roundId, userId);
    if (
      round.status === 'completed' ||
      round.status === 'failed' ||
      round.status === 'abandoned'
    ) {
      throw new BadRequestException(`Round already finalized as "${round.status}"`);
    }

    const transition = await this.stateMachine.transitionState(
      roundId,
      'round.abandoned',
    );

    round.status = 'abandoned';
    round.operationalState = transition.to;
    round.actualEnd = new Date();
    round.failureReason = reason ?? 'abandoned';
    const saved = await this.rounds.save(round);

    await this.emitStateTransition(userId, roundId, transition.from, transition.to, 'round.abandoned');
    await this.events.emit({
      userId,
      roundId,
      eventType: OPERATIONAL_EVENTS.ROUND_ABANDONED,
      eventData: { reason: saved.failureReason },
      occurredAt: new Date(),
    });
    return saved;
  }

  async failRound(
    roundId: string,
    userId: string,
    reason: string,
  ): Promise<RoundEntity> {
    const round = await this.findByIdForUser(roundId, userId);
    if (
      round.status === 'completed' ||
      round.status === 'failed' ||
      round.status === 'abandoned'
    ) {
      throw new BadRequestException(`Round already finalized as "${round.status}"`);
    }
    const transition = await this.stateMachine.transitionState(roundId, 'round.failed');

    round.status = 'failed';
    round.operationalState = transition.to;
    round.actualEnd = new Date();
    round.failureReason = reason;
    const saved = await this.rounds.save(round);

    await this.emitStateTransition(userId, roundId, transition.from, transition.to, 'round.failed');
    await this.events.emit({
      userId,
      roundId,
      eventType: OPERATIONAL_EVENTS.ROUND_FAILED,
      eventData: { reason },
      occurredAt: new Date(),
    });
    return saved;
  }

  // ---------------------------------------------------------------------------
  // Patch operations
  // ---------------------------------------------------------------------------

  async update(
    roundId: string,
    userId: string,
    dto: UpdateRoundDto,
  ): Promise<RoundEntity> {
    const round = await this.findByIdForUser(roundId, userId);
    if (dto.failureReason !== undefined) {
      round.failureReason = dto.failureReason;
    }
    // Status changes via PATCH are intentionally narrow — lifecycle should
    // route through dedicated endpoints (start/pause/complete/abandon).
    if (dto.status !== undefined && dto.status !== round.status) {
      throw new BadRequestException(
        'Status changes must use the dedicated lifecycle endpoints',
      );
    }
    return this.rounds.save(round);
  }

  /**
   * Merges a partial stats object into the round's JSONB stats column.
   * Used by the event processor / scoring worker — NOT exposed via HTTP.
   */
  async updateOperationalState(
    roundId: string,
    patch: {
      stats?: Partial<RoundStats>;
      pointsEarned?: number;
      operationalState?: OperationalState;
    },
  ): Promise<RoundEntity> {
    const round = await this.rounds.findOne({ where: { id: roundId } });
    if (!round) {
      throw new NotFoundException('Round not found');
    }
    if (patch.stats) {
      round.stats = normalizeStats({ ...round.stats, ...patch.stats });
    }
    if (patch.pointsEarned !== undefined) {
      round.pointsEarned = patch.pointsEarned;
    }
    if (patch.operationalState !== undefined) {
      round.operationalState = patch.operationalState;
    }
    return this.rounds.save(round);
  }

  /**
   * Called by the event processor when the violations threshold has been
   * crossed — transitions OPERATIONAL → CRITICAL.
   */
  async escalateToCritical(roundId: string, trigger: StateTrigger): Promise<void> {
    const round = await this.rounds.findOne({ where: { id: roundId } });
    if (!round) {
      return;
    }
    if (round.operationalState !== 'OPERATIONAL') {
      return;
    }
    const transition = await this.stateMachine.transitionState(roundId, trigger);
    await this.emitStateTransition(
      round.userId,
      roundId,
      transition.from,
      transition.to,
      trigger,
    );
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  private emptyStats(): RoundStats {
    return {
      totalFocusMinutes: 0,
      totalIdleMinutes: 0,
      appSwitches: 0,
      distractionsDetected: 0,
      violationsCount: 0,
      gitCommitsCount: 0,
      productivityScore: null,
    };
  }

  private async emitStateTransition(
    userId: string,
    roundId: string,
    from: OperationalState,
    to: OperationalState,
    trigger: StateTrigger,
  ): Promise<void> {
    if (from === to) {
      return;
    }
    await this.events.emit({
      userId,
      roundId,
      eventType: OPERATIONAL_EVENTS.STATE_TRANSITION,
      eventData: { from, to, trigger },
      occurredAt: new Date(),
    });
  }
}
