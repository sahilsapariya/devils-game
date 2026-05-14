import { Module } from '@nestjs/common';
import { AnnouncementsController } from './announcements.controller';
import { QualityGatesService } from './quality-gates.service';
import { FallbackTemplatesService } from './fallback-templates.service';
import { AnnouncementCacheService } from './announcement-cache.service';
import { TextGenerationModule } from '../text-generation/text-generation.module';
import { TtsModule } from '../tts/tts.module';

@Module({
  imports: [TextGenerationModule, TtsModule],
  controllers: [AnnouncementsController],
  providers: [QualityGatesService, FallbackTemplatesService, AnnouncementCacheService],
})
export class AnnouncementsModule {}
