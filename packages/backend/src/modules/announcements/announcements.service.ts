import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import {
  OPERATIONAL_EVENTS,
  type AnnouncementCategory,
  type AnnouncementTone,
} from '@extraction/shared';

import { AnnouncementEntity } from '../../database/entities/announcement.entity';
import { EventsService } from '../events/events.service';
import { AiClientService } from './ai-client.service';
import {
  AnnouncementTemplatesService,
  type TemplateContext,
} from './announcement-templates.service';

export interface GenerateAndQueueInput {
  userId: string;
  roundId: string | null;
  type: string;
  context: TemplateContext & Record<string, unknown>;
}

@Injectable()
export class AnnouncementsService {
  private readonly logger = new Logger(AnnouncementsService.name);

  constructor(
    @InjectRepository(AnnouncementEntity)
    private readonly announcements: Repository<AnnouncementEntity>,
    private readonly aiClient: AiClientService,
    private readonly templates: AnnouncementTemplatesService,
    private readonly events: EventsService,
  ) {}

  async generateAndQueue(
    input: GenerateAndQueueInput,
  ): Promise<AnnouncementEntity> {
    let content = '';
    let voiceUrl: string | null = null;
    let duration: number | null = null;
    let aiGenerated = false;

    try {
      const aiResult = await this.aiClient.generateAnnouncement({
        type: input.type,
        context: input.context,
      });
      if (aiResult && !aiResult.fallbackUsed) {
        content = aiResult.message;
        voiceUrl = aiResult.voiceUrl ?? null;
        duration = aiResult.durationSec;
        aiGenerated = true;
      }
    } catch (error) {
      this.logger.warn(
        `AI announcement generation failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    let category: AnnouncementCategory = 'ambient_presence';
    let tone: AnnouncementTone = 'calm';

    if (!content) {
      const rendered = this.templates.render(input.type, input.context);
      content = rendered.content;
      category = rendered.category;
      tone = rendered.tone;
    } else {
      const rendered = this.templates.render(input.type, input.context);
      category = rendered.category;
      tone = rendered.tone;
    }

    const entity = this.announcements.create({
      userId: input.userId,
      roundId: input.roundId,
      category,
      tone,
      content,
      voiceUrl,
      audioDurationSeconds: duration,
      aiGenerated,
      qualityGatePassed: aiGenerated,
      metadata: { source: aiGenerated ? 'ai' : 'template', type: input.type },
      scheduledFor: new Date(),
    });
    const saved = await this.announcements.save(entity);

    await this.events.emit({
      userId: input.userId,
      roundId: input.roundId,
      eventType: OPERATIONAL_EVENTS.ANNOUNCEMENT_GENERATED,
      eventData: {
        announcementId: saved.id,
        category,
        tone,
        aiGenerated,
      },
      occurredAt: new Date(),
    });

    return saved;
  }

  async markPlayed(announcementId: string): Promise<AnnouncementEntity> {
    const ann = await this.announcements.findOne({ where: { id: announcementId } });
    if (!ann) {
      throw new NotFoundException('Announcement not found');
    }
    if (!ann.deliveredAt) {
      ann.deliveredAt = new Date();
      await this.announcements.save(ann);
      await this.events.emit({
        userId: ann.userId,
        roundId: ann.roundId,
        eventType: OPERATIONAL_EVENTS.ANNOUNCEMENT_PLAYED,
        eventData: { announcementId },
        occurredAt: ann.deliveredAt,
      });
    }
    return ann;
  }

  async markAcknowledged(
    announcementId: string,
    userId: string,
  ): Promise<AnnouncementEntity> {
    const ann = await this.announcements.findOne({ where: { id: announcementId } });
    if (!ann || ann.userId !== userId) {
      throw new NotFoundException('Announcement not found');
    }
    if (!ann.acknowledgedAt) {
      ann.acknowledgedAt = new Date();
      await this.announcements.save(ann);
      await this.events.emit({
        userId,
        roundId: ann.roundId,
        eventType: OPERATIONAL_EVENTS.ANNOUNCEMENT_ACKNOWLEDGED,
        eventData: { announcementId },
        occurredAt: ann.acknowledgedAt,
      });
    }
    return ann;
  }

  async getPendingAnnouncements(
    userId: string,
  ): Promise<AnnouncementEntity[]> {
    return this.announcements.find({
      where: { userId, deliveredAt: IsNull() },
      order: { scheduledFor: 'ASC' },
      take: 50,
    });
  }

  async getForRound(roundId: string): Promise<AnnouncementEntity[]> {
    return this.announcements.find({
      where: { roundId },
      order: { scheduledFor: 'ASC' },
      take: 200,
    });
  }

  async listForUser(
    userId: string,
    filters: { status?: 'pending' | 'delivered'; roundId?: string },
    limit = 50,
    offset = 0,
  ): Promise<{ items: AnnouncementEntity[]; total: number }> {
    const qb = this.announcements
      .createQueryBuilder('a')
      .where('a.user_id = :userId', { userId })
      .orderBy('a.scheduled_for', 'DESC')
      .take(limit)
      .skip(offset);

    if (filters.roundId) {
      qb.andWhere('a.round_id = :roundId', { roundId: filters.roundId });
    }
    if (filters.status === 'pending') {
      qb.andWhere('a.delivered_at IS NULL');
    } else if (filters.status === 'delivered') {
      qb.andWhere('a.delivered_at IS NOT NULL');
    }

    const [items, total] = await qb.getManyAndCount();
    return { items, total };
  }
}
