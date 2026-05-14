import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthModule } from './modules/health/health.module';
import { TextGenerationModule } from './modules/text-generation/text-generation.module';
import { TtsModule } from './modules/tts/tts.module';
import { AnnouncementsModule } from './modules/announcements/announcements.module';
import { BehavioralAnalysisModule } from './modules/behavioral-analysis/behavioral-analysis.module';
import { CommonModule } from './modules/common/common.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
    }),
    CommonModule,
    HealthModule,
    TextGenerationModule,
    TtsModule,
    AnnouncementsModule,
    BehavioralAnalysisModule,
  ],
})
export class AppModule {}
