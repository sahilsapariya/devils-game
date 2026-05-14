import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import {
  OPERATIONAL_EVENTS,
  type ConsequenceSeverity,
  type ConsequenceType,
} from '@extraction/shared';

import { ConsequenceEntity } from '../../database/entities/consequence.entity';
import { UserEntity } from '../../database/entities/user.entity';
import { EventsService } from '../events/events.service';

interface ConsequenceTemplate {
  consequenceType: ConsequenceType;
  severity: ConsequenceSeverity;
  description: string;
  reputationDelta: number;
}

/**
 * Hardcoded consequence rule table — keyed by [trigger][severity].
 * In Phase 3 this becomes a configurable DB-backed table.
 */
const CONSEQUENCE_RULES: Record<
  string,
  Record<ConsequenceSeverity, ConsequenceTemplate>
> = {
  round_failed: {
    low: {
      consequenceType: 'streak_break',
      severity: 'low',
      description: 'Round failed — streak reset.',
      reputationDelta: -5,
    },
    medium: {
      consequenceType: 'reputation_penalty',
      severity: 'medium',
      description: 'Round failed with multiple violations.',
      reputationDelta: -15,
    },
    high: {
      consequenceType: 'recovery_required',
      severity: 'high',
      description: 'Repeat failure — recovery round required.',
      reputationDelta: -30,
    },
    critical: {
      consequenceType: 'cooldown_imposed',
      severity: 'critical',
      description: '24-hour cooldown enforced.',
      reputationDelta: -50,
    },
  },
  distraction_threshold: {
    low: {
      consequenceType: 'reputation_penalty',
      severity: 'low',
      description: 'Distraction threshold crossed.',
      reputationDelta: -3,
    },
    medium: {
      consequenceType: 'reputation_penalty',
      severity: 'medium',
      description: 'Sustained distractions detected.',
      reputationDelta: -10,
    },
    high: {
      consequenceType: 'difficulty_reset',
      severity: 'high',
      description: 'Excessive distractions — difficulty reset.',
      reputationDelta: -20,
    },
    critical: {
      consequenceType: 'cooldown_imposed',
      severity: 'critical',
      description: 'Cooldown imposed for sustained distraction.',
      reputationDelta: -40,
    },
  },
};

@Injectable()
export class ConsequencesService {
  private readonly logger = new Logger(ConsequencesService.name);

  constructor(
    @InjectRepository(ConsequenceEntity)
    private readonly consequences: Repository<ConsequenceEntity>,
    @InjectRepository(UserEntity)
    private readonly users: Repository<UserEntity>,
    private readonly events: EventsService,
  ) {}

  resolveTemplate(
    trigger: keyof typeof CONSEQUENCE_RULES | string,
    severity: ConsequenceSeverity,
  ): ConsequenceTemplate | null {
    const bucket = CONSEQUENCE_RULES[trigger];
    if (!bucket) {
      return null;
    }
    return bucket[severity] ?? null;
  }

  async issueConsequence(
    userId: string,
    roundId: string | null,
    type: ConsequenceType,
    severity: ConsequenceSeverity,
    description: string,
    reputationDelta: number,
    metadata: Record<string, unknown> = {},
  ): Promise<ConsequenceEntity> {
    const issuedAt = new Date();
    const entity = this.consequences.create({
      userId,
      roundId,
      consequenceType: type,
      severity,
      description,
      reputationDelta,
      metadata,
      issuedAt,
    });
    const saved = await this.consequences.save(entity);

    if (reputationDelta !== 0) {
      const user = await this.users.findOne({ where: { id: userId } });
      if (user) {
        user.reputationScore = Math.max(0, user.reputationScore + reputationDelta);
        await this.users.save(user);
      }
    }

    await this.events.emit({
      userId,
      roundId,
      eventType: OPERATIONAL_EVENTS.CONSEQUENCE_ISSUED,
      eventData: {
        consequenceId: saved.id,
        consequenceType: type,
        severity,
        reputationDelta,
        description,
      },
      occurredAt: issuedAt,
    });

    return saved;
  }

  async issueByTrigger(
    userId: string,
    roundId: string | null,
    trigger: string,
    severity: ConsequenceSeverity,
    metadataExtras: Record<string, unknown> = {},
  ): Promise<ConsequenceEntity | null> {
    const template = this.resolveTemplate(trigger, severity);
    if (!template) {
      this.logger.warn(`No consequence template for ${trigger}/${severity}`);
      return null;
    }
    return this.issueConsequence(
      userId,
      roundId,
      template.consequenceType,
      template.severity,
      template.description,
      template.reputationDelta,
      { trigger, ...metadataExtras },
    );
  }

  async acknowledgeConsequence(
    consequenceId: string,
    userId: string,
  ): Promise<ConsequenceEntity> {
    const consequence = await this.consequences.findOne({
      where: { id: consequenceId },
    });
    if (!consequence || consequence.userId !== userId) {
      throw new NotFoundException('Consequence not found');
    }
    if (!consequence.acknowledgedAt) {
      consequence.acknowledgedAt = new Date();
      await this.consequences.save(consequence);
      await this.events.emit({
        userId,
        roundId: consequence.roundId,
        eventType: OPERATIONAL_EVENTS.CONSEQUENCE_ACKNOWLEDGED,
        eventData: { consequenceId },
        occurredAt: consequence.acknowledgedAt,
      });
    }
    return consequence;
  }

  async getConsequencesForUser(
    userId: string,
    limit = 50,
    offset = 0,
  ): Promise<{ items: ConsequenceEntity[]; total: number }> {
    const [items, total] = await this.consequences
      .createQueryBuilder('c')
      .where('c.user_id = :userId', { userId })
      .orderBy('c.issued_at', 'DESC')
      .take(limit)
      .skip(offset)
      .getManyAndCount();
    return { items, total };
  }

  async getActiveConsequences(userId: string): Promise<ConsequenceEntity[]> {
    return this.consequences.find({
      where: { userId, acknowledgedAt: IsNull() },
      order: { issuedAt: 'DESC' },
      take: 100,
    });
  }
}
