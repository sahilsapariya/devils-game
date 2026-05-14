import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AnnouncementEntity } from '../../database/entities/announcement.entity';
import { EventsModule } from '../events/events.module';
import { AiClientService } from './ai-client.service';
import { AnnouncementTemplatesService } from './announcement-templates.service';
import { AnnouncementsController } from './announcements.controller';
import { AnnouncementsService } from './announcements.service';

@Module({
  imports: [TypeOrmModule.forFeature([AnnouncementEntity]), EventsModule],
  controllers: [AnnouncementsController],
  providers: [AiClientService, AnnouncementTemplatesService, AnnouncementsService],
  exports: [AnnouncementsService, AiClientService, AnnouncementTemplatesService],
})
export class AnnouncementsModule {}
