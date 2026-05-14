import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  DEFAULT_DIFFICULTY,
  DIFFICULTY_BOUNDS,
  OPERATIONAL_EVENTS,
  type ConsequenceType,
  type RoundDifficulty,
} from '@extraction/shared';

import { RoundEntity } from '../../database/entities/round.entity';
import { UserEntity } from '../../database/entities/user.entity';
import { EventsService } from '../events/events.service';

const RECENT_ROUNDS_FOR_CEILING = 10;
const CEILING_MIN = 1;
const CEILING_MAX = 10;

const clampDimension = (value: number): number => {
  return Math.max(
    DIFFICULTY_BOUNDS.DIMENSION_MIN,
    Math.min(DIFFICULTY_BOUNDS.DIMENSION_MAX, value),
  );
};

@Injectable()
export class DifficultyEngineService {
  private readonly logger = new Logger(DifficultyEngineService.name);

  constructor(
    @InjectRepository(RoundEntity)
    private readonly rounds: Repository<RoundEntity>,
    @InjectRepository(UserEntity)
    private readonly users: Repository<UserEntity>,
    private readonly events: EventsService,
  ) {}

  /**
   * Analyse the last `RECENT_ROUNDS_FOR_CEILING` finalized rounds to compute
   * a sustainable difficulty ceiling — the highest mean difficulty at which
   * the user still hits `TARGET_SUCCESS_RATE`.
   */
  async calculateCeiling(userId: string): Promise<number> {
    const recent = await this.rounds
      .createQueryBuilder('round')
      .where('round.user_id = :userId', { userId })
      .andWhere('round.status IN (:...statuses)', {
        statuses: ['completed', 'failed', 'abandoned'],
      })
      .orderBy('round.actual_end', 'DESC')
      .take(RECENT_ROUNDS_FOR_CEILING)
      .getMany();

    if (recent.length === 0) {
      return Math.max(CEILING_MIN, DEFAULT_DIFFICULTY.timePressure);
    }

    const successes = recent.filter((r) => r.status === 'completed');
    const successRate = successes.length / recent.length;
    const avgDifficulty =
      recent.reduce(
        (sum, r) => sum + this.meanDifficulty(r.difficulty),
        0,
      ) / recent.length;

    // If success rate > target, push ceiling up; if lower, pull down.
    let ceiling = avgDifficulty;
    if (successRate >= DIFFICULTY_BOUNDS.TARGET_SUCCESS_RATE) {
      ceiling += 0.5 * (successRate - DIFFICULTY_BOUNDS.TARGET_SUCCESS_RATE) * 10;
    } else {
      ceiling -= 0.5 * (DIFFICULTY_BOUNDS.TARGET_SUCCESS_RATE - successRate) * 10;
    }

    return Math.max(CEILING_MIN, Math.min(CEILING_MAX, Number(ceiling.toFixed(2))));
  }

  /**
   * Return the difficulty vector for the next round.
   * Oscillates between 0.6x and 1.0x of the user's ceiling.
   */
  async getNextRoundDifficulty(
    userId: string,
    _missionId?: string,
  ): Promise<RoundDifficulty> {
    const user = await this.users.findOne({ where: { id: userId } });
    const ceiling = user
      ? user.difficultyCeiling
      : DEFAULT_DIFFICULTY.timePressure;

    // Oscillate between recovery floor and ceiling using completed-round count
    // as a deterministic phase variable.
    const recentCount = await this.rounds.count({
      where: { userId, status: 'completed' },
    });
    const phase = recentCount % 4; // cycles 0..3
    const ratios = [
      DIFFICULTY_BOUNDS.RECOVERY_DIFFICULTY_RATIO, // 0.6
      0.75,
      0.9,
      DIFFICULTY_BOUNDS.CEILING_USAGE_RATIO, // 0.85
    ];
    const ratio = ratios[phase] ?? 0.8;
    const target = clampDimension(ceiling * ratio);

    return {
      timePressure: target,
      distractionSensitivity: target,
      verificationStrictness: target,
      announcementFrequency: target,
      environmentalPressure: target,
      pointsMultiplier: Math.max(
        DIFFICULTY_BOUNDS.MULTIPLIER_MIN,
        Math.min(
          DIFFICULTY_BOUNDS.MULTIPLIER_MAX,
          1.0 + (target - DEFAULT_DIFFICULTY.timePressure) * 0.15,
        ),
      ),
    };
  }

  /**
   * Adjust difficulty in response to a consequence.
   *  - recovery_required: next round at 0.6x ceiling
   *  - difficulty_reset: ceiling reset to baseline
   *  - cooldown_imposed: ceiling halved, 24h block flagged
   */
  async applyConsequenceAdjustment(
    userId: string,
    consequenceType: ConsequenceType,
  ): Promise<RoundDifficulty> {
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    let newCeiling = user.difficultyCeiling;
    let pointsMultiplier = 1.0;

    switch (consequenceType) {
      case 'streak_break':
      case 'reputation_penalty':
        // No ceiling change; next round just inherits.
        break;
      case 'recovery_required':
        newCeiling = Math.max(
          CEILING_MIN,
          newCeiling * DIFFICULTY_BOUNDS.RECOVERY_DIFFICULTY_RATIO,
        );
        pointsMultiplier = 0.5;
        break;
      case 'difficulty_reset':
        newCeiling = DEFAULT_DIFFICULTY.timePressure;
        pointsMultiplier = 0.75;
        break;
      case 'cooldown_imposed':
        newCeiling = Math.max(CEILING_MIN, newCeiling / 2);
        pointsMultiplier = 0.5;
        break;
    }

    if (newCeiling !== user.difficultyCeiling) {
      user.difficultyCeiling = Number(newCeiling.toFixed(2));
      await this.users.save(user);
      await this.events.emit({
        userId,
        roundId: null,
        eventType: OPERATIONAL_EVENTS.DIFFICULTY_CEILING_UPDATED,
        eventData: {
          newCeiling: user.difficultyCeiling,
          trigger: consequenceType,
        },
        occurredAt: new Date(),
      });
    }

    const target = clampDimension(newCeiling * DIFFICULTY_BOUNDS.RECOVERY_DIFFICULTY_RATIO);
    const next: RoundDifficulty = {
      timePressure: target,
      distractionSensitivity: target,
      verificationStrictness: target,
      announcementFrequency: target,
      environmentalPressure: target,
      pointsMultiplier,
    };

    await this.events.emit({
      userId,
      roundId: null,
      eventType: OPERATIONAL_EVENTS.DIFFICULTY_ADJUSTED,
      eventData: { next, trigger: consequenceType },
      occurredAt: new Date(),
    });

    return next;
  }

  /**
   * Recompute and persist the user's ceiling after a round.
   */
  async updateCeiling(userId: string): Promise<number> {
    const ceiling = await this.calculateCeiling(userId);
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) {
      return ceiling;
    }
    if (user.difficultyCeiling !== Math.round(ceiling)) {
      user.difficultyCeiling = Math.round(ceiling);
      await this.users.save(user);
      await this.events.emit({
        userId,
        roundId: null,
        eventType: OPERATIONAL_EVENTS.DIFFICULTY_CEILING_UPDATED,
        eventData: { newCeiling: user.difficultyCeiling, trigger: 'auto' },
        occurredAt: new Date(),
      });
    }
    return ceiling;
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  private meanDifficulty(d: RoundDifficulty | null | undefined): number {
    if (!d) {
      return DEFAULT_DIFFICULTY.timePressure;
    }
    return (
      (d.timePressure +
        d.distractionSensitivity +
        d.verificationStrictness +
        d.announcementFrequency +
        d.environmentalPressure) /
      5
    );
  }
}
